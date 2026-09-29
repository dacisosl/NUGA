package kr.nuga.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kr.nuga.shared.sync.Pairing
import kr.nuga.shared.sync.SyncCrypto

/** Sync key + relay info in EncryptedSharedPreferences (Android Keystore backed). Never leaves the device. */
class SecureStore(context: Context) {

    data class PairingInfo(
        val key: ByteArray,
        val keyId: String,
        val relayUrl: String,
        val pcName: String,
        val pairedAt: String,
    ) {
        val keyIdShort: String get() = keyId.take(8)
    }

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            "nuga_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _state = MutableStateFlow(read())
    val state: StateFlow<PairingInfo?> get() = _state

    fun get(): PairingInfo? = _state.value

    fun isPaired(): Boolean = _state.value != null

    fun save(pairing: Pairing, pairedAt: String) {
        prefs.edit()
            .putString(KEY_B64, SyncCrypto.base64Encode(pairing.key))
            .putString(KEY_ID, pairing.keyId)
            .putString(RELAY, pairing.relayUrl)
            .putString(PC_NAME, pairing.pcName)
            .putString(PAIRED_AT, pairedAt)
            .apply()
        _state.value = read()
    }

    fun clear() {
        prefs.edit().clear().apply()
        _state.value = null
    }

    private fun read(): PairingInfo? {
        val keyB64 = prefs.getString(KEY_B64, null) ?: return null
        val key = runCatching { SyncCrypto.base64Decode(keyB64) }.getOrNull() ?: return null
        if (key.size != SyncCrypto.KEY_BYTES) return null
        return PairingInfo(
            key = key,
            keyId = prefs.getString(KEY_ID, null) ?: SyncCrypto.keyId(key),
            relayUrl = prefs.getString(RELAY, "") ?: "",
            pcName = prefs.getString(PC_NAME, "") ?: "",
            pairedAt = prefs.getString(PAIRED_AT, "") ?: "",
        )
    }

    private companion object {
        const val KEY_B64 = "key_b64"
        const val KEY_ID = "key_id"
        const val RELAY = "relay_url"
        const val PC_NAME = "pc_name"
        const val PAIRED_AT = "paired_at"
    }
}
