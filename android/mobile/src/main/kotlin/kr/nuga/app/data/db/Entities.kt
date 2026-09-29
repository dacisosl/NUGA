package kr.nuga.app.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kr.nuga.shared.model.LessonInfo
import kr.nuga.shared.model.Record
import kr.nuga.shared.model.VoiceMemo
import kr.nuga.shared.time.NugaTime

/** Local copy of a Record (PROTOCOL.md §3.1) plus sync bookkeeping. Never stores a student name. */
@Entity(
    tableName = "records",
    indices = [Index("day"), Index("classLabel"), Index("deleted")],
)
data class RecordEntity(
    @PrimaryKey val id: String,
    val classLabel: String,
    val no: Int,
    val category: Int,
    val time: String,
    /** yyyy-MM-dd derived from [time] (local zone) for grouping. */
    val day: String,
    val lessonUnit: String? = null,
    val lessonNo: Int? = null,
    val lessonTitle: String? = null,
    val memo: String = "",
    val voiceDurationSec: Int? = null,
    val voiceTranscript: String? = null,
    val note: String = "",
    val status: String = "pending",
    val source: String,
    val createdAt: String,
    val updatedAt: String,
    /** true once the PC has received the latest version of this row. */
    val synced: Boolean = false,
    /** tombstoned locally (hidden from UI; kept so late edits from PC do not resurrect it). */
    val deleted: Boolean = false,
    val deletedAt: String? = null,
) {
    fun toRecord(): Record = Record(
        id = id,
        classLabel = classLabel,
        no = no,
        category = category,
        time = time,
        lesson = if (lessonUnit != null && lessonNo != null) LessonInfo(lessonUnit, lessonNo, lessonTitle ?: "") else null,
        memo = memo,
        voiceMemo = voiceTranscript?.let { VoiceMemo(voiceDurationSec ?: 0, it) },
        note = note,
        status = status,
        source = source,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

    companion object {
        fun from(r: Record, synced: Boolean): RecordEntity = RecordEntity(
            id = r.id,
            classLabel = r.classLabel,
            no = r.no,
            category = r.category,
            time = r.time,
            day = NugaTime.formatDate(NugaTime.dateOf(r.time)),
            lessonUnit = r.lesson?.unit,
            lessonNo = r.lesson?.lesson,
            lessonTitle = r.lesson?.title,
            memo = r.memo,
            voiceDurationSec = r.voiceMemo?.durationSec,
            voiceTranscript = r.voiceMemo?.transcript,
            note = r.note,
            status = r.status,
            source = r.source,
            createdAt = r.createdAt,
            updatedAt = r.updatedAt,
            synced = synced,
        )
    }
}

object OutboxKind {
    const val RECORD = "record"
    const val TOMBSTONE = "tombstone"
}

/** Pending items to be encrypted and posted to the relay. */
@Entity(tableName = "outbox", indices = [Index("refId")])
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    val kind: String,
    /** record id */
    val refId: String,
    /** Record JSON or Tombstone JSON */
    val payloadJson: String,
    val createdAt: String,
)

/** Single-row cache of the latest config received from the PC (or the demo config). */
@Entity(tableName = "config_cache")
data class ConfigEntity(
    @PrimaryKey val id: Int = 1,
    val json: String,
    val updatedAt: String,
    val receivedAt: String,
    val source: String,
)

data class DayCount(val day: String, val count: Int)
data class PeriodKey(val classLabel: String, val hour: Int)
