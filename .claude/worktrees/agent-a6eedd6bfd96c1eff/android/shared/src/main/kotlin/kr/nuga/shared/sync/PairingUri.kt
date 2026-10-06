package kr.nuga.shared.sync

import java.net.URLDecoder
import java.net.URLEncoder

/** Parsed QR payload: `nuga://pair?v=1&k=<base64url(K)>&r=<relay>&n=<pc name>` (PROTOCOL.md §1). */
data class Pairing(
    val version: Int,
    val key: ByteArray,
    val keyId: String,
    val relayUrl: String,
    val pcName: String,
) {
    override fun equals(other: Any?): Boolean =
        other is Pairing && other.version == version && other.key.contentEquals(key) &&
            other.relayUrl == relayUrl && other.pcName == pcName

    override fun hashCode(): Int = keyId.hashCode()
}

object PairingUri {
    const val SCHEME = "nuga"
    const val HOST = "pair"
    const val PREFIX = "$SCHEME://$HOST"

    /** Returns null when the text is not a valid pairing URI. */
    fun parse(text: String): Pairing? {
        val trimmed = text.trim()
        if (!trimmed.startsWith(PREFIX, ignoreCase = true)) return null
        val qIndex = trimmed.indexOf('?')
        if (qIndex < 0) return null
        val query = trimmed.substring(qIndex + 1)
        val params = LinkedHashMap<String, String>()
        for (pair in query.split('&')) {
            if (pair.isEmpty()) continue
            val eq = pair.indexOf('=')
            val rawKey = if (eq >= 0) pair.substring(0, eq) else pair
            val rawValue = if (eq >= 0) pair.substring(eq + 1) else ""
            params[decode(rawKey)] = rawValue
        }
        val version = params["v"]?.toIntOrNull() ?: return null
        if (version != 1) return null
        val kRaw = params["k"] ?: return null
        val key = runCatching { SyncCrypto.base64UrlDecode(decode(kRaw)) }.getOrNull() ?: return null
        if (key.size != SyncCrypto.KEY_BYTES) return null
        val relay = params["r"]?.let { decode(it) }?.trim()?.trimEnd('/') ?: return null
        if (relay.isEmpty()) return null
        val name = params["n"]?.let { decode(it) } ?: ""
        return Pairing(
            version = version,
            key = key,
            keyId = SyncCrypto.keyId(key),
            relayUrl = relay,
            pcName = name,
        )
    }

    fun build(key: ByteArray, relayUrl: String, pcName: String): String =
        "$PREFIX?v=1&k=${SyncCrypto.base64UrlEncode(key)}&r=${encode(relayUrl)}&n=${encode(pcName)}"

    private fun decode(s: String): String =
        // encodeURIComponent never emits '+', but URLDecoder would turn one into a space; keep it literal.
        URLDecoder.decode(s.replace("+", "%2B"), "UTF-8")

    private fun encode(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
}
