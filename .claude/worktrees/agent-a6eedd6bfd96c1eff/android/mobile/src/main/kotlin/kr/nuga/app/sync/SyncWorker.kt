package kr.nuga.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kr.nuga.app.graph
import kr.nuga.app.widget.WidgetUpdater
import java.util.concurrent.TimeUnit

/** Runs one sync pass. Scheduled periodically (15 min), on demand, and whenever a network becomes available. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = applicationContext.graph
        val result = graph.syncRepo.syncNow()
        WidgetUpdater.updateAll(applicationContext)
        return when (result) {
            is SyncRepository.Result.Ok, SyncRepository.Result.Unpaired -> Result.success()
            is SyncRepository.Result.Error -> if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}

object SyncScheduler {
    private const val PERIODIC = "nuga-sync-periodic"
    private const val ONESHOT = "nuga-sync-now"

    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(network)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** One-shot sync as soon as a network is available (this is also the "network returned" trigger). */
    fun requestNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(network)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(ONESHOT, ExistingWorkPolicy.KEEP, request)
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(ONESHOT)
    }
}
