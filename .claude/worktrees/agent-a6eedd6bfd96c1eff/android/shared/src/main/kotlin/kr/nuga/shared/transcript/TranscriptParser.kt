package kr.nuga.shared.transcript

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.SpeechEngine
import kr.nuga.shared.model.TeacherSpeaker
import kr.nuga.shared.model.Transcript
import kr.nuga.shared.model.TranscriptPart
import kr.nuga.shared.model.TranscriptSegment

/**
 * 음성 API 응답 → 스크립트. packages/core/src/transcript.ts 와 같은 규칙 (PROTOCOL.md §3.6).
 * 화자는 "화자N" 라벨로만 정리하고, 누구인지 추정하지 않는다.
 */
object TranscriptParser {

    /** 음성 변환 지시문 (core TRANSCRIBE_PROMPT 와 같아야 함) */
    val PROMPT: String = listOf(
        "이 음성은 한국 학교의 수업 녹음이다. 받아쓰기와 화자 구분만 한다.",
        "- 말한 내용을 들리는 그대로 한국어로 받아 적는다. 요약하거나 고치지 않는다. 알아들을 수 없는 부분은 (불명확)으로 적는다.",
        "- 화자는 목소리로만 구분하여 '화자1', '화자2'처럼 번호를 붙인다. 이름·성별·나이·학생 여부 등 누구인지는 추정하지 않는다.",
        "- 발언 중 사람 이름이 나오면 들리는 대로 적되, 화자 라벨에 이름을 쓰지 않는다.",
        "- 한 화자의 말이 길면 문장 단위로 나누되, 한 구간은 30초를 넘지 않게 한다.",
        "- start·end 는 녹음 시작부터의 시각을 'MM:SS' (1시간 이상이면 'H:MM:SS')로 적는다.",
        "- 침묵, 잡음, 음악 구간은 적지 않는다.",
    ).joinToString("\n")

    /** Gemini responseSchema (OpenAPI 부분집합) */
    const val GEMINI_SCHEMA_JSON: String =
        """{"type":"OBJECT","properties":{"segments":{"type":"ARRAY","items":{"type":"OBJECT","properties":{"start":{"type":"STRING"},"end":{"type":"STRING"},"speaker":{"type":"STRING"},"text":{"type":"STRING"}},"required":["start","end","speaker","text"]}}},"required":["segments"]}"""

    private val CLOCK = Regex("""^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$""")
    private val NUMBER = Regex("""^\d+(\.\d+)?$""")
    private val DIGITS = Regex("""(\d+)""")

    fun parseClock(v: JsonElement?): Double? {
        val p = v as? JsonPrimitive ?: return null
        p.doubleOrNull?.let { if (!p.isString) return it.coerceAtLeast(0.0) }
        val t = p.contentOrNull?.trim() ?: return null
        if (NUMBER.matches(t)) return t.toDouble()
        val m = CLOCK.matchEntire(t) ?: return null
        val h = m.groupValues[1].takeIf { it.isNotEmpty() }?.toDouble() ?: 0.0
        return h * 3600 + m.groupValues[2].toDouble() * 60 + m.groupValues[3].toDouble()
    }

    fun normalizeSpeaker(s: String): String {
        val m = DIGITS.find(s)
        return if (m != null) "화자${m.groupValues[1].toInt()}" else s.trim().ifEmpty { "화자?" }
    }

    fun guessTeacher(segments: List<TranscriptSegment>): String? =
        segments.groupBy { it.speaker }.mapValues { (_, v) -> v.sumOf { it.text.codePointCount(0, it.text.length) } }
            .maxByOrNull { it.value }?.key

    /** 응답에서 JSON 부분만 (코드 블록 제거) */
    fun extractJson(text: String): String {
        val t = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val a = t.indexOf('{'); val b = t.lastIndexOf('}')
        return if (a >= 0 && b > a) t.substring(a, b + 1) else t
    }

    fun parse(
        raw: String, id: String, classLabel: String, period: Int, startedAt: String, endedAt: String,
        provider: String, model: String, createdAt: String, offsetSec: Double = 0.0,
    ): Transcript {
        val root = NugaJson.parseToJsonElement(extractJson(raw))
        val list = when (root) {
            is JsonArray -> root
            is JsonObject -> root["segments"] as? JsonArray ?: throw IllegalArgumentException("segments 없음")
            else -> throw IllegalArgumentException("스크립트 형식 아님")
        }
        val segs = list.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val text = (o["text"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
            val t0 = parseClock(o["start"] ?: o["t0"]) ?: return@mapNotNull null
            if (text.isEmpty()) return@mapNotNull null
            val t1 = parseClock(o["end"] ?: o["t1"]) ?: t0
            TranscriptSegment("", t0 + offsetSec, maxOf(t0, t1) + offsetSec, normalizeSpeaker((o["speaker"] as? JsonPrimitive)?.contentOrNull.orEmpty()), text)
        }.sortedBy { it.t0 }.mapIndexed { i, s -> s.copy(id = "s${i + 1}") }
        return Transcript(
            id = id, classLabel = classLabel, period = period, startedAt = startedAt, endedAt = endedAt, segments = segs,
            teacherSpeaker = TeacherSpeaker(auto = guessTeacher(segs)), engine = SpeechEngine(provider, model), createdAt = createdAt,
        )
    }

    /** 릴레이 본문 한도(256KB) 안에 들도록 나눈다. 암호화·base64 여유를 두고 120KB. */
    fun split(tr: Transcript, maxBytes: Int = 120_000): List<TranscriptPart> {
        fun size(x: Transcript) = NugaJson.encodeToString(Transcript.serializer(), x).toByteArray().size
        if (size(tr) <= maxBytes) return listOf(TranscriptPart(tr, 1, 1))
        val base = size(tr.copy(segments = emptyList()))
        val chunks = mutableListOf<MutableList<TranscriptSegment>>()
        var cur = mutableListOf<TranscriptSegment>(); var sz = base
        for (s in tr.segments) {
            val n = NugaJson.encodeToString(TranscriptSegment.serializer(), s).toByteArray().size + 1
            if (cur.isNotEmpty() && sz + n > maxBytes) { chunks += cur; cur = mutableListOf(); sz = base }
            cur += s; sz += n
        }
        if (cur.isNotEmpty()) chunks += cur
        return chunks.mapIndexed { i, c -> TranscriptPart(tr.copy(segments = c), i + 1, chunks.size) }
    }
}
