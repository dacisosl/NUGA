package kr.nuga.shared

import kr.nuga.shared.model.Config
import kr.nuga.shared.model.EnvelopeFrom
import kr.nuga.shared.model.Message
import kr.nuga.shared.model.MessageType
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.sync.SyncCrypto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest
import kotlin.test.assertFailsWith

class SyncCryptoTest {
    private val key = ByteArray(32) { (it * 7 + 3).toByte() }

    @Test
    fun keyId_isFirst8BytesOfSha256LowercaseHex() {
        val digest = MessageDigest.getInstance("SHA-256").digest(key)
        val expected = digest.copyOfRange(0, 8).joinToString("") { "%02x".format(it) }
        val actual = SyncCrypto.keyId(key)
        assertEquals(expected, actual)
        assertEquals(16, actual.length)
        assertTrue(SyncCrypto.isValidKeyId(actual))
        assertEquals(actual, actual.lowercase())
    }

    @Test
    fun keyId_knownVector_allZeroKey() {
        // SHA-256 of 32 zero bytes = 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
        val zero = ByteArray(32)
        assertEquals("66687aadf862bd77", SyncCrypto.keyId(zero))
    }

    @Test
    fun keyId_rejectsWrongLength() {
        assertFailsWith<IllegalArgumentException> { SyncCrypto.keyId(ByteArray(16)) }
    }

    @Test
    fun encrypt_decrypt_roundTrip_withAad() {
        val keyId = SyncCrypto.keyId(key)
        val plain = "{\"v\":1,\"type\":\"ping\"} 한글".toByteArray(Charsets.UTF_8)
        val (iv, ct) = SyncCrypto.encrypt(key, keyId, plain)
        assertEquals(12, iv.size)
        assertEquals(plain.size + 16, ct.size) // ciphertext || 128-bit tag
        val back = SyncCrypto.decrypt(key, keyId, iv, ct)
        assertArrayEquals(plain, back)
    }

    @Test
    fun decrypt_failsWithWrongAad_orWrongKey_orTamperedCiphertext() {
        val keyId = SyncCrypto.keyId(key)
        val plain = "hello".toByteArray()
        val (iv, ct) = SyncCrypto.encrypt(key, keyId, plain)
        assertFailsWith<Exception> { SyncCrypto.decrypt(key, "0000000000000000", iv, ct) }
        val otherKey = ByteArray(32) { 9 }
        assertFailsWith<Exception> { SyncCrypto.decrypt(otherKey, keyId, iv, ct) }
        val tampered = ct.copyOf().also { it[0] = (it[0].toInt() xor 1).toByte() }
        assertFailsWith<Exception> { SyncCrypto.decrypt(key, keyId, iv, tampered) }
    }

    @Test
    fun ivIsFreshPerMessage() {
        val keyId = SyncCrypto.keyId(key)
        val (iv1, _) = SyncCrypto.encrypt(key, keyId, byteArrayOf(1))
        val (iv2, _) = SyncCrypto.encrypt(key, keyId, byteArrayOf(1))
        assertNotEquals(iv1.toList(), iv2.toList())
    }

    @Test
    fun seal_open_roundTrip_recordsMessage() {
        val record = Record(
            id = "0f1e2d3c-0000-4000-8000-000000000001",
            classLabel = "2-3", no = 5, category = 1,
            time = "2026-05-08T10:12:00+09:00",
            lesson = null, memo = "", voiceMemo = null, note = "",
            status = "pending", source = RecordSource.PHONE,
            createdAt = "2026-05-08T10:12:00+09:00", updatedAt = "2026-05-08T10:12:00+09:00",
        )
        val msg = Message.records("dev-1", "2026-05-08T10:12:05+09:00", listOf(record))
        val env = SyncCrypto.seal(key, EnvelopeFrom.PHONE, msg, "2026-05-08T10:12:05+09:00")
        assertEquals(EnvelopeFrom.PHONE, env.from)
        // Envelope JSON has exactly the four protocol fields.
        val envJson = NugaJson.encodeToString(kr.nuga.shared.model.Envelope.serializer(), env)
        assertTrue(envJson.contains("\"from\":\"phone\""))
        assertTrue(envJson.contains("\"iv\":"))
        assertTrue(envJson.contains("\"ct\":"))
        assertTrue(envJson.contains("\"ts\":"))

        val opened = SyncCrypto.open(key, env)
        assertEquals(1, opened.v)
        assertEquals(MessageType.RECORDS, opened.type)
        assertEquals("dev-1", opened.deviceId)
        val records = opened.recordsPayload()
        assertEquals(listOf(record), records)
    }

    @Test
    fun recordJson_usesProtocolFieldNames() {
        val record = Record(
            id = "id", classLabel = "2-3", no = 1, category = 2, time = "t",
            source = RecordSource.WATCH, createdAt = "c", updatedAt = "u",
        )
        val json = NugaJson.encodeToString(Record.serializer(), record)
        assertTrue(json.contains("\"class\":\"2-3\""))
        assertTrue(json.contains("\"lesson\":null"))
        assertTrue(json.contains("\"voiceMemo\":null"))
        assertTrue(json.contains("\"memo\":\"\""))
        assertTrue(json.contains("\"status\":\"pending\""))
    }

    @Test
    fun configJson_roundTrip_andRosterStripped() {
        val raw = """
            { "school": { "grade": 2, "subject": "화학Ⅰ", "year": 2026, "semester": 1 },
              "categories": [ { "key": 1, "label": "질문" }, { "key": 2, "label": "발표" }, { "key": 3, "label": "협동" }, { "key": 4, "label": "기타" } ],
              "classes": [ { "class": "2-3", "size": 28 } ],
              "periods": [ { "no": 1, "start": "08:50", "end": "09:40" } ],
              "timetable": [ { "weekday": 2, "period": 3, "class": "2-3" } ],
              "progress": [ { "date": "2026-05-08", "class": "2-3", "unit": "3단원", "lesson": 2, "title": "화학 평형" } ],
              "roster": [ { "class": "2-3", "no": 2, "name": "이서연" } ],
              "options": { "autoLaunchWatch": true, "reelStart": "last" },
              "updatedAt": "2026-05-08T10:00:00+09:00" }
        """.trimIndent()
        val config = NugaJson.decodeFromString(Config.serializer(), raw)
        assertEquals("2-3", config.classes.single().classLabel)
        assertEquals(28, config.classSize("2-3"))
        assertEquals("이서연", config.nameOf("2-3", 2))
        assertEquals("last", config.options.reelStart)
        val stripped = config.withoutRoster()
        assertEquals(null, stripped.roster)
        val strippedJson = NugaJson.encodeToString(Config.serializer(), stripped)
        assertTrue(strippedJson.contains("\"roster\":null"))
        assertTrue(!strippedJson.contains("이서연"))
    }
}
