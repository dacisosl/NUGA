package kr.nuga.shared

import kr.nuga.shared.model.Envelope
import kr.nuga.shared.model.MessageType
import kr.nuga.shared.sync.SyncCrypto
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PC(TypeScript, WebCrypto)에서 만든 고정 봉투를 Kotlin 구현이 그대로 복호화하는지 확인한다.
 * 벡터 생성: 키 = 0x07 × 32, IV = 00..0b, 메시지 = ping. (packages/core 와 tools/phone-sim.mjs 와 동일 프로토콜)
 */
class InteropVectorTest {
    private val key = ByteArray(32) { 7 }

    @Test
    fun opensEnvelopeSealedByTypeScriptImplementation() {
        assertEquals("4bb06f8e4e3a7715", SyncCrypto.keyId(key))
        val env = Envelope(
            from = "pc",
            iv = "AAECAwQFBgcICQoL",
            ct = "Y6OfUic49WsDy5X5wGJOiohS0aw0QBNUYKcA38ezTz/8GSOBteMTjpGLt/co1Y8RxgBuT/nl0btBd+C9kPoq/Xd/NpeqaiKgGBeLnkHuUu7FM6/8fEYFjcG0HTRuF/nzFh2QryxVY1KoVkXdlK2LT+GHG3XM67E=",
            ts = "2026-05-08T10:12:05+09:00",
        )
        val msg = SyncCrypto.open(key, env)
        assertEquals(MessageType.PING, msg.type)
        assertEquals("vec", msg.deviceId)
        assertEquals("2026-05-08T10:12:05+09:00", msg.sentAt)
        assertEquals("벡터", msg.payload.jsonObject["name"]!!.jsonPrimitive.content)
    }
}
