package kr.nuga.wear

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kr.nuga.wear.alarm.WatchAlarmScheduler
import kr.nuga.wear.data.WatchStore
import kr.nuga.wear.data.WatchSync

class WatchGraph(val app: Application) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val store: WatchStore by lazy { WatchStore(app) }
    val sync: WatchSync by lazy { WatchSync(app, store) }
}

class WatchApp : Application() {
    lateinit var graph: WatchGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = WatchGraph(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_LESSON, getString(R.string.channel_lesson), NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
            },
        )
        graph.scope.launch {
            WatchAlarmScheduler.reschedule(this@WatchApp)
            graph.sync.flush()
        }
    }

    companion object {
        const val CHANNEL_LESSON = "lesson"
    }
}

val Context.watchGraph: WatchGraph
    get() = (applicationContext as WatchApp).graph
