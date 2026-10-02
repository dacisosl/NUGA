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
        _speechKeys.value = readSpeechKeys()
    }

    /* ---- 음성 변환용 API 키 (PC 가 E2E 로 보내 준 것만) ---- */

    data class SpeechKeys(val gemini: String = "", val openrouter: String = "") {
        fun forProvider(p: String): String = if (p == "openrouter") openrouter else gemini
    }

    private val _speechKeys = MutableStateFlow(readSpeechKeys())
    val speechKeys: StateFlow<SpeechKeys> get() = _speechKeys

    /** null 은 그대로 두고, 빈 문자열은 지운다 */
    fun saveSpeechKeys(gemini: String?, openrouter: String?) {
        val e = prefs.edit()
        gemini?.let { if (it.isEmpty()) e.remove(GEMINI) else e.putString(GEMINI, it) }
        openrouter?.let { if (it.isEmpty()) e.remove(OPENROUTER) else e.putString(OPENROUTER, it) }
        e.apply()
        _speechKeys.value = readSpeechKeys()
    }

    private fun readSpeechKeys() = SpeechKeys(prefs.getString(GEMINI, "") ?: "", prefs.getString(OPENROUTER, "") ?: "")

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
        const val GEMINI = "speech_gemini"
        const val OPENROUTER = "speech_openrouter"
    }
}
