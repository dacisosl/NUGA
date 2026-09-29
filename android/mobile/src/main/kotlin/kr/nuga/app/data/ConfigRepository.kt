package kr.nuga.app.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kr.nuga.app.alarm.LessonAlarmScheduler
import kr.nuga.app.data.db.ConfigDao
import kr.nuga.app.data.db.ConfigEntity
import kr.nuga.app.wear.WearBridge
import kr.nuga.app.widget.WidgetUpdater
import kr.nuga.shared.demo.DemoConfig
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.time.NugaTime

/** Config cache (from PC via relay, or demo). Forwards every change to the watch (roster stripped). */
class ConfigRepository(
    private val context: Context,
    private val dao: ConfigDao,
    private val prefs: Prefs,
    private val wearBridge: WearBridge,
    private val scope: CoroutineScope,
) {
    object Source {
        const val PC = "pc"
        const val DEMO = "demo"
    }

    val entity: Flow<ConfigEntity?> = dao.observe()

    val config: StateFlow<Config?> = dao.observe()
        .map { it?.let(::parse) }
        .stateIn(scope, SharingStarted.Eagerly, null)

    suspend fun current(): Config? = dao.get()?.let(::parse)

    suspend fun currentSource(): String? = dao.get()?.source

    /** Persist a new config, unless the cached one is newer. Returns true if applied. */
    suspend fun apply(config: Config, source: String): Boolean {
        val existing = dao.get()
        if (existing != null && existing.source == Source.PC && source == Source.PC &&
            existing.updatedAt.isNotEmpty() && config.updatedAt.isNotEmpty() && config.updatedAt < existing.updatedAt
        ) {
            Log.i(TAG, "ignoring older config ${config.updatedAt} < ${existing.updatedAt}")
            return false
        }
        dao.put(
            ConfigEntity(
                json = NugaJson.encodeToString(Config.serializer(), config),
                updatedAt = config.updatedAt,
                receivedAt = NugaTime.nowIso(),
                source = source,
            ),
        )
        onChanged(config)
        return true
    }

    suspend fun loadDemo(): Config {
        val demo = DemoConfig.create()
        apply(demo, Source.DEMO)
        return demo
    }

    suspend fun clear() {
        dao.clear()
        scope.launch {
            runCatching { wearBridge.clearConfig() }
            LessonAlarmScheduler.reschedule(context)
            WidgetUpdater.updateAll(context)
        }
    }

    suspend fun awaitLoaded(): Config? = config.value ?: current()

    private fun onChanged(config: Config) {
        scope.launch {
            runCatching { wearBridge.pushConfig(config.withoutRoster()) }
                .onFailure { Log.w(TAG, "wear push failed: ${it.message}") }
            LessonAlarmScheduler.reschedule(context)
            WidgetUpdater.updateAll(context)
        }
    }

    private fun parse(entity: ConfigEntity): Config? =
        runCatching { NugaJson.decodeFromString(Config.serializer(), entity.json) }
            .onFailure { Log.w(TAG, "bad config json: ${it.message}") }
            .getOrNull()

    private companion object {
        const val TAG = "ConfigRepository"
    }
}
