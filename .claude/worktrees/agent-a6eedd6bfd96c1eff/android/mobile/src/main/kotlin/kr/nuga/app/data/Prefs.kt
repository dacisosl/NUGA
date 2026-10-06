package kr.nuga.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "nuga_prefs")

/** Non-secret app settings and sync bookkeeping (DataStore). */
class Prefs(private val context: Context) {
    private val ds get() = context.dataStore

    data class Settings(
        val showNames: Boolean = false,
        val widgetHint: Boolean = true,
        val autoOpenNotify: Boolean = false,
        val lastSyncAt: String = "",
        val lastSyncError: String = "",
        val relayCursor: String = "",
        val deviceId: String = "",
    )

    val settings: Flow<Settings> = ds.data.map { p ->
        Settings(
            showNames = p[SHOW_NAMES] ?: false,
            widgetHint = p[WIDGET_HINT] ?: true,
            autoOpenNotify = p[AUTO_OPEN_NOTIFY] ?: false,
            lastSyncAt = p[LAST_SYNC_AT] ?: "",
            lastSyncError = p[LAST_SYNC_ERROR] ?: "",
            relayCursor = p[RELAY_CURSOR] ?: "",
            deviceId = p[DEVICE_ID] ?: "",
        )
    }

    suspend fun current(): Settings = settings.first()

    suspend fun deviceId(): String {
        val existing = ds.data.first()[DEVICE_ID]
        if (!existing.isNullOrEmpty()) return existing
        val id = UUID.randomUUID().toString()
        ds.edit { it[DEVICE_ID] = id }
        return id
    }

    suspend fun setShowNames(value: Boolean) = ds.edit { it[SHOW_NAMES] = value }
    suspend fun setWidgetHint(value: Boolean) = ds.edit { it[WIDGET_HINT] = value }
    suspend fun setAutoOpenNotify(value: Boolean) = ds.edit { it[AUTO_OPEN_NOTIFY] = value }
    suspend fun setLastSync(at: String, error: String) = ds.edit {
        it[LAST_SYNC_AT] = at
        it[LAST_SYNC_ERROR] = error
    }
    suspend fun setRelayCursor(id: String) = ds.edit { it[RELAY_CURSOR] = id }
    suspend fun clearSyncState() = ds.edit {
        it.remove(LAST_SYNC_AT); it.remove(LAST_SYNC_ERROR); it.remove(RELAY_CURSOR)
    }

    suspend fun lastNo(classLabel: String): Int? = ds.data.first()[stringPreferencesKey("last_no_$classLabel")]?.toIntOrNull()
    suspend fun setLastNo(classLabel: String, no: Int) = ds.edit { it[stringPreferencesKey("last_no_$classLabel")] = no.toString() }

    companion object {
        private val SHOW_NAMES = booleanPreferencesKey("show_names")
        private val WIDGET_HINT = booleanPreferencesKey("widget_hint")
        private val AUTO_OPEN_NOTIFY = booleanPreferencesKey("auto_open_notify")
        private val LAST_SYNC_AT = stringPreferencesKey("last_sync_at")
        private val LAST_SYNC_ERROR = stringPreferencesKey("last_sync_error")
        private val RELAY_CURSOR = stringPreferencesKey("relay_cursor")
        private val DEVICE_ID = stringPreferencesKey("device_id")
    }
}
