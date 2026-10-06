package kr.nuga.app.record

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Transcript
import java.io.File
import java.time.Instant

/**
 * 수업 녹음 목록 (폰 전용, v3 11.5). 음성 파일과 스크립트는 앱 전용 저장소에만 둔다.
 * - 음성: audioTTLHours(기본 24시간) 뒤 자동 삭제 (CleanupWorker)
 * - 스크립트: PC 가 받았다고 알려 오면(transcriptAck) 삭제
 * 목록은 작아서(하루 몇 건) Room 대신 JSON 파일 하나로 관리한다.
 */
@Serializable
data class RecordingItem(
    val id: String,
    val classLabel: String,
    val period: Int,
    /** ISO 현지 시각 */
    val startedAt: String,
    val endedAt: String? = null,
    /** 녹음 길이(초, 일시정지 제외) */
    val durationSec: Int = 0,
    val fileName: String,
    val status: String = RecordingStatus.RECORDING,
    val error: String = "",
    val attempts: Int = 0,
    /** 음성 삭제 예정 (epoch ms) */
    val deleteAtMs: Long,
    val audioDeleted: Boolean = false,
    val segmentCount: Int = 0,
    val sentAt: String? = null,
    val ackAt: String? = null,
)

object RecordingStatus {
    const val RECORDING = "recording"
    const val PAUSED = "paused"
    /** 녹음 끝, 변환 대기 */
    const val RECORDED = "recorded"
    const val TRANSCRIBING = "transcribing"
    /** 스크립트 있음, PC 전송 대기 */
    const val TRANSCRIBED = "transcribed"
    const val SENT = "sent"
    /** PC 가 받음 → 폰의 스크립트 사본 삭제 */
    const val DELIVERED = "delivered"
    const val FAILED = "failed"

    fun label(s: String): String = when (s) {
        RECORDING -> "녹음 중"
        PAUSED -> "일시정지"
        RECORDED -> "변환 대기"
        TRANSCRIBING -> "변환 중"
        TRANSCRIBED -> "PC 전송 대기"
        SENT -> "PC로 보냄"
        DELIVERED -> "PC 받음"
        FAILED -> "변환 실패"
        else -> s
    }
}

class RecordingStore(context: Context) {
    private val dir = File(context.filesDir, "recordings").apply { mkdirs() }
    private val transcriptDir = File(context.filesDir, "transcripts").apply { mkdirs() }
    private val index = File(dir, "index.json")
    private val mutex = Mutex()
    private val serializer = ListSerializer(RecordingItem.serializer())
    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<RecordingItem>> get() = _items

    fun audioFile(item: RecordingItem): File = File(dir, item.fileName)
    fun newAudioFile(id: String): File = File(dir, "$id.aac")
    private fun transcriptFile(id: String) = File(transcriptDir, "$id.json")

    private fun load(): List<RecordingItem> =
        runCatching { NugaJson.decodeFromString(serializer, index.readText()) }.getOrDefault(emptyList())

    private fun save(list: List<RecordingItem>) {
        val tmp = File(dir, "index.json.tmp")
        tmp.writeText(NugaJson.encodeToString(serializer, list))
        tmp.renameTo(index)
        _items.value = list
    }

    suspend fun upsert(item: RecordingItem) = mutex.withLock {
        val list = _items.value.filterNot { it.id == item.id } + item
        save(list.sortedByDescending { it.startedAt })
    }

    suspend fun update(id: String, f: (RecordingItem) -> RecordingItem) = mutex.withLock {
        val list = _items.value.map { if (it.id == id) f(it) else it }
        save(list)
    }

    fun get(id: String): RecordingItem? = _items.value.firstOrNull { it.id == id }

    fun saveTranscript(t: Transcript) { transcriptFile(t.id).writeText(NugaJson.encodeToString(Transcript.serializer(), t)) }
    fun transcript(id: String): Transcript? =
        runCatching { NugaJson.decodeFromString(Transcript.serializer(), transcriptFile(id).readText()) }.getOrNull()

    /** PC 가 받았다고 알려 온 스크립트는 폰에서 지운다 */
    suspend fun markDelivered(ids: List<String>, at: String) {
        for (id in ids) {
            transcriptFile(id).delete()
            update(id) { it.copy(status = RecordingStatus.DELIVERED, ackAt = at) }
        }
    }

    /** 보존 기간이 지난 음성 삭제, 끝난 항목은 7일 뒤 목록에서도 정리. 지운 음성 수를 돌려준다. */
    suspend fun cleanup(nowMs: Long = System.currentTimeMillis()): Int = mutex.withLock {
        var removed = 0
        val list = _items.value.mapNotNull { item ->
            var it = item
            if (!it.audioDeleted && nowMs >= it.deleteAtMs && it.status != RecordingStatus.RECORDING && it.status != RecordingStatus.PAUSED) {
                audioFile(it).delete(); removed++
                it = it.copy(audioDeleted = true)
            }
            val old = nowMs - it.deleteAtMs > 7L * 24 * 3600 * 1000
            if (old && it.audioDeleted && (it.status == RecordingStatus.DELIVERED || it.status == RecordingStatus.FAILED)) { transcriptFile(it.id).delete(); null } else it
        }
        save(list)
        removed
    }

    /** 교사가 직접 삭제 (음성·스크립트·목록 모두) */
    suspend fun delete(id: String) = mutex.withLock {
        val item = _items.value.firstOrNull { it.id == id } ?: return@withLock
        audioFile(item).delete(); transcriptFile(id).delete()
        save(_items.value.filterNot { it.id == id })
    }

    companion object {
        fun deleteAt(startMs: Long, ttlHours: Int): Long = startMs + ttlHours.coerceIn(1, 72) * 3600_000L
        fun nowIso(): String = kr.nuga.shared.time.NugaTime.nowIso()
        fun epochMs(): Long = Instant.now().toEpochMilli()
    }
}
