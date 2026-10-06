package kr.nuga.app.wear

import android.util.Log
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kr.nuga.app.graph
import kr.nuga.shared.model.DataLayerPaths
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record

/** Receives `/nuga/record` from the watch, stores it (source=watch), replies `/nuga/ack`. */
class PhoneWearListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != DataLayerPaths.RECORD) return
        val text = String(event.data, Charsets.UTF_8)
        val record = runCatching { NugaJson.decodeFromString(Record.serializer(), text) }
            .onFailure { Log.w(TAG, "bad record from watch: ${it.message}") }
            .getOrNull() ?: return
        val g = applicationContext.graph
        runBlocking(Dispatchers.IO) {
            runCatching { g.recordRepo.ingestFromWatch(record) }
                .onFailure { Log.w(TAG, "insert failed: ${it.message}") }
            withTimeoutOrNull(5_000) {
                runCatching { g.wearBridge.sendAck(event.sourceNodeId, record.id) }
                    .onFailure { Log.w(TAG, "ack failed: ${it.message}") }
            }
        }
    }

    /** A watch appeared: re-publish the current config so a freshly installed watch app gets it. */
    override fun onCapabilityChanged(info: CapabilityInfo) {
        if (info.name != DataLayerPaths.WATCH_CAPABILITY || info.nodes.isEmpty()) return
        val g = applicationContext.graph
        runBlocking(Dispatchers.IO) {
            val config = g.configRepo.current() ?: return@runBlocking
            withTimeoutOrNull(5_000) {
                runCatching { g.wearBridge.pushConfig(config) }
            }
        }
    }

    private companion object {
        const val TAG = "PhoneWearListener"
    }
}
