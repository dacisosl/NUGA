package kr.nuga.shared.sync

import kr.nuga.shared.model.Envelope
import kr.nuga.shared.model.Message
import kr.nuga.shared.model.NugaJson
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * E2E encryption per PROTOCOL.md §2.
 * AES-256-GCM, 12-byte random IV per message, 128-bit tag appended to ciphertext,
 * AAD = keyId (UTF-8), key = the raw 32-byte sync key.
 */
object SyncCrypto {
    const val KEY_BYTES = 32
    const val IV_BYTES = 12
    const val TAG_BITS = 128

    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private val random = SecureRandom()

    /** keyId = first 8 bytes of SHA-256(key), lowercase hex (16 chars). */
    fun keyId(key: ByteArray): String {
        require(key.size == KEY_BYTES) { "sync key must be $KEY_BYTES bytes" }
        val digest = MessageDigest.getInstance("SHA-256").digest(key)
        return toHex(digest.copyOfRange(0, 8))
    }

    fun isValidKeyId(keyId: String): Boolean = Regex("^[0-9a-f]{16}$").matches(keyId)

    fun randomIv(): ByteArray = ByteArray(IV_BYTES).also { random.nextBytes(it) }

    fun encrypt(key: ByteArray, keyId: String, plaintext: ByteArray, iv: ByteArray = randomIv()): Pair<ByteArray, ByteArray> {
        require(iv.size == IV_BYTES) { "iv must be $IV_BYTES bytes" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(keyId.toByteArray(Charsets.UTF_8))
        return iv to cipher.doFinal(plaintext)
    }

    fun decrypt(key: ByteArray, keyId: String, iv: ByteArray, ciphertextWithTag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(keyId.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(ciphertextWithTag)
    }

    /** Encrypts a plaintext message into a relay envelope. */
    fun seal(key: ByteArray, from: String, message: Message, ts: String): Envelope {
        val keyId = keyId(key)
        val plain = NugaJson.encodeToString(Message.serializer(), message).toByteArray(Charsets.UTF_8)
        val (iv, ct) = encrypt(key, keyId, plain)
        return Envelope(
            from = from,
            iv = Base64.getEncoder().encodeToString(iv),
            ct = Base64.getEncoder().encodeToString(ct),
            ts = ts,
        )
    }

    /** Decrypts a relay envelope back into a message. Throws on tampering / wrong key. */
    fun open(key: ByteArray, envelope: Envelope): Message {
        val keyId = keyId(key)
        val iv = Base64.getDecoder().decode(envelope.iv)
        val ct = Base64.getDecoder().decode(envelope.ct)
        val plain = decrypt(key, keyId, iv, ct)
        return NugaJson.decodeFromString(Message.serializer(), String(plain, Charsets.UTF_8))
    }

    fun toHex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            sb.append(HEX[v ushr 4]).append(HEX[v and 0x0F])
        }
        return sb.toString()
    }

    private val HEX = "0123456789abcdef".toCharArray()

    // base64url helpers (no padding) used for the pairing key.
    fun base64UrlEncode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    fun base64UrlDecode(text: String): ByteArray {
        val cleaned = text.trim().trimEnd('=')
        return Base64.getUrlDecoder().decode(cleaned)
    }

    fun base64Encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    fun base64Decode(text: String): ByteArray = Base64.getDecoder().decode(text)
}
