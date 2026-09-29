package kr.nuga.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.work.Configuration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kr.nuga.app.alarm.LessonAlarmScheduler
import kr.nuga.app.data.ConfigRepository
import kr.nuga.app.data.Prefs
import kr.nuga.app.data.RecordRepository
import kr.nuga.app.data.SecureStore
import kr.nuga.app.data.db.NugaDatabase
import kr.nuga.app.sync.RelayApi
import kr.nuga.app.sync.SyncRepository
import kr.nuga.app.sync.SyncScheduler
import kr.nuga.app.wear.WearBridge
import kr.nuga.app.widget.WidgetUpdater

/** Simple service locator (no DI framework). */
class AppGraph(val app: Application) {
    val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val db: NugaDatabase by lazy { NugaDatabase.get(app) }
    val prefs: Prefs by lazy { Prefs(app) }
    val secure: SecureStore by lazy { SecureStore(app) }
    val wearBridge: WearBridge by lazy { WearBridge(app) }
    val configRepo: ConfigRepository by lazy { ConfigRepository(app, db.configDao(), prefs, wearBridge, scope) }
    val recordRepo: RecordRepository by lazy { RecordRepository(app, db, prefs, configRepo, scope) }
    val relay: RelayApi by lazy { RelayApi() }
    val syncRepo: SyncRepository by lazy { SyncRepository(app, db, prefs, secure, relay, configRepo, recordRepo) }
}

class NugaApp : Application(), Configuration.Provider {
    lateinit var graph: AppGraph
        private set

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setMinimumLoggingLevel(android.util.Log.INFO).build()

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        createChannels()
        SyncScheduler.ensurePeriodic(this)
        graph.scope.launch {
            LessonAlarmScheduler.reschedule(this@NugaApp)
            WidgetUpdater.updateAll(this@NugaApp)
        }
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_LESSON, getString(R.string.channel_lesson), NotificationManager.IMPORTANCE_HIGH).apply {
                description = "수업 시작 알림"
                enableVibration(true)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SYNC, getString(R.string.channel_sync), NotificationManager.IMPORTANCE_LOW),
        )
    }

    companion object {
        const val CHANNEL_LESSON = "lesson"
        const val CHANNEL_SYNC = "sync"
    }
}

val Context.graph: AppGraph
    get() = (applicationContext as NugaApp).graph
