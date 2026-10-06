package kr.nuga.shared

import kr.nuga.shared.model.Config
import kr.nuga.shared.model.Message
import kr.nuga.shared.model.MessageType
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.TranscriptSegment
import kr.nuga.shared.transcript.TranscriptParser
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

class TranscriptParserTest {
    private val raw = """```json
        {"segments":[
          {"start":"00:05","end":"00:40","speaker":"Speaker 1","text":"오늘은 화학 평형을 배웁니다. 온도가 바뀌면 평형이 어떻게 될지 생각해 봅시다."},
          {"start":"11:52","end":"12:03","speaker":"화자 3","text":"온도를 올리면 흡열 방향으로 가니까 오른쪽으로 이동하나요?"},
          {"start":"1:02:00","end":"1:02:01","speaker":"S2","text":""}
        ]}
        ```"""

    @Test fun parsesClockSpeakerAndTeacher() {
        val tr = TranscriptParser.parse(raw, "t1", "2-3", 3, "2026-05-08T10:00:00", "2026-05-08T10:50:00", "gemini", "m", "2026-05-08T10:51:00")
        assertEquals(listOf("화자1", "화자3"), tr.segments.map { it.speaker })
        assertEquals(712.0, tr.segments[1].t0, 0.001)
        assertEquals("s2", tr.segments[1].id)
        assertEquals("화자1", tr.teacherSpeaker.auto)
    }

    @Test fun clockFormats() {
        assertEquals(3723.0, TranscriptParser.parseClock(kotlinx.serialization.json.JsonPrimitive("1:02:03"))!!, 0.001)
        assertEquals(75.0, TranscriptParser.parseClock(kotlinx.serialization.json.JsonPrimitive(75))!!, 0.001)
        assertNull(TranscriptParser.parseClock(kotlinx.serialization.json.JsonPrimitive("bad")))
    }

    @Test fun splitsUnderLimit() {
        val tr = TranscriptParser.parse(raw, "t1", "2-3", 3, "a", "b", "gemini", "m", "c")
        val big = tr.copy(segments = (1..600).map { TranscriptSegment("s$it", it * 5.0, it * 5.0 + 4, "화자${it % 4 + 1}", "가나다라마바사아자차카타파하 ".repeat(8)) })
        val parts = TranscriptParser.split(big, 60_000)
        assertTrue(parts.size > 1)
        assertEquals(600, parts.sumOf { it.transcript.segments.size })
        parts.forEach { assertTrue(NugaJson.encodeToString(kr.nuga.shared.model.Transcript.serializer(), it.transcript).toByteArray().size <= 60_000) }
        val msg = Message.transcript("d", "now", parts[0])
        assertEquals(MessageType.TRANSCRIPT, msg.type)
        assertEquals(parts[0].total, msg.transcriptPayload().total)
    }

    @Test fun configWithRecordingFromPc() {
        val json = """{"categories":[],"recording":{"enabled":true,"approvedChecklist":true,"mode":"standby","audioTTLHours":24,"speech":{"provider":"gemini","model":"gemini-2.5-flash"},"wifiOnly":true},"updatedAt":""}"""
        val c = NugaJson.decodeFromString(Config.serializer(), json)
        assertTrue(c.recordingActive)
        assertEquals("standby", c.recording!!.mode)
        val none = NugaJson.decodeFromString(Config.serializer(), """{"recording":null}""")
        assertEquals(false, none.recordingActive)
    }
}
