package kr.nuga.wear.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record
import kr.nuga.shared.time.NugaTime

private val Context.watchDataStore: DataStore<Preferences> by preferencesDataStore(name = "nuga_watch")

/**
 * Watch-local persistence: config (never contains names), the outgoing queue, and today's saved records.
 * DataStore is enough here; the watch holds at most a few hundred small rows.
 */
class WatchStore(private val context: Context) {
    private val ds get() = context.watchDataStore
    private val listSer = ListSerializer(Record.serializer())

    val config: Flow<Config?> = ds.data.map { p -> p[CONFIG_JSON]?.let(::parseConfig) }
    val queue: Flow<List<Record>> = ds.data.map { p -> parseList(p[QUEUE_JSON]) }
    val saved: Flow<List<Record>> = ds.data.map { p -> parseList(p[SAVED_JSON]) }
    /** "" = follow config.options.autoLaunchWatch; "on"/"off" = user override on the watch. */
    val autoLaunchOverride: Flow<String> = ds.data.map { p -> p[AUTO_LAUNCH] ?: "" }

    suspend fun currentConfig(): Config? = config.first()
    suspend fun currentQueue(): List<Record> = queue.first()

    suspend fun setConfigJson(json: String) {
        // Defensive: the phone already strips the roster, but never keep names on the watch.
        val cfg = parseConfig(json) ?: return
        val stripped = NugaJson.encodeToString(Config.serializer(), cfg.withoutRoster())
        ds.edit { it[CONFIG_JSON] = stripped }
    }

    suspend fun clearConfig() = ds.edit { it.remove(CONFIG_JSON) }

    suspend fun enqueue(record: Record) = ds.edit { p ->
        val list = parseList(p[QUEUE_JSON]).filterNot { it.id == record.id } + record
        p[QUEUE_JSON] = NugaJson.encodeToString(listSer, list)
    }

    suspend fun removeFromQueue(id: String) = ds.edit { p ->
        val list = parseList(p[QUEUE_JSON]).filterNot { it.id == id }
        p[QUEUE_JSON] = NugaJson.encodeToString(listSer, list)
    }

    /** Remember a record as saved today (for the count) and prune older days. */
    suspend fun addSaved(record: Record) = ds.edit { p ->
        val today = NugaTime.todayIso()
        val list = parseList(p[SAVED_JSON]).filter { it.time.startsWith(today) }.filterNot { it.id == record.id } + record
        p[SAVED_JSON] = NugaJson.encodeToString(listSer, list)
        p[stringPreferencesKey("last_no_${record.classLabel}")] = record.no.toString()
    }

    suspend fun removeSaved(id: String) = ds.edit { p ->
        val list = parseList(p[SAVED_JSON]).filterNot { it.id == id }
        p[SAVED_JSON] = NugaJson.encodeToString(listSer, list)
    }

    suspend fun lastNo(classLabel: String): Int? = ds.data.first()[stringPreferencesKey("last_no_$classLabel")]?.toIntOrNull()

    suspend fun setAutoLaunchOverride(value: String) = ds.edit { it[AUTO_LAUNCH] = value }

    suspend fun effectiveAutoLaunch(): Boolean {
        val p = ds.data.first()
        return when (p[AUTO_LAUNCH]) {
            "on" -> true
            "off" -> false
            else -> p[CONFIG_JSON]?.let(::parseConfig)?.options?.autoLaunchWatch ?: false
        }
    }

    private fun parseConfig(json: String): Config? =
        runCatching { NugaJson.decodeFromString(Config.serializer(), json) }.getOrNull()

    private fun parseList(json: String?): List<Record> =
        if (json.isNullOrEmpty()) emptyList() else runCatching { NugaJson.decodeFromString(listSer, json) }.getOrDefault(emptyList())

    private companion object {
        val CONFIG_JSON = stringPreferencesKey("config_json")
        val QUEUE_JSON = stringPreferencesKey("queue_json")
        val SAVED_JSON = stringPreferencesKey("saved_json")
        val AUTO_LAUNCH = stringPreferencesKey("auto_launch_override")
    }
}
