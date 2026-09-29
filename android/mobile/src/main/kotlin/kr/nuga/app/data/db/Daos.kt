package kr.nuga.app.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface RecordDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(record: RecordEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(records: List<RecordEntity>)

    @Update
    suspend fun update(record: RecordEntity)

    @Query("SELECT * FROM records WHERE id = :id LIMIT 1")
    suspend fun byId(id: String): RecordEntity?

    @Query("DELETE FROM records WHERE id = :id")
    suspend fun hardDelete(id: String)

    @Query("SELECT * FROM records WHERE deleted = 0 ORDER BY time DESC")
    fun observeAll(): Flow<List<RecordEntity>>

    @Query("SELECT * FROM records WHERE deleted = 0 ORDER BY time DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<RecordEntity>>

    @Query("SELECT * FROM records WHERE deleted = 0 AND day = :day ORDER BY time ASC")
    fun observeDay(day: String): Flow<List<RecordEntity>>

    @Query("SELECT * FROM records WHERE deleted = 0 AND day = :day ORDER BY time ASC")
    suspend fun listDay(day: String): List<RecordEntity>

    @Query("SELECT COUNT(*) FROM records WHERE deleted = 0 AND day = :day")
    suspend fun countDay(day: String): Int

    @Query("SELECT COUNT(*) FROM records WHERE deleted = 0 AND day = :day")
    fun observeCountDay(day: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM records WHERE deleted = 0 AND synced = 0")
    fun observeUnsyncedCount(): Flow<Int>

    @Query("SELECT no FROM records WHERE deleted = 0 AND classLabel = :classLabel ORDER BY time DESC LIMIT 1")
    suspend fun lastNoFor(classLabel: String): Int?

    @Query("UPDATE records SET synced = 1 WHERE id = :id AND updatedAt = :updatedAt")
    suspend fun markSyncedIfUnchanged(id: String, updatedAt: String)

    @Query("UPDATE records SET deleted = 1, deletedAt = :deletedAt WHERE id = :id")
    suspend fun tombstone(id: String, deletedAt: String)
}

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: OutboxEntity): Long

    @Query("SELECT * FROM outbox ORDER BY seq ASC LIMIT :limit")
    suspend fun next(limit: Int): List<OutboxEntity>

    @Query("SELECT COUNT(*) FROM outbox")
    fun observeCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun count(): Int

    @Query("DELETE FROM outbox WHERE seq IN (:seqs)")
    suspend fun deleteSeqs(seqs: List<Long>)

    @Query("DELETE FROM outbox WHERE refId = :refId")
    suspend fun deleteByRef(refId: String)

    @Query("DELETE FROM outbox")
    suspend fun clear()

    @Delete
    suspend fun delete(item: OutboxEntity)
}

@Dao
interface ConfigDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(config: ConfigEntity)

    @Query("SELECT * FROM config_cache WHERE id = 1 LIMIT 1")
    suspend fun get(): ConfigEntity?

    @Query("SELECT * FROM config_cache WHERE id = 1 LIMIT 1")
    fun observe(): Flow<ConfigEntity?>

    @Query("DELETE FROM config_cache")
    suspend fun clear()
}
