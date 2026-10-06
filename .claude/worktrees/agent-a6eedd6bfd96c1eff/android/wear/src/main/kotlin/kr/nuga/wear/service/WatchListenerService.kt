package kr.nuga.wear.service

import android.util.Log
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kr.nuga.shared.model.DataLayerPaths
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.WearAck
import kr.nuga.wear.alarm.WatchAlarmScheduler
import kr.nuga.wear.watchGraph

/** Receives config (`/nuga/config` DataItem) and acks (`/nuga/ack` message) from the phone. */
class WatchListenerService : WearableListenerService() {

    override fun onDataChanged(events: DataEventBuffer) {
        val g = applicationContext.watchGraph
        for (event in events) {
            val item = event.dataItem
            if (item.uri.path != DataLayerPaths.CONFIG) continue
            runBlocking(Dispatchers.IO) {
                when (event.type) {
                    DataEvent.TYPE_CHANGED -> {
                        val json = DataMapItem.fromDataItem(item).dataMap.getString(DataLayerPaths.CONFIG_KEY_JSON) ?: return@runBlocking
                        g.store.setConfigJson(json)
                        Log.i(TAG, "config received (${json.length} bytes)")
                    }
                    DataEvent.TYPE_DELETED -> g.store.clearConfig()
                }
                WatchAlarmScheduler.reschedule(applicationContext)
            }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != DataLayerPaths.ACK) return
        val ack = runCatching { NugaJson.decodeFromString(WearAck.serializer(), String(event.data, Charsets.UTF_8)) }.getOrNull() ?: return
        val g = applicationContext.watchGraph
        runBlocking(Dispatchers.IO) { g.sync.onAck(ack.id) }
    }

    /** Phone became reachable: retry the queue. */
    override fun onCapabilityChanged(info: CapabilityInfo) {
        if (info.name != DataLayerPaths.PHONE_CAPABILITY) return
        val g = applicationContext.watchGraph
        runBlocking(Dispatchers.IO) {
            withTimeoutOrNull(8_000) { g.sync.flush() }
        }
    }

    private companion object {
        const val TAG = "WatchListener"
    }
}
