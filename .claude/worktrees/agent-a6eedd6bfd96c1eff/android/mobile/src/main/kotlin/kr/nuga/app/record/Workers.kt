package kr.nuga.app.record

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kr.nuga.app.NugaApp
import kr.nuga.app.R
import kr.nuga.app.graph
import kr.nuga.app.speech.GeminiTranscriber
import kr.nuga.app.speech.SpeechException
import kr.nuga.app.sync.SyncScheduler
import kr.nuga.app.ui.MainActivity
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.transcript.TranscriptParser
import java.util.concurrent.TimeUnit

/**
 * 녹음이 끝난 수업을 스크립트로 바꾼다. Wi-Fi(설정에 따라)에서만, 실패하면 다시 시도한다.
 * 변환이 끝나면 동기화를 깨워 스크립트를 PC 로 보낸다.
 */
class TranscribeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val g = applicationContext.graph
        val cfg = runCatching { g.configRepo.current() }.getOrNull()
        val rec = cfg?.recording
        if (rec?.active != true) return Result.success()
        val key = g.secure.speechKeys.value.forProvider(rec.speech.provider)
        val pending = g.recordings.items.value.filter {
            (it.status == RecordingStatus.RECORDED || (it.status == RecordingStatus.FAILED && it.attempts < MAX_ATTEMPTS) || it.status == RecordingStatus.TRANSCRIBING) && !it.audioDeleted
        }
        if (pending.isEmpty()) return Result.success()
        if (key.isBlank()) {
            pending.forEach { item -> g.recordings.update(item.id) { it.copy(status = RecordingStatus.RECORDED, error = "음성 변환 키 없음 — PC 설정 → 녹음 → [폰으로 키 보내기]") } }
            return Result.success()
        }
        if (rec.speech.provider != "gemini") {
            pending.forEach { item -> g.recordings.update(item.id) { it.copy(error = "이 버전은 Gemini 음성 변환만 지원") } }
            return Result.success()
        }
        var retry = false
        for (item in pending) {
            val file = g.recordings.audioFile(item)
            if (!file.exists()) { g.recordings.update(item.id) { it.copy(status = RecordingStatus.FAILED, error = "음성 파일 없음", attempts = MAX_ATTEMPTS) }; continue }
            g.recordings.update(item.id) { it.copy(status = RecordingStatus.TRANSCRIBING, error = "") }
            try {
                val raw = GeminiTranscriber(key, rec.speech.model).transcribe(file)
                val tr = TranscriptParser.parse(
                    raw, id = item.id, classLabel = item.classLabel, period = item.period, startedAt = item.startedAt,
                    endedAt = item.endedAt ?: item.startedAt, provider = "gemini", model = rec.speech.model, createdAt = NugaTime.nowIso(),
                )
                g.recordings.saveTranscript(tr)
                g.recordings.update(item.id) { it.copy(status = RecordingStatus.TRANSCRIBED, segmentCount = tr.segments.size, error = "") }
            } catch (e: Exception) {
                Log.w(TAG, "transcribe failed ${item.id}", e)
                val canRetry = (e as? SpeechException)?.retryable ?: true
                val attempts = item.attempts + 1
                g.recordings.update(item.id) { it.copy(status = RecordingStatus.FAILED, error = e.message ?: "변환 실패", attempts = if (canRetry) attempts else MAX_ATTEMPTS) }
                if (canRetry && attempts < MAX_ATTEMPTS) retry = true
            }
        }
        SyncScheduler.requestNow(applicationContext)
        return if (retry) Result.retry() else Result.success()
    }

    companion object {
        private const val TAG = "TranscribeWorker"
        private const val NAME = "nuga-transcribe"
        const val MAX_ATTEMPTS = 5

        fun enqueue(context: Context, wifiOnly: Boolean? = null) {
            val wifi = wifiOnly ?: true
            val req = OneTimeWorkRequestBuilder<TranscribeWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(if (wifi) NetworkType.UNMETERED else NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 2, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }
    }
}

/** 보존 기간(기본 24시간)이 지난 음성을 지우고, 변환하지 못한 채 지워질 녹음은 교사에게 알린다. */
class CleanupWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val g = applicationContext.graph
        val now = System.currentTimeMillis()
        // 1시간 안에 지워질 음성인데 아직 스크립트가 없으면 알림
        val soon = g.recordings.items.value.filter {
            !it.audioDeleted && it.deleteAtMs - now in 0..3_600_000L &&
                it.status in setOf(RecordingStatus.RECORDED, RecordingStatus.FAILED, RecordingStatus.TRANSCRIBING)
        }
        if (soon.isNotEmpty()) notifyExpiring(applicationContext, soon.size)
        g.recordings.cleanup(now)
        // 대기 중인 변환이 있으면 다시 시도
        if (g.recordings.items.value.any { it.status == RecordingStatus.RECORDED && !it.audioDeleted }) {
            val wifi = runCatching { g.configRepo.current()?.recording?.wifiOnly }.getOrNull() ?: true
            TranscribeWorker.enqueue(applicationContext, wifi)
        }
        return Result.success()
    }

    private fun notifyExpiring(context: Context, n: Int) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val pi = PendingIntent.getActivity(context, 8200, Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, "recordings").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notif = NotificationCompat.Builder(context, NugaApp.CHANNEL_RECORDING)
            .setSmallIcon(R.drawable.ic_stat_nuga)
            .setContentTitle("변환하지 못한 녹음 ${n}건이 곧 지워집니다")
            .setContentText("Wi-Fi 연결과 음성 변환 키를 확인해 주세요")
            .setContentIntent(pi).setAutoCancel(true).build()
        runCatching { NotificationManagerCompat.from(context).notify(7103, notif) }
    }

    companion object {
        fun ensurePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<CleanupWorker>(1, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("nuga-recording-cleanup", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
