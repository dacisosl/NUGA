package kr.nuga.wear.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kr.nuga.shared.model.DataLayerPaths
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record

/** Watch → phone over MessageClient `/nuga/record`; rows stay queued until `/nuga/ack` arrives. */
class WatchSync(private val context: Context, private val store: WatchStore) {
    private val mutex = Mutex()
    private val _phoneConnected = MutableStateFlow(false)
    val phoneConnected: StateFlow<Boolean> get() = _phoneConnected

    suspend fun enqueueAndSend(record: Record) {
        store.enqueue(record)
        flush()
    }

    /** Sends every queued record to the phone. Returns the number of successful sends. */
    suspend fun flush(): Int = mutex.withLock {
        val queue = store.currentQueue()
        if (queue.isEmpty()) {
            refreshConnection()
            return 0
        }
        val nodes = phoneNodes()
        _phoneConnected.value = nodes.isNotEmpty()
        if (nodes.isEmpty()) return 0
        var sent = 0
        for (record in queue) {
            val bytes = NugaJson.encodeToString(Record.serializer(), record).toByteArray(Charsets.UTF_8)
            for (node in nodes) {
                val ok = runCatching { Wearable.getMessageClient(context).sendMessage(node, DataLayerPaths.RECORD, bytes).await() }
                    .onFailure { Log.w(TAG, "send failed: ${it.message}") }
                    .isSuccess
                if (ok) { sent++; break }
            }
        }
        return sent
    }

    suspend fun onAck(id: String) {
        store.removeFromQueue(id)
    }

    suspend fun refreshConnection() {
        _phoneConnected.value = runCatching { phoneNodes().isNotEmpty() }.getOrDefault(false)
    }

    private suspend fun phoneNodes(): List<String> {
        val byCapability = runCatching {
            Wearable.getCapabilityClient(context)
                .getCapability(DataLayerPaths.PHONE_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
                .await().nodes.map { it.id }
        }.getOrDefault(emptyList())
        if (byCapability.isNotEmpty()) return byCapability
        return runCatching { Wearable.getNodeClient(context).connectedNodes.await().map { it.id } }.getOrDefault(emptyList())
    }

    private companion object {
        const val TAG = "WatchSync"
    }
}
