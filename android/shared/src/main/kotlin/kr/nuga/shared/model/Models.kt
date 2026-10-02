package kr.nuga.shared.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Shared JSON configuration used by every component (PROTOCOL.md). */
val NugaJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = true
    isLenient = true
}

// ---------------------------------------------------------------- Record (3.1)

@Serializable
data class LessonInfo(
    val unit: String,
    val lesson: Int,
    val title: String,
)

@Serializable
data class VoiceMemo(
    val durationSec: Int,
    val transcript: String,
)

object RecordStatus {
    const val PENDING = "pending"
    const val CONFIRMED = "confirmed"
    const val SKIPPED = "skipped"
}

object RecordSource {
    const val WATCH = "watch"
    const val PHONE = "phone"
    const val WIDGET = "widget"
    const val PC = "pc"
}

@Serializable
data class Record(
    val id: String,
    @SerialName("class") val classLabel: String,
    val no: Int,
    val category: Int,
    val time: String,
    val lesson: LessonInfo? = null,
    val memo: String = "",
    val voiceMemo: VoiceMemo? = null,
    val note: String = "",
    val status: String = RecordStatus.PENDING,
    val source: String,
    val createdAt: String,
    val updatedAt: String,
)

// ---------------------------------------------------------------- Tombstone (3.2)

@Serializable
data class Tombstone(
    val id: String,
    val deletedAt: String,
)

// ---------------------------------------------------------------- Config (3.3)

@Serializable
data class SchoolInfo(
    val grade: Int = 0,
    val subject: String = "",
    val year: Int = 0,
    val semester: Int = 0,
)

@Serializable
data class CategoryDef(
    val key: Int,
    val label: String,
)

@Serializable
data class ClassDef(
    @SerialName("class") val classLabel: String,
    val size: Int,
)

@Serializable
data class PeriodDef(
    val no: Int,
    /** "HH:mm" */
    val start: String,
    /** "HH:mm" */
    val end: String,
)

@Serializable
data class TimetableEntry(
    /** 1=Mon … 5=Fri */
    val weekday: Int,
    val period: Int,
    @SerialName("class") val classLabel: String,
)

@Serializable
data class ProgressEntry(
    /** "yyyy-MM-dd" */
    val date: String,
    @SerialName("class") val classLabel: String,
    val unit: String,
    val lesson: Int,
    val title: String,
) {
    fun toLessonInfo(): LessonInfo = LessonInfo(unit = unit, lesson = lesson, title = title)
}

@Serializable
data class RosterEntry(
    @SerialName("class") val classLabel: String,
    val no: Int,
    val name: String,
)

object ReelStart {
    const val ONE = "one"
    const val LAST = "last"
}

@Serializable
data class ConfigOptions(
    val autoLaunchWatch: Boolean = true,
    val reelStart: String = ReelStart.ONE,
)

/** PC 가 정한 수업 녹음 설정 (PROTOCOL.md §3.3). API 키는 들어가지 않는다. */
@Serializable
data class SpeechConfig(
    val provider: String = "gemini",
    val model: String = "gemini-2.5-flash",
)

object RecordingMode {
    /** 수업 시작 알림·위젯에서 1탭 */
    const val TAP = "tap"
    /** 아침 1탭으로 하루 대기, 시간표대로 자동 녹음 */
    const val STANDBY = "standby"
}

@Serializable
data class RecordingConfig(
    val enabled: Boolean = false,
    val approvedChecklist: Boolean = false,
    val mode: String = RecordingMode.TAP,
    val audioTTLHours: Int = 24,
    val speech: SpeechConfig = SpeechConfig(),
    val wifiOnly: Boolean = true,
) {
    val active: Boolean get() = enabled && approvedChecklist
}

@Serializable
data class Config(
    val school: SchoolInfo? = null,
    val categories: List<CategoryDef> = DEFAULT_CATEGORIES,
    val classes: List<ClassDef> = emptyList(),
    val periods: List<PeriodDef> = emptyList(),
    val timetable: List<TimetableEntry> = emptyList(),
    val progress: List<ProgressEntry> = emptyList(),
    val roster: List<RosterEntry>? = null,
    val options: ConfigOptions = ConfigOptions(),
    val recording: RecordingConfig? = null,
    val updatedAt: String = "",
) {
    val recordingActive: Boolean get() = recording?.active == true

    /** Config as it may be forwarded to the watch: never carries names. */
    fun withoutRoster(): Config = if (roster == null) this else copy(roster = null)

    fun categoryLabel(key: Int): String =
        categories.firstOrNull { it.key == key }?.label
            ?: DEFAULT_CATEGORIES.firstOrNull { it.key == key }?.label
            ?: key.toString()

    fun classSize(classLabel: String): Int =
        classes.firstOrNull { it.classLabel == classLabel }?.size ?: DEFAULT_CLASS_SIZE

    fun nameOf(classLabel: String, no: Int): String? =
        roster?.firstOrNull { it.classLabel == classLabel && it.no == no }?.name

    companion object {
        const val DEFAULT_CLASS_SIZE = 30
        val DEFAULT_CATEGORIES: List<CategoryDef> = listOf(
            CategoryDef(1, "질문"),
            CategoryDef(2, "발표"),
            CategoryDef(3, "협동"),
            CategoryDef(4, "기타"),
        )
        val EMPTY = Config()
    }
}

// ---------------------------------------------------------------- Transcript (3.6)

