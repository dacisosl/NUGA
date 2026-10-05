package kr.nuga.wear.ui

import android.app.Application
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kr.nuga.shared.model.CATEGORY_NONE
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.Record
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.model.RecordStatus
import kr.nuga.shared.model.ReelStart
import kr.nuga.shared.model.VoiceMemo
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonState
import kr.nuga.shared.timetable.TimetableResolver
import kr.nuga.wear.watchGraph
import java.time.LocalDateTime
import java.util.UUID

class WatchViewModel(app: Application) : AndroidViewModel(app) {
    private val g = app.watchGraph

    val config: StateFlow<Config?> = g.store.config
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val now: StateFlow<LocalDateTime> = flow {
        while (true) {
            emit(LocalDateTime.now())
            delay(30_000)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LocalDateTime.now())

    val lesson: StateFlow<LessonState> = combine(config, now) { cfg, t ->
        TimetableResolver.resolve(cfg ?: Config.EMPTY, t)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LessonState(null, null, emptyList()))

    val todayCount: StateFlow<Int> = combine(g.store.saved, now) { list, t ->
        val today = NugaTime.formatDate(t.toLocalDate())
        list.count { it.time.startsWith(today) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val queueSize: StateFlow<Int> = g.store.queue.map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val phoneConnected: StateFlow<Boolean> = g.sync.phoneConnected

    val autoLaunch: StateFlow<Boolean> = combine(config, g.store.autoLaunchOverride) { cfg, o ->
        when (o) {
            "on" -> true
            "off" -> false
            else -> cfg?.options?.autoLaunchWatch ?: false
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    /** Record waiting for the 5-second cancel window (not yet sent). */
    private val _draft = MutableStateFlow<Record?>(null)
    val draft: StateFlow<Record?> get() = _draft

    init {
        viewModelScope.launch { g.sync.refreshConnection() }
    }

    /** Lesson notification's [기록] action: skip home and open the number reel. */
    private val _reelRequest = MutableStateFlow(false)
    val reelRequest: StateFlow<Boolean> get() = _reelRequest
    fun requestReel() { _reelRequest.value = true }
    fun consumeReelRequest() { _reelRequest.value = false }

    /** Waits briefly for the stored config on a cold start (null if the watch has none yet). */
    suspend fun awaitConfig(): Config? = config.value ?: withTimeoutOrNull(1_500) { config.filterNotNull().first() }

    /** Class to record for: current lesson, else next lesson today, else first configured class. */
    fun activeClass(): String {
        val cfg = config.value ?: return "미지정"
        return TimetableResolver.defaultClass(cfg, LocalDateTime.now()) ?: "미지정"
    }

    fun classSize(classLabel: String): Int = (config.value ?: Config.EMPTY).classSize(classLabel)

    /** Reel start index (1-based number) per config.options.reelStart. */
    suspend fun reelStart(classLabel: String): Int {
        val cfg = config.value
        val size = classSize(classLabel)
        return if (cfg?.options?.reelStart == ReelStart.LAST) {
            (g.store.lastNo(classLabel) ?: 1).coerceIn(1, size)
        } else 1
    }

    /** Save tap on the reel: build the record (category 0 = 미정, the PC decides), vibrate once, open the done screen. */
    fun startDraft(classLabel: String, no: Int) {
        val nowDt = LocalDateTime.now()
        val iso = NugaTime.toIso(nowDt)
        val lessonInfo = config.value?.let { TimetableResolver.lessonInfoFor(it, nowDt, classLabel) }
        val record = Record(
            id = UUID.randomUUID().toString(),
            classLabel = classLabel,
            no = no,
            category = CATEGORY_NONE,
            time = iso,
            lesson = lessonInfo,
            memo = "",
            voiceMemo = null,
            note = "",
            status = RecordStatus.PENDING,
            source = RecordSource.WATCH,
            createdAt = iso,
            updatedAt = iso,
        )
        _draft.value = record
        vibrate()
        viewModelScope.launch { g.store.addSaved(record) }
    }

    fun setDraftTranscript(text: String) {
        val d = _draft.value ?: return
        if (text.isBlank()) return
        val updated = d.copy(voiceMemo = VoiceMemo(durationSec = 0, transcript = text.trim()), updatedAt = NugaTime.nowIso())
        _draft.value = updated
        viewModelScope.launch { g.store.addSaved(updated) }
    }

    fun cancelDraft() {
        val d = _draft.value ?: return
        _draft.value = null
        viewModelScope.launch { g.store.removeSaved(d.id) }
    }

    /** Countdown finished (or user left): queue + send to the phone. */
    fun commitDraft() {
        val d = _draft.value ?: return
        _draft.value = null
        viewModelScope.launch { g.sync.enqueueAndSend(d) }
    }

    fun retryQueue() {
        viewModelScope.launch { g.sync.flush() }
    }

    fun setAutoLaunch(on: Boolean) {
        viewModelScope.launch {
            g.store.setAutoLaunchOverride(if (on) "on" else "off")
            kr.nuga.wear.alarm.WatchAlarmScheduler.reschedule(getApplication())
        }
    }

    private fun vibrate() {
        val app = getApplication<Application>()
        val v: Vibrator? = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            app.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            app.getSystemService(Application.VIBRATOR_SERVICE) as? Vibrator
        }
        runCatching { v?.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE)) }
    }
}
