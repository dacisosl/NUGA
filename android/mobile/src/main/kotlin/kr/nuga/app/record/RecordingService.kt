package kr.nuga.app.record

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kr.nuga.app.NugaApp
import kr.nuga.app.R
import kr.nuga.app.graph
import kr.nuga.app.ui.MainActivity
import kr.nuga.app.widget.WidgetUpdater
import kr.nuga.shared.model.Config
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonSlot
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID

/** 지금 녹음 상태 (화면·위젯이 구독) */
data class RecorderState(
    val recording: RecordingItem? = null,
    val paused: Boolean = false,
    /** 아침 1탭 "오늘 녹음 대기" 중 */
    val standby: Boolean = false,
    /** 일시정지를 뺀 녹음 시작 기준 (elapsedRealtime) */
    val chronoBase: Long = 0L,
)

/**
 * 수업 녹음 포그라운드 서비스 (마이크 유형).
 * Android 14 이상은 백그라운드에서 마이크 서비스를 시작할 수 없으므로, 교사의 1탭(알림·위젯·앱)으로만 시작한다.
 * - START: 지금(또는 지정한) 수업을 녹음, 수업 끝 5분 뒤 자동 종료
 * - STANDBY_ON: 하루 동안 대기하며 시간표대로 녹음을 켜고 끈다 (마지막 수업 뒤 종료)
 * 녹음 중임을 알림에 계속 표시하고, 알림에서 일시정지·중단할 수 있다.
 */
class RecordingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var recorder: MediaRecorder? = null
    private var autoStopJob: Job? = null
    private var standbyJob: Job? = null
    private var pausedAt = 0L
    private var pausedTotal = 0L
    private var startedElapsed = 0L
    /** 대기 모드에서 교사가 직접 멈춘 수업은 다시 켜지 않는다 */
    private val skippedSlots = HashSet<String>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                promote()
                scope.launch { startForLesson(intent.getStringExtra(EXTRA_CLASS), intent.getIntExtra(EXTRA_PERIOD, -1), intent.getLongExtra(EXTRA_END_MS, 0L)) }
            }
            ACTION_STANDBY_ON -> { promote(); startStandby() }
            ACTION_PAUSE -> pause()
            ACTION_RESUME -> resume()
            ACTION_STOP -> scope.launch { stopRecording(userStopped = true); if (!state.value.standby) shutdown() }
            ACTION_STANDBY_OFF -> scope.launch { stopRecording(userStopped = true); shutdown() }
            else -> if (recorder == null && !state.value.standby) stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun hasMic(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    /** 포그라운드로 올린다 (5초 안에 반드시). 마이크 권한이 없으면 알림만 남기고 끝낸다. */
    private fun promote() {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
        } catch (e: Exception) {
            Log.w(TAG, "cannot start foreground: ${e.message}")
            postProblem("녹음을 시작할 수 없음", "앱을 열고 다시 눌러 주세요 (${e.javaClass.simpleName})")
            stopSelf()
        }
    }

    private suspend fun config(): Config? = runCatching { graph.configRepo.current() }.getOrNull()

    private suspend fun startForLesson(classArg: String?, periodArg: Int, endMsArg: Long) {
        if (recorder != null) return
        if (!hasMic()) { postProblem("마이크 권한 필요", "누가 앱 → 녹음 탭에서 마이크 권한을 허용해 주세요"); shutdown(); return }
        val cfg = config()
        if (cfg?.recordingActive != true) { postProblem("녹음이 꺼져 있음", "PC 설정 → 녹음에서 사용 조건을 확인하고 켜야 합니다"); shutdown(); return }
        val now = LocalDateTime.now()
        val slot = TimetableResolver.current(cfg, now) ?: TimetableResolver.resolve(cfg, now).today.firstOrNull { !now.isBefore(it.startDateTime.minusMinutes(10)) && now.isBefore(it.endDateTime) }
        val classLabel = classArg ?: slot?.classLabel ?: TimetableResolver.defaultClass(cfg, now) ?: "수업"
        val period = if (periodArg >= 0) periodArg else slot?.period?.no ?: 0
        val endMs = when {
            endMsArg > 0 -> endMsArg
            slot != null -> slot.endDateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            else -> System.currentTimeMillis() + 60 * 60_000L // 수업 밖: 최대 60분
        }
        begin(classLabel, period, endMs + 5 * 60_000L, cfg.recording?.audioTTLHours ?: 24)
    }

    private suspend fun begin(classLabel: String, period: Int, stopAtMs: Long, ttlHours: Int) {
        val store = graph.recordings
        val id = UUID.randomUUID().toString()
        val file = store.newAudioFile(id)
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(16_000)
            r.setAudioEncodingBitRate(32_000)
            r.setOutputFile(file.absolutePath)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            Log.w(TAG, "recorder failed", e)
            runCatching { r.release() }
            file.delete()
            postProblem("녹음 시작 실패", e.message ?: "마이크를 다른 앱이 쓰고 있을 수 있음")
            if (!state.value.standby) shutdown()
            return
        }
        recorder = r
        startedElapsed = SystemClock.elapsedRealtime(); pausedTotal = 0L; pausedAt = 0L
        val startMs = System.currentTimeMillis()
        val item = RecordingItem(
            id = id, classLabel = classLabel, period = period, startedAt = NugaTime.nowIso(), fileName = file.name,
            status = RecordingStatus.RECORDING, deleteAtMs = RecordingStore.deleteAt(startMs, ttlHours),
        )
        store.upsert(item)
        _state.value = _state.value.copy(recording = item, paused = false, chronoBase = startedElapsed)
        refresh()
        autoStopJob?.cancel()
        autoStopJob = scope.launch {
            delay((stopAtMs - System.currentTimeMillis()).coerceAtLeast(60_000L))
            stopRecording(userStopped = false)
            if (!state.value.standby) shutdown()
        }
    }

    private fun pause() {
        val r = recorder ?: return
        if (_state.value.paused) return
        runCatching { r.pause() }.onFailure { Log.w(TAG, "pause failed: ${it.message}"); return }
        pausedAt = SystemClock.elapsedRealtime()
        _state.value = _state.value.copy(paused = true)
        scope.launch { _state.value.recording?.let { graph.recordings.update(it.id) { x -> x.copy(status = RecordingStatus.PAUSED) } }; refresh() }
    }

    private fun resume() {
        val r = recorder ?: return
        if (!_state.value.paused) return
        runCatching { r.resume() }.onFailure { Log.w(TAG, "resume failed: ${it.message}"); return }
        pausedTotal += SystemClock.elapsedRealtime() - pausedAt; pausedAt = 0L
        _state.value = _state.value.copy(paused = false, chronoBase = startedElapsed + pausedTotal)
        scope.launch { _state.value.recording?.let { graph.recordings.update(it.id) { x -> x.copy(status = RecordingStatus.RECORDING) } }; refresh() }
    }

    private suspend fun stopRecording(userStopped: Boolean) {
        autoStopJob?.cancel(); autoStopJob = null
        val r = recorder ?: return
        recorder = null
        val item = _state.value.recording
        val now = SystemClock.elapsedRealtime()
        val paused = pausedTotal + if (pausedAt > 0) now - pausedAt else 0L
        val durationSec = ((now - startedElapsed - paused) / 1000).toInt().coerceAtLeast(0)
        val ok = runCatching { r.stop() }.isSuccess
        runCatching { r.release() }
        if (item != null) {
            if (userStopped && _state.value.standby) skippedSlots += slotKey(item.classLabel, item.period)
            val store = graph.recordings
            if (!ok || durationSec < 5) {
                store.delete(item.id) // 너무 짧거나 깨진 녹음은 남기지 않는다
            } else {
                store.update(item.id) { it.copy(status = RecordingStatus.RECORDED, endedAt = NugaTime.nowIso(), durationSec = durationSec) }
                TranscribeWorker.enqueue(this, config()?.recording?.wifiOnly)
            }
        }
        _state.value = _state.value.copy(recording = null, paused = false)
        refresh()
    }

    /* ---------------- 오늘 녹음 대기 ---------------- */

    private fun startStandby() {
        if (!hasMic()) { postProblem("마이크 권한 필요", "누가 앱 → 녹음 탭에서 마이크 권한을 허용해 주세요"); shutdown(); return }
        _state.value = _state.value.copy(standby = true)
        refresh()
        standbyJob?.cancel()
        standbyJob = scope.launch {
            val today = LocalDateTime.now().toLocalDate()
            while (isActive) {
                val cfg = config()
                if (cfg?.recordingActive != true) break
                val now = LocalDateTime.now()
                if (now.toLocalDate() != today) break
                val slots = TimetableResolver.slotsOn(cfg, today)
                val cur: LessonSlot? = slots.firstOrNull { !now.isBefore(it.startDateTime) && now.isBefore(it.endDateTime) }
                if (recorder == null && cur != null && slotKey(cur.classLabel, cur.period.no) !in skippedSlots) {
                    begin(cur.classLabel, cur.period.no, cur.endDateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() + 2 * 60_000L, cfg.recording?.audioTTLHours ?: 24)
                }
                val last = slots.maxByOrNull { it.endDateTime }
                if (recorder == null && (last == null || now.isAfter(last.endDateTime.plusMinutes(10)))) break
                delay(20_000L)
            }
            _state.value = _state.value.copy(standby = false)
            if (recorder == null) shutdown() else refresh()
        }
    }

    private fun slotKey(c: String, p: Int) = "$c#$p"

    private fun shutdown() {
        standbyJob?.cancel(); standbyJob = null
        _state.value = RecorderState()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
        scope.launch { WidgetUpdater.updateAll(this@RecordingService) }
    }

    override fun onDestroy() {
        // 시스템이 서비스를 끝내도 녹음 파일은 닫아 둔다
        recorder?.let { r -> runCatching { r.stop() }; runCatching { r.release() } }
        recorder = null
        val item = _state.value.recording
        if (item != null) {
            kotlinx.coroutines.runBlocking { graph.recordings.update(item.id) { it.copy(status = RecordingStatus.RECORDED, endedAt = NugaTime.nowIso()) } }
            TranscribeWorker.enqueue(this)
        }
        _state.value = RecorderState()
        scope.cancel()
        super.onDestroy()
    }

    /* ---------------- 알림 ---------------- */

    private fun refresh() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED || Build.VERSION.SDK_INT < 33) {
            runCatching { NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification()) }
        }
        scope.launch { WidgetUpdater.updateAll(this@RecordingService) }
    }

    private fun buildNotification(): Notification {
        val st = _state.value
        val rec = st.recording
        val title = when {
            rec != null && st.paused -> "일시정지 · ${rec.classLabel}${if (rec.period > 0) " ${rec.period}교시" else ""}"
            rec != null -> "● 녹음 중 · ${rec.classLabel}${if (rec.period > 0) " ${rec.period}교시" else ""}"
            st.standby -> "오늘 녹음 대기 중"
            else -> "녹음 준비"
        }
        val text = when {
            rec != null -> "음성은 이 폰에만 저장되고 ${((rec.deleteAtMs - (NugaTime.parseEpochMillis(rec.startedAt) ?: rec.deleteAtMs)) / 3_600_000L).coerceAtLeast(1)}시간 뒤 지워집니다"
            st.standby -> "시간표의 수업 시간에 자동으로 녹음합니다"
            else -> ""
        }
        val b = NotificationCompat.Builder(this, NugaApp.CHANNEL_RECORDING)
            .setSmallIcon(R.drawable.ic_stat_nuga)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(PendingIntent.getActivity(this, 8100, Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, "recordings").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        if (rec != null && !st.paused) b.setUsesChronometer(true).setWhen(System.currentTimeMillis() - (SystemClock.elapsedRealtime() - st.chronoBase)).setShowWhen(true)
        if (rec != null) {
            b.addAction(0, if (st.paused) "다시 녹음" else "일시정지", servicePi(this, if (st.paused) ACTION_RESUME else ACTION_PAUSE, 8101))
            b.addAction(0, "중단", servicePi(this, ACTION_STOP, 8102))
        }
        if (st.standby) b.addAction(0, "대기 끄기", servicePi(this, ACTION_STANDBY_OFF, 8103))
        return b.build()
    }

    private fun postProblem(title: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val n = NotificationCompat.Builder(this, NugaApp.CHANNEL_RECORDING)
            .setSmallIcon(R.drawable.ic_stat_nuga).setContentTitle(title).setContentText(text).setAutoCancel(true)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text)).build()
        runCatching { NotificationManagerCompat.from(this).notify(PROBLEM_ID, n) }
    }

    companion object {
        private const val TAG = "RecordingService"
        const val NOTIFICATION_ID = 7101
        const val PROBLEM_ID = 7102
        const val ACTION_START = "kr.nuga.app.record.START"
        const val ACTION_STOP = "kr.nuga.app.record.STOP"
        const val ACTION_PAUSE = "kr.nuga.app.record.PAUSE"
        const val ACTION_RESUME = "kr.nuga.app.record.RESUME"
        const val ACTION_STANDBY_ON = "kr.nuga.app.record.STANDBY_ON"
        const val ACTION_STANDBY_OFF = "kr.nuga.app.record.STANDBY_OFF"
        const val EXTRA_CLASS = "class"
        const val EXTRA_PERIOD = "period"
        const val EXTRA_END_MS = "endMs"

        private val _state = MutableStateFlow(RecorderState())
        val state: StateFlow<RecorderState> get() = _state

        /** 이미 실행 중인 서비스에 보내는 명령 (일시정지·중단). 시작은 [RecordStartActivity] 를 거친다. */
        fun servicePi(context: Context, action: String, req: Int): PendingIntent =
            PendingIntent.getService(context, req, Intent(context, RecordingService::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        /** 앱이 화면에 있을 때 바로 시작 (화면 버튼) */
        fun start(context: Context, action: String, classLabel: String? = null, period: Int = -1, endMs: Long = 0L) {
            val i = Intent(context, RecordingService::class.java).setAction(action)
            classLabel?.let { i.putExtra(EXTRA_CLASS, it) }
            i.putExtra(EXTRA_PERIOD, period); i.putExtra(EXTRA_END_MS, endMs)
            ContextCompat.startForegroundService(context, i)
        }

        fun command(context: Context, action: String) {
            if (_state.value.recording == null && !_state.value.standby) return
            context.startService(Intent(context, RecordingService::class.java).setAction(action))
        }
    }
}
