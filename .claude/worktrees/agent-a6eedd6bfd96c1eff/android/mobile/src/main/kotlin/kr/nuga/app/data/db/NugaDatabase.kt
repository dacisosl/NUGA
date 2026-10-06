package kr.nuga.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [RecordEntity::class, OutboxEntity::class, ConfigEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class NugaDatabase : RoomDatabase() {
    abstract fun recordDao(): RecordDao
    abstract fun outboxDao(): OutboxDao
    abstract fun configDao(): ConfigDao

    companion object {
        @Volatile private var instance: NugaDatabase? = null

        fun get(context: Context): NugaDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, NugaDatabase::class.java, "nuga.db")
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
                .also { instance = it }
        }
    }
}