/** 발언 한 구간. t0·t1 = 녹음 시작부터 지난 초. 화자는 "화자1" 라벨만 (학생과 연결하지 않음). */
@Serializable
data class TranscriptSegment(
    val id: String,
    val t0: Double,
    val t1: Double,
    val speaker: String,
    val text: String,
)

@Serializable
data class TeacherSpeaker(val auto: String? = null, val confirmed: String? = null)

@Serializable
data class SpeechEngine(val provider: String, val model: String)

@Serializable
data class Transcript(
    val id: String,
    @SerialName("class") val classLabel: String,
    val period: Int,
    val startedAt: String,
    val endedAt: String,
    val segments: List<TranscriptSegment>,
    val teacherSpeaker: TeacherSpeaker = TeacherSpeaker(),
    val engine: SpeechEngine,
    val createdAt: String,
)

@Serializable
data class TranscriptPart(val transcript: Transcript, val part: Int, val total: Int)

@Serializable
data class TranscriptAck(val ids: List<String>)

/** PC → 폰: 음성 변환용 키. 빈 문자열이면 지운다. */
@Serializable
data class SecretsPayload(val gemini: String? = null, val openrouter: String? = null)

// ---------------------------------------------------------------- Ping (3.4)

@Serializable
data class PingPayload(val name: String)

// ---------------------------------------------------------------- Message (3)

object MessageType {
    const val RECORDS = "records"
    const val TOMBSTONES = "tombstones"
    const val CONFIG = "config"
    const val PING = "ping"
    const val TRANSCRIPT = "transcript"
    const val TRANSCRIPT_ACK = "transcriptAck"
    const val SECRETS = "secrets"
}

@Serializable
data class Message(
    val v: Int = 1,
    val type: String,
    val deviceId: String,
    val sentAt: String,
    val payload: JsonElement,
) {
    fun recordsPayload(): List<Record> = NugaJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Record.serializer()), payload)
    fun tombstonesPayload(): List<Tombstone> = NugaJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Tombstone.serializer()), payload)
    fun configPayload(): Config = NugaJson.decodeFromJsonElement(Config.serializer(), payload)
    fun pingPayload(): PingPayload = NugaJson.decodeFromJsonElement(PingPayload.serializer(), payload)
    fun transcriptPayload(): TranscriptPart = NugaJson.decodeFromJsonElement(TranscriptPart.serializer(), payload)
    fun transcriptAckPayload(): TranscriptAck = NugaJson.decodeFromJsonElement(TranscriptAck.serializer(), payload)
    fun secretsPayload(): SecretsPayload = NugaJson.decodeFromJsonElement(SecretsPayload.serializer(), payload)

    companion object {
        fun records(deviceId: String, sentAt: String, records: List<Record>) = Message(
            type = MessageType.RECORDS, deviceId = deviceId, sentAt = sentAt,
            payload = NugaJson.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(Record.serializer()), records),
        )

        fun tombstones(deviceId: String, sentAt: String, tombstones: List<Tombstone>) = Message(
            type = MessageType.TOMBSTONES, deviceId = deviceId, sentAt = sentAt,
            payload = NugaJson.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(Tombstone.serializer()), tombstones),
        )

        fun config(deviceId: String, sentAt: String, config: Config) = Message(
            type = MessageType.CONFIG, deviceId = deviceId, sentAt = sentAt,
            payload = NugaJson.encodeToJsonElement(Config.serializer(), config),
        )

        fun transcript(deviceId: String, sentAt: String, part: TranscriptPart) = Message(
            type = MessageType.TRANSCRIPT, deviceId = deviceId, sentAt = sentAt,
            payload = NugaJson.encodeToJsonElement(TranscriptPart.serializer(), part),
        )

        fun ping(deviceId: String, sentAt: String, name: String) = Message(
            type = MessageType.PING, deviceId = deviceId, sentAt = sentAt,
            payload = NugaJson.encodeToJsonElement(PingPayload.serializer(), PingPayload(name)),
        )
    }
}

// ---------------------------------------------------------------- Envelope (2) & relay (4)

object EnvelopeFrom {
    const val PHONE = "phone"
    const val PC = "pc"
}

@Serializable
data class Envelope(
    val from: String,
    /** base64 (standard) 12-byte IV */
    val iv: String,
    /** base64 (standard) ciphertext || 16-byte tag */
    val ct: String,
    val ts: String,
)

@Serializable
data class RelayItem(
    val id: String,
    val from: String,
    val iv: String,
    val ct: String,
    val ts: String,
) {
    fun toEnvelope(): Envelope = Envelope(from = from, iv = iv, ct = ct, ts = ts)
}

@Serializable
data class RelayListResponse(val items: List<RelayItem> = emptyList())

@Serializable
data class RelayPostResponse(val id: String, val ts: String = "")

@Serializable
data class RelayError(val error: String = "")

@Serializable
data class WearAck(val id: String)

/** Wear OS Data Layer paths (PROTOCOL.md §5). */
object DataLayerPaths {
    const val RECORD = "/nuga/record"
    const val CONFIG = "/nuga/config"
    const val ACK = "/nuga/ack"
    const val CONFIG_KEY_JSON = "json"
    const val CONFIG_KEY_UPDATED_AT = "updatedAt"
    const val PHONE_CAPABILITY = "nuga_phone"
    const val WATCH_CAPABILITY = "nuga_watch"
}
