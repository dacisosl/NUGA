package kr.nuga.app.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kr.nuga.app.data.db.NugaDatabase
import kr.nuga.app.data.db.OutboxEntity
import kr.nuga.app.data.db.OutboxKind
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.sync.SyncScheduler
import kr.nuga.app.widget.WidgetUpdater
import kr.nuga.shared.model.LessonInfo
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.model.RecordStatus
import kr.nuga.shared.model.Tombstone
import kr.nuga.shared.model.VoiceMemo
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime
import java.util.UUID

class RecordRepository(
    private val context: Context,
    private val db: NugaDatabase,
    private val prefs: Prefs,
    private val configRepo: ConfigRepository,
    private val scope: CoroutineScope,
) {
    private val dao get() = db.recordDao()
    private val outbox get() = db.outboxDao()

    fun observeAll(): Flow<List<RecordEntity>> = dao.observeAll()
    fun observeRecent(limit: Int = 20): Flow<List<RecordEntity>> = dao.observeRecent(limit)
    fun observeDay(day: String): Flow<List<RecordEntity>> = dao.observeDay(day)
    fun observeCountDay(day: String): Flow<Int> = dao.observeCountDay(day)
    fun observeOutboxCount(): Flow<Int> = outbox.observeCount()
    fun observeUnsyncedCount(): Flow<Int> = dao.observeUnsyncedCount()

    suspend fun byId(id: String): RecordEntity? = dao.byId(id)

    /** Creates a record from the phone UI or widget. Lesson is filled from progress when known. */
    suspend fun create(
        classLabel: String,
        no: Int,
        category: Int,
        memo: String = "",
        voiceTranscript: String? = null,
        source: String = RecordSource.PHONE,
        now: LocalDateTime = LocalDateTime.now(),
    ): RecordEntity {
        val config = configRepo.current()
        val lesson: LessonInfo? = config?.let { TimetableResolver.lessonInfoFor(it, now, classLabel) }
        val iso = NugaTime.toIso(now)
        val record = Record(
            id = UUID.randomUUID().toString(),
            classLabel = classLabel,
            no = no,
            category = category,
            time = iso,
            lesson = lesson,
            memo = memo.trim(),
            voiceMemo = voiceTranscript?.takeIf { it.isNotBlank() }?.let { VoiceMemo(durationSec = 0, transcript = it.trim()) },
            note = "",
            status = RecordStatus.PENDING,
            source = source,
            createdAt = iso,
            updatedAt = iso,
        )
        val entity = RecordEntity.from(record, synced = false)
        dao.upsert(entity)
        enqueueRecord(record)
        prefs.setLastNo(classLabel, no)
        afterChange()
        return entity
    }

    /** Record arriving from the watch over the Data Layer. Source is always "watch". */
    suspend fun ingestFromWatch(incoming: Record): RecordEntity {
        val existing = dao.byId(incoming.id)
        val record = incoming.copy(source = RecordSource.WATCH)
        if (existing != null && existing.updatedAt >= record.updatedAt) return existing
        val entity = RecordEntity.from(record, synced = false)
        dao.upsert(entity)
        enqueueRecord(record)
        prefs.setLastNo(record.classLabel, record.no)
        afterChange()
        return entity
    }

    suspend fun updateMemo(id: String, memo: String, voiceTranscript: String? = null) {
        val existing = dao.byId(id) ?: return
        val now = NugaTime.nowIso()
        val updated = existing.copy(
            memo = memo.trim(),
            voiceTranscript = voiceTranscript?.takeIf { it.isNotBlank() } ?: existing.voiceTranscript,
            updatedAt = now,
            synced = false,
        )
        dao.update(updated)
        enqueueRecord(updated.toRecord())
        afterChange()
    }

    /** Soft delete + tombstone propagation. */
    suspend fun delete(id: String) {
        val existing = dao.byId(id) ?: return
        val now = NugaTime.nowIso()
        dao.tombstone(id, now)
        outbox.deleteByRef(id)
        // Always propagate: even an "unsynced" row may have reached the PC if a POST succeeded without our bookkeeping.
        enqueueTombstone(Tombstone(id, now))
        afterChange()
    }

    /** 5-second undo right after saving. */
    suspend fun undo(id: String) {
        val existing = dao.byId(id) ?: return
        if (!existing.synced) {
            outbox.deleteByRef(id)
            dao.hardDelete(id)
            afterChange()
        } else {
            delete(id)
        }
    }

    /** Records coming back from the PC (edits/confirmations). Newer updatedAt wins. */
    suspend fun applyRemoteRecords(records: List<Record>) {
        for (r in records) {
            val existing = dao.byId(r.id)
            if (existing != null) {
                if (existing.deleted) continue
                if (existing.updatedAt > r.updatedAt) continue
            }
            dao.upsert(RecordEntity.from(r, synced = true))
            outbox.deleteByRef(r.id)
        }
        if (records.isNotEmpty()) scope.launch { WidgetUpdater.updateAll(context) }
    }

    suspend fun applyRemoteTombstones(tombstones: List<Tombstone>) {
        for (t in tombstones) {
            val existing = dao.byId(t.id)
            if (existing == null) {
                // keep a tombstone row so a late record with this id stays hidden
                dao.upsert(
                    RecordEntity(
                        id = t.id, classLabel = "", no = 0, category = 4, time = t.deletedAt,
                        day = NugaTime.formatDate(NugaTime.dateOf(t.deletedAt)), source = RecordSource.PC,
                        createdAt = t.deletedAt, updatedAt = t.deletedAt, synced = true, deleted = true, deletedAt = t.deletedAt,
                    ),
                )
            } else {
                dao.tombstone(t.id, t.deletedAt)
            }
            outbox.deleteByRef(t.id)
        }
        if (tombstones.isNotEmpty()) scope.launch { WidgetUpdater.updateAll(context) }
    }

    suspend fun markSynced(id: String, updatedAt: String) = dao.markSyncedIfUnchanged(id, updatedAt)

    suspend fun lastNo(classLabel: String): Int? = prefs.lastNo(classLabel) ?: dao.lastNoFor(classLabel)

    private suspend fun enqueueRecord(record: Record) {
        outbox.deleteByRef(record.id)
        outbox.insert(
            OutboxEntity(
                kind = OutboxKind.RECORD,
                refId = record.id,
                payloadJson = NugaJson.encodeToString(Record.serializer(), record),
                createdAt = NugaTime.nowIso(),
            ),
        )
    }

    private suspend fun enqueueTombstone(tombstone: Tombstone) {
        outbox.insert(
            OutboxEntity(
                kind = OutboxKind.TOMBSTONE,
                refId = tombstone.id,
                payloadJson = NugaJson.encodeToString(Tombstone.serializer(), tombstone),
                createdAt = NugaTime.nowIso(),
            ),
        )
    }

    private fun afterChange() {
        scope.launch { WidgetUpdater.updateAll(context) }
        SyncScheduler.requestNow(context)
    }
}
