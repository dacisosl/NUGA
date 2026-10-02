package kr.nuga.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kr.nuga.app.data.Prefs
import kr.nuga.app.data.SecureStore
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.graph
import kr.nuga.app.record.RecorderState
import kr.nuga.app.record.RecordingItem
import kr.nuga.app.record.RecordingService
import kr.nuga.app.record.RecordingStatus
import kr.nuga.app.record.TranscribeWorker
import kr.nuga.app.sync.SyncRepository
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.sync.PairingUri
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonState
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime

data class SheetState(
    val classLabel: String,
    val category: Int,
    val no: Int? = null,
    val memo: String = "",
    val source: String = RecordSource.PHONE,
)

sealed interface UiEvent {
    data class Saved(val id: String, val text: String) : UiEvent
    data class Toast(val text: String) : UiEvent
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val g = app.graph

    val config: StateFlow<Config?> = g.configRepo.config

    val settings: StateFlow<Prefs.Settings> = g.prefs.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, Prefs.Settings())

    val pairing: StateFlow<SecureStore.PairingInfo?> = g.secure.state

    /** Wall clock, refreshed every 30 s so the lesson card flips at period boundaries. */
    val now: StateFlow<LocalDateTime> = flow {
        while (true) {
            emit(LocalDateTime.now())
            delay(30_000)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LocalDateTime.now())

    val lesson: StateFlow<LessonState> = combine(config, now) { cfg, t ->
        TimetableResolver.resolve(cfg ?: Config.EMPTY, t)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LessonState(null, null, emptyList()))

    val todayRecords: StateFlow<List<RecordEntity>> = now
        .map { NugaTime.formatDate(it.toLocalDate()) }
        .distinctUntilChanged()
        .flatMapLatest { day -> g.recordRepo.observeDay(day) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val allRecords: StateFlow<List<RecordEntity>> = g.recordRepo.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val outboxCount: StateFlow<Int> = g.recordRepo.observeOutboxCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val syncing: StateFlow<Boolean> = g.syncRepo.syncing

    private val _sheet = MutableStateFlow<SheetState?>(null)
    val sheet: StateFlow<SheetState?> get() = _sheet

    private val _events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<UiEvent> get() = _events

    // ------------------------------------------------------------ 탭 이동 요청 (알림에서)

    private val _tabRequest = MutableStateFlow<String?>(null)
    val tabRequest: StateFlow<String?> get() = _tabRequest
    fun requestTab(tab: String) { _tabRequest.value = tab }
    fun consumeTabRequest() { _tabRequest.value = null }

    // ------------------------------------------------------------ 수업 녹음

    val recordings: StateFlow<List<RecordingItem>> = g.recordings.items
    val recorder: StateFlow<RecorderState> = RecordingService.state
    val speechKeys: StateFlow<SecureStore.SpeechKeys> = g.secure.speechKeys

    fun startRecordingNow() = RecordingService.start(getApplication(), RecordingService.ACTION_START)
    fun startStandby() = RecordingService.start(getApplication(), RecordingService.ACTION_STANDBY_ON)
    fun recorderCommand(action: String) = RecordingService.command(getApplication(), action)
    fun deleteRecording(id: String) = viewModelScope.launch { g.recordings.delete(id) }
    fun retryTranscribe(id: String) = viewModelScope.launch {
        g.recordings.update(id) { it.copy(status = RecordingStatus.RECORDED, attempts = 0, error = "") }
        TranscribeWorker.enqueue(getApplication(), wifiOnly = false)
        _events.tryEmit(UiEvent.Toast("변환을 다시 시도합니다"))
    }
    fun audioFile(item: RecordingItem): java.io.File = g.recordings.audioFile(item)

    // ------------------------------------------------------------ number sheet

    fun openSheet(category: Int? = null, classLabel: String? = null, source: String = RecordSource.PHONE) {
        val cfg = config.value ?: Config.EMPTY
        val cls = classLabel
            ?: _sheet.value?.classLabel
            ?: TimetableResolver.defaultClass(cfg, LocalDateTime.now())
            ?: "미지정"
        val cat = category ?: _sheet.value?.category ?: 1
        _sheet.value = SheetState(classLabel = cls, category = cat.coerceIn(1, 4), source = source)
    }

    fun closeSheet() { _sheet.value = null }
    fun setSheetCategory(category: Int) = _sheet.update { it.copy(category = category) }
    fun setSheetClass(classLabel: String) = _sheet.update { it.copy(classLabel = classLabel, no = null) }
    fun setSheetNo(no: Int?) = _sheet.update { it.copy(no = no) }
    fun setSheetMemo(memo: String) = _sheet.update { it.copy(memo = memo) }
    fun appendSheetMemo(text: String) = _sheet.update {
        it.copy(memo = if (it.memo.isBlank()) text else "${it.memo.trimEnd()} $text")
    }

    fun saveSheet() {
        val s = _sheet.value ?: return
        val no = s.no ?: return
        _sheet.value = null
        viewModelScope.launch {
            val entity = g.recordRepo.create(
                classLabel = s.classLabel,
                no = no,
                category = s.category,
                memo = s.memo,
                source = s.source,
            )
            Haptics.tap(getApplication())
            val label = (config.value ?: Config.EMPTY).categoryLabel(s.category)
            _events.emit(UiEvent.Saved(entity.id, "${s.classLabel} · ${no}번 · $label"))
        }
    }

    fun undo(id: String) {
        viewModelScope.launch { g.recordRepo.undo(id) }
    }

    // ------------------------------------------------------------ records

    fun updateMemo(id: String, memo: String) {
        viewModelScope.launch { g.recordRepo.updateMemo(id, memo) }
    }

    fun deleteRecord(id: String) {
        viewModelScope.launch {
            g.recordRepo.delete(id)
            _events.emit(UiEvent.Toast("삭제"))
        }
    }

    // ------------------------------------------------------------ sync / settings

    fun syncNow() {
        viewModelScope.launch {
            when (val r = g.syncRepo.syncNow()) {
                is SyncRepository.Result.Ok -> _events.emit(UiEvent.Toast("동기화 완료 · 보냄 ${r.sent} · 받음 ${r.received}"))
                is SyncRepository.Result.Error -> _events.emit(UiEvent.Toast("동기화 실패 · ${r.message}"))
                SyncRepository.Result.Unpaired -> _events.emit(UiEvent.Toast("연결 안 됨"))
            }
        }
    }

    fun pair(scanned: String) {
        val pairing = PairingUri.parse(scanned)
        if (pairing == null) {
            viewModelScope.launch { _events.emit(UiEvent.Toast("QR 형식 오류")) }
            return
        }
        viewModelScope.launch {
            when (val r = g.syncRepo.pair(pairing)) {
                is SyncRepository.Result.Ok -> _events.emit(UiEvent.Toast("연결됨 · ${pairing.pcName}"))
                is SyncRepository.Result.Error -> _events.emit(UiEvent.Toast("연결됨 · 동기화 대기 (${r.message})"))
                SyncRepository.Result.Unpaired -> _events.emit(UiEvent.Toast("연결 실패"))
            }
        }
    }

    fun unpair() {
        viewModelScope.launch {
            g.syncRepo.unpair()
            _events.emit(UiEvent.Toast("연결 해제"))
        }
    }

    fun loadDemo() {
        viewModelScope.launch {
            g.configRepo.loadDemo()
            _events.emit(UiEvent.Toast("샘플 설정 적용"))
        }
    }

    fun setShowNames(value: Boolean) = viewModelScope.launch { g.prefs.setShowNames(value) }
    fun setWidgetHint(value: Boolean) = viewModelScope.launch { g.prefs.setWidgetHint(value) }
    fun setAutoOpen(value: Boolean) = viewModelScope.launch {
        g.prefs.setAutoOpenNotify(value)
        kr.nuga.app.alarm.LessonAlarmScheduler.reschedule(getApplication())
    }

    private inline fun MutableStateFlow<SheetState?>.update(block: (SheetState) -> SheetState) {
        val cur = value ?: return
        value = block(cur)
    }
}
