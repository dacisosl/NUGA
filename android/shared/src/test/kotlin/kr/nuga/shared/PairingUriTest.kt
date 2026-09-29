package kr.nuga.shared

import kr.nuga.shared.sync.PairingUri
import kr.nuga.shared.sync.SyncCrypto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PairingUriTest {
    private val key = ByteArray(32) { (255 - it).toByte() }

    @Test
    fun parse_protocolExample() {
        val k = SyncCrypto.base64UrlEncode(key)
        val text = "nuga://pair?v=1&k=$k&r=https%3A%2F%2Frelay.example.com&n=%EA%B5%90%EB%AC%B4%EC%8B%A4PC"
        val p = PairingUri.parse(text)
        assertNotNull(p)
        p!!
        assertEquals(1, p.version)
        assertArrayEquals(key, p.key)
        assertEquals(SyncCrypto.keyId(key), p.keyId)
        assertEquals("https://relay.example.com", p.relayUrl)
        assertEquals("교무실PC", p.pcName)
    }

    @Test
    fun build_then_parse_roundTrip_withLanAddressAndSpaces() {
        val text = PairingUri.build(key, "http://192.168.0.12:8787/", "선생님 노트북")
        val p = PairingUri.parse(text)!!
        assertArrayEquals(key, p.key)
        assertEquals("http://192.168.0.12:8787", p.relayUrl)
        assertEquals("선생님 노트북", p.pcName)
    }

    @Test
    fun parse_acceptsPaddedBase64url() {
        val k = java.util.Base64.getUrlEncoder().encodeToString(key) // with padding
        val p = PairingUri.parse("nuga://pair?v=1&k=$k&r=https%3A%2F%2Fr.example&n=PC")
        assertNotNull(p)
        assertArrayEquals(key, p!!.key)
    }

    @Test
    fun parse_rejectsInvalidInputs() {
        val k = SyncCrypto.base64UrlEncode(key)
        assertNull(PairingUri.parse("https://example.com/?v=1&k=$k&r=x"))
        assertNull(PairingUri.parse("nuga://pair?v=2&k=$k&r=https%3A%2F%2Fr"))
        assertNull(PairingUri.parse("nuga://pair?v=1&r=https%3A%2F%2Fr"))
        assertNull(PairingUri.parse("nuga://pair?v=1&k=${SyncCrypto.base64UrlEncode(ByteArray(16))}&r=https%3A%2F%2Fr"))
        assertNull(PairingUri.parse("nuga://pair?v=1&k=$k"))
        assertNull(PairingUri.parse("nuga://pair?v=1&k=!!!notbase64&r=https%3A%2F%2Fr"))
        assertNull(PairingUri.parse(""))
    }
}
