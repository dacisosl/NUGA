package kr.nuga.app.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.DataLayerPaths
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.WearAck

/** Phone → watch side of PROTOCOL.md §5. Names never cross this bridge. */
class WearBridge(private val context: Context) {
    private val dataClient get() = Wearable.getDataClient(context)
    private val messageClient get() = Wearable.getMessageClient(context)

    /** Publishes the config (roster removed) as a DataItem so any connected/connecting watch receives it. */
    suspend fun pushConfig(config: Config) {
        val stripped = config.withoutRoster()
        val json = NugaJson.encodeToString(Config.serializer(), stripped)
        val request = PutDataMapRequest.create(DataLayerPaths.CONFIG).apply {
            dataMap.putString(DataLayerPaths.CONFIG_KEY_JSON, json)
            dataMap.putString(DataLayerPaths.CONFIG_KEY_UPDATED_AT, stripped.updatedAt)
            dataMap.putLong("pushedAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        dataClient.putDataItem(request).await()
        Log.i(TAG, "config pushed to watch (${json.length} bytes)")
    }

    suspend fun clearConfig() {
        val uri = android.net.Uri.Builder().scheme("wear").path(DataLayerPaths.CONFIG).build()
        dataClient.deleteDataItems(uri).await()
    }

    suspend fun sendAck(nodeId: String, recordId: String) {
        val payload = NugaJson.encodeToString(WearAck.serializer(), WearAck(recordId)).toByteArray(Charsets.UTF_8)
        messageClient.sendMessage(nodeId, DataLayerPaths.ACK, payload).await()
    }

    private companion object {
        const val TAG = "WearBridge"
    }
}
