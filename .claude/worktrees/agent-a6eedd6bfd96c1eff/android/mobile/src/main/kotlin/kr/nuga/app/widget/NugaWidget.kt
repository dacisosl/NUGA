package kr.nuga.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.Visibility
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartService
import androidx.glance.appwidget.lazy.GridCells
import androidx.glance.appwidget.lazy.LazyVerticalGrid
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.visibility
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.nuga.app.R
import kr.nuga.app.graph
import kr.nuga.app.record.RecordStartActivity
import kr.nuga.app.record.RecordingService
import kr.nuga.app.ui.MainActivity
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.shared.model.CATEGORY_NONE
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonState
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime
import java.time.ZoneId

private const val TAG = "NugaWidget"

class NugaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NugaWidget()

    /** 교시 경계 알람([WidgetUpdater.ACTION_TICK]): 지금 수업이 바뀌었으니 번호 칸의 반까지 새로 그린다 */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != WidgetUpdater.ACTION_TICK) return
        val result = goAsync()
        context.graph.scope.launch {
            try {
                WidgetUpdater.updateAll(context)
            } finally {
                result.finish()
            }
        }
    }
}

object WidgetUpdater {
    const val ACTION_TICK = "kr.nuga.app.WIDGET_TICK"
    private const val TICK_REQUEST = 4102

    /**
     * 다시 읽기 신호. 위젯 세션이 살아 있으면 update()는 provideGlance를 다시 돌리지 않고 다시 그리기만 하므로,
     * 세션 안에서 이 값을 보고 수업 · 오늘 기록 수 · 번호 칸을 다시 읽는다.
     */
    internal val refresh = MutableStateFlow(0)

    suspend fun updateAll(context: Context) {
        refresh.update { it + 1 }
        runCatching { NugaWidget().updateAll(context) }
            .onFailure { Log.w("WidgetUpdater", "update failed: ${it.message}") }
        runCatching { scheduleTick(context) }
            .onFailure { Log.w("WidgetUpdater", "tick failed: ${it.message}") }
    }

    /** 다음 교시 시작 · 끝에 한 번 더 그린다(번호 칸의 반이 수업을 따라 바뀌게). 깨우지 않는 알람: 화면이 켜질 때 받는다 */
    private suspend fun scheduleTick(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(
            context, TICK_REQUEST,
            Intent(context, NugaWidgetReceiver::class.java).setAction(ACTION_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val placed = GlanceAppWidgetManager(context).getGlanceIds(NugaWidget::class.java).isNotEmpty()
        val config = if (placed) context.graph.configRepo.current() else null
        val now = LocalDateTime.now()
        val at = config?.let { TimetableResolver.resolve(it, now) }
            ?.let { l -> listOfNotNull(l.current?.endDateTime, l.next?.startDateTime).filter { it.isAfter(now) }.minOrNull() }
        if (at == null) {
            am.cancel(pi)
            return
        }
        val ms = at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
            am.setExact(AlarmManager.RTC, ms, pi)
        } else {
            am.setWindow(AlarmManager.RTC, ms, 60_000L, pi)
        }
    }
}

/**
 * 4×2 홈 화면 위젯: 위는 지금(또는 다음) 수업 + 오늘 기록 수, 아래는 그 반 번호 칸(3명씩, 스크롤) + 오른쪽 [기록].
 * 번호를 누르면 고르고(다시 누르면 풀림), [N번 기록]은 그 학생을 바로 저장한다. 고르지 않은 [기록]은 기록 시트를 연다.
 */
class NugaWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Single

    data class State(
        val headline: String,
        val subline: String,
        val inClass: Boolean,
        val todayCount: Int,
        /** null = 녹음 꺼짐, "idle" / "recording" / "paused" / "standby" */
        val rec: String? = null,
        val target: Target,
        /** 번호 → 이름. 앱에서 이름 표시를 켜고 명렬표에 그 반이 있을 때만 */
        val names: Map<Int, String> = emptyMap(),
    )

    /** 번호 칸의 반과 인원. [key](날짜|교시|반)가 바뀌면(수업이 바뀌면) 고른 번호는 버린다 */
    data class Target(val classLabel: String, val size: Int, val key: String)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val loadedAt = WidgetUpdater.refresh.value
        val first = loadState(context)
        provideContent {
            // 세션이 살아 있는 동안 update()는 여기를 다시 돌리지 않는다: 다시 읽기 신호를 따로 본다
            val tick by WidgetUpdater.refresh.collectAsState()
            val state by produceState(first, tick) { if (tick != loadedAt) value = loadState(context) }
            WidgetContent(state, currentState<Preferences>())
        }
    }

    private suspend fun loadState(context: Context): State {
        val g = context.graph
        val config = runCatching { g.configRepo.current() }.getOrNull()
        val todayCount = runCatching { g.db.recordDao().countDay(NugaTime.todayIso()) }.getOrDefault(0)
        val showNames = runCatching { g.prefs.current().showNames }.getOrDefault(false)
        val now = LocalDateTime.now()
        val lesson = TimetableResolver.resolve(config ?: Config.EMPTY, now)
        val target = target(config, now, lesson)
        if (config == null) {
            return State("설정 없음", "PC 연결 또는 샘플 설정", false, todayCount, target = target)
        }
        // 번호 시트와 같은 기준: 이름 표시를 켰고 명렬표가 있을 때만 (홈 화면은 누구나 보므로)
        val names = if (!showNames) emptyMap() else config.roster.orEmpty()
            .filter { it.classLabel == target.classLabel }
            .associate { it.no to it.name }
        val rs = RecordingService.state.value
        val rec = if (!config.recordingActive) null else when {
            rs.recording != null && rs.paused -> "paused"
            rs.recording != null -> "recording"
            rs.standby -> "standby"
            else -> "idle"
        }
        val current = lesson.current
        val next = lesson.next
        return when {
            current != null -> State(current.headline, current.subline ?: "${current.period.start}–${current.period.end}", true, todayCount, rec, target, names)
            next != null -> {
                val dayPrefix = if (next.date == now.toLocalDate()) "" else "${NugaTime.koreanDate(next.date)} "
                State("예정 · ${next.headline}", "$dayPrefix${next.period.start} 시작" + (next.subline?.let { " · $it" } ?: ""), false, todayCount, rec, target, names)
            }
            else -> State("수업 없음", "시간표 없음", false, todayCount, rec, target, names)
        }
    }

    companion object {
        /** 번호 칸의 반: 지금 수업 → 다음 수업 → 기록 시트와 같은 기본값(첫 반, 없으면 '미지정'). 인원도 시트와 같다 */
        fun target(config: Config?, now: LocalDateTime, lesson: LessonState = TimetableResolver.resolve(config ?: Config.EMPTY, now)): Target {
            val cfg = config ?: Config.EMPTY
            val slot = lesson.current ?: lesson.next
            val cls = slot?.classLabel ?: TimetableResolver.defaultClass(cfg, now) ?: "미지정"
            val key = if (slot != null) "${slot.date}|${slot.period.no}|$cls" else "${now.toLocalDate()}|0|$cls"
            return Target(cls, cfg.classSize(cls).coerceAtLeast(1), key)
        }

        /** 지금 시각 기준(누른 순간). 위젯이 늦게 그려졌어도 저장은 이 기준을 따른다 */
        suspend fun target(context: Context): Target =
            target(runCatching { context.graph.configRepo.current() }.getOrNull(), LocalDateTime.now())
    }
}

// ------------------------------------------------------------------ 위젯 상태 · 누르기

// 위젯마다 따로 두는 상태(Glance Preferences): 고른 번호와 그 수업 key, 머리에 잠깐 띄우는 알림
private val SelNo = intPreferencesKey("sel_no")
private val SelKey = stringPreferencesKey("sel_key")
private val NoteText = stringPreferencesKey("note")
private val NoteAt = longPreferencesKey("note_at")
private val NoteId = stringPreferencesKey("note_id")
private val NoteNo = intPreferencesKey("note_no")

private val NoParam = ActionParameters.Key<Int>("no")
private val KeyParam = ActionParameters.Key<String>("key")
private val ClassParam = ActionParameters.Key<String>("class")
private val OnParam = ActionParameters.Key<Boolean>("on")
private val IdParam = ActionParameters.Key<String>("id")

/** 저장 알림 · [취소]가 머리에 머무는 시간 (앱의 5초 취소와 같다) */
private const val NOTE_MS = 5_000L

/** 번호 칸 누르기: 고르기 ↔ 풀기. 위젯이 늦게 그려져 수업이 바뀌었으면 지금 수업 기준으로 고르고 다시 읽는다 */
class PickNoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val no = parameters[NoParam] ?: return
        val t = NugaWidget.target(context)
        updateAppWidgetState(context, glanceId) { p ->
            if (parameters[OnParam] == true || no !in 1..t.size) {
                p.remove(SelNo)
                p.remove(SelKey)
            } else {
                p[SelNo] = no
                p[SelKey] = t.key
            }
        }
        redraw(context, glanceId, reload = t.key != parameters[KeyParam])
    }
}

/**
 * [N번 기록]: 고른 학생을 지금 시각 · 미정(0) · 메모 없이 · 위젯 출처로 저장한다.
 * 번호 시트 저장과 같은 길(RecordRepository.create → outbox → PC 동기화). 두 번 눌러도 한 번만 저장된다.
 */
class SaveNoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val no = parameters[NoParam] ?: return
        val key = parameters[KeyParam] ?: return
        val cls = parameters[ClassParam] ?: return
        var taken = false
        updateAppWidgetState(context, glanceId) { p ->
            if (p[SelNo] == no && p[SelKey] == key) {
                taken = true
                p.remove(SelNo)
                p.remove(SelKey)
            }
        }
        if (!taken) {
            redraw(context, glanceId, reload = false)
            return
        }
        // 그사이 수업이 바뀌어 반이 달라졌으면 저장하지 않는다 (엉뚱한 반에 남지 않게)
        if (NugaWidget.target(context).classLabel != cls) {
            note(context, glanceId, "수업이 바뀌어 저장 안 함", reload = true)
            return
        }
        val saved = runCatching {
            context.graph.recordRepo.create(classLabel = cls, no = no, category = CATEGORY_NONE, source = RecordSource.WIDGET)
        }.onFailure { Log.w(TAG, "save failed: ${it.message}") }.getOrNull()
        if (saved == null) {
            note(context, glanceId, "저장 실패", reload = false)
        } else {
            note(context, glanceId, "✓ ${two(no)}번 기록", reload = false, recordId = saved.id, no = no)
        }
    }
}

/** [취소]: 방금 위젯에서 저장한 기록을 되돌린다 — 앱의 5초 취소와 같은 길(안 보냈으면 지우고, 보냈으면 삭제를 PC로) */
class UndoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[IdParam]?.takeIf { it.isNotEmpty() } ?: return
        var hit = false
        updateAppWidgetState(context, glanceId) { p ->
            if (p[NoteId] == id) {
                hit = true
                p.remove(NoteId)
            }
        }
        if (!hit) {
            redraw(context, glanceId, reload = false)
            return
        }
        runCatching { context.graph.recordRepo.undo(id) }.onFailure { Log.w(TAG, "undo failed: ${it.message}") }
        val no = parameters[NoParam]?.takeIf { it > 0 }
        note(context, glanceId, (no?.let { "${two(it)}번 " } ?: "") + "기록 취소", reload = false)
    }
}

/** 상태를 바꾼 뒤 이 위젯을 다시 그린다. [reload]면 수업 · 기록 수 · 번호 칸까지 다시 읽는다 */
private suspend fun redraw(context: Context, glanceId: GlanceId, reload: Boolean) {
    if (reload) WidgetUpdater.refresh.update { it + 1 }
    NugaWidget().update(context, glanceId)
}

/** 머리 둘째 줄에 [NOTE_MS] 동안 띄우는 알림. [recordId]가 있으면 옆에 [취소] */
private suspend fun note(context: Context, glanceId: GlanceId, text: String, reload: Boolean, recordId: String? = null, no: Int? = null) {
    val at = System.currentTimeMillis()
    updateAppWidgetState(context, glanceId) { p ->
        p[NoteText] = text
        p[NoteAt] = at
        if (recordId != null) p[NoteId] = recordId else p.remove(NoteId)
        if (no != null) p[NoteNo] = no else p.remove(NoteNo)
    }
    redraw(context, glanceId, reload)
    // 앱 범위에서 지운다(방송 · 위젯 세션이 먼저 끝나도). 그사이 새 알림이 왔거나 위젯을 치웠으면 그대로 둔다
    context.graph.scope.launch {
        delay(NOTE_MS)
        runCatching {
            if (glanceId !in GlanceAppWidgetManager(context).getGlanceIds(NugaWidget::class.java)) return@runCatching
            var cleared = false
            updateAppWidgetState(context, glanceId) { p ->
                if (p[NoteAt] == at) {
                    p.remove(NoteText)
                    p.remove(NoteAt)
                    p.remove(NoteId)
                    p.remove(NoteNo)
                    cleared = true
                }
            }
            if (cleared) NugaWidget().update(context, glanceId)
        }.onFailure { Log.w(TAG, "note clear failed: ${it.message}") }
    }
}

// ------------------------------------------------------------------ 그리기

/** 번호 칸 한 칸 높이(칸 사이 6dp 빼고). 46 + 6 = 52dp가 한 줄: 4×2 위젯에서 두 줄쯤 보이고 나머지는 스크롤 */
private val TileHeight = 46.dp

/** "05" — 번호는 늘 두 자리 */
private fun two(n: Int): String = n.toString().padStart(2, '0')

/**
 * 위젯은 늘 밤 유리(어떤 배경화면에서도 같은 대비): 밤 잉크 글자, 지금 수업은 하늘빛 제목.
 * 아래 왼쪽은 번호 칸(밤 위 옅은 유리, 고른 칸만 켜진 밝은 유리), 오른쪽은 [기록] — 밤 위에 켜진 밝은 유리(#DEEBFF)에 남색 글자.
 * 다시 그릴 때 자리(구조)는 그대로 두고 글자 · 색 · 보임만 바꾼다: 번호 칸 스크롤이 덜 튄다.
 */
@Composable
private fun WidgetContent(state: NugaWidget.State, prefs: Preferences) {
    val context = LocalContext.current
    val t = state.target
    // 고른 번호는 지금 수업(key)의 것일 때만. 수업이 바뀌면 버린다
    val sel = prefs[SelNo]?.takeIf { prefs[SelKey] == t.key && it in 1..t.size }
    // 지우기를 놓쳤어도(프로세스 종료) 오래된 알림은 보이지 않게
    val note = prefs[NoteText]?.takeIf { System.currentTimeMillis() - (prefs[NoteAt] ?: 0L) < NOTE_MS + 3_000L }
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg))
            .padding(start = 11.dp, end = 12.dp, top = 12.dp, bottom = 9.dp)
            .clickable(actionStartActivity(openIntent(context, t.classLabel))),
    ) {
        Header(state, note, undoId = prefs[NoteId]?.takeIf { note != null }, undoNo = prefs[NoteNo])
        Spacer(modifier = GlanceModifier.height(7.dp))
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            NumberGrid(state, sel, modifier = GlanceModifier.defaultWeight().fillMaxHeight())
            Spacer(modifier = GlanceModifier.width(5.dp))
            CaptureButton(t, sel, modifier = GlanceModifier.width(84.dp).fillMaxHeight())
        }
    }
}

/** 머리: 수업 제목, 둘째 줄(단원 · 차시, 또는 방금 저장 알림 + [취소]), 녹음 버튼, 오늘 기록 수 */
@Composable
private fun Header(state: NugaWidget.State, note: String?, undoId: String?, undoNo: Int?) {
    val ink = ColorProvider(NugaColors.Ink)
    // 번호 칸의 3dp 여백만큼 안으로: 제목과 번호 칸의 왼쪽 끝을 맞춘다
    Row(modifier = GlanceModifier.fillMaxWidth().padding(start = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = state.headline,
                style = TextStyle(color = if (state.inClass) ColorProvider(NugaColors.Sky) else ink, fontSize = 17.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
            )
            Row(modifier = GlanceModifier.height(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = note ?: state.subline,
                    style = TextStyle(
                        color = ColorProvider(if (note != null) NugaColors.Sky else NugaColors.Ink2),
                        fontSize = 12.sp,
                        fontWeight = if (note != null) FontWeight.Bold else FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                UndoChip(undoId, undoNo)
            }
        }
        if (state.rec != null) {
            RecordButton(state.rec)
            Spacer(modifier = GlanceModifier.width(10.dp))
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(text = "${state.todayCount}", style = TextStyle(color = ColorProvider(NugaColors.InkNum), fontSize = 22.sp, fontWeight = FontWeight.Bold))
            Text(text = "오늘", style = TextStyle(color = ColorProvider(NugaColors.Ink3), fontSize = 11.sp, fontWeight = FontWeight.Medium))
        }
    }
}

/** 방금 위젯에서 저장한 기록의 [취소] (5초). 자리는 늘 두고 보임만 바꾼다 */
@Composable
private fun UndoChip(recordId: String?, no: Int?) {
    Box(
        modifier = GlanceModifier
            .padding(start = 8.dp)
            .visibility(if (recordId != null) Visibility.Visible else Visibility.Gone),
    ) {
        Box(
            modifier = GlanceModifier
                .background(ImageProvider(R.drawable.widget_btn_bg))
                .padding(horizontal = 9.dp, vertical = 1.dp)
                .clickable(actionRunCallback<UndoAction>(actionParametersOf(IdParam to (recordId ?: ""), NoParam to (no ?: 0)))),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = "취소", style = TextStyle(color = ColorProvider(NugaColors.Btn2Ink), fontSize = 11.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        }
    }
}

/** 녹음 상태 표시 겸 버튼: 꺼짐이면 [● 녹음](1탭 시작), 녹음 중이면 [■ 중단] */
@Composable
private fun RecordButton(rec: String) {
    val context = LocalContext.current
    val red = ColorProvider(NugaColors.RecOnDark)
    val (label, action) = when (rec) {
        "recording" -> "● 녹음 중" to actionStartService(Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_STOP))
        "paused" -> "일시정지" to actionStartService(Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_RESUME))
        "standby" -> "녹음 대기" to actionStartActivity(RecordStartActivity.intent(context))
        else -> "● 녹음" to actionStartActivity(RecordStartActivity.intent(context))
    }
    Box(
        modifier = GlanceModifier.background(ImageProvider(R.drawable.widget_btn_bg)).padding(horizontal = 10.dp, vertical = 7.dp).clickable(action),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, style = TextStyle(color = if (rec == "recording") red else ColorProvider(NugaColors.Btn2Ink), fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
    }
}

/** 번호 칸: 그 반 1..N을 3명씩. 두 줄쯤 보이고 나머지는 위아래로 스크롤. 누르면 고르고, 다시 누르면 푼다 */
@Composable
private fun NumberGrid(state: NugaWidget.State, sel: Int?, modifier: GlanceModifier) {
    val t = state.target
    val withNames = state.names.isNotEmpty()
    LazyVerticalGrid(gridCells = GridCells.Fixed(3), modifier = modifier) {
        items(t.size, itemId = { it + 1L }) { index ->
            val n = index + 1
            NumberTile(n, state.names[n], withNames, selected = n == sel, key = t.key)
        }
    }
}

/** 번호 한 칸: "05" 크게, 이름은 그 아래 작게(이름 표시일 때만). 고른 칸은 켜진 밝은 유리 + 남색 글자 */
@Composable
private fun NumberTile(n: Int, name: String?, withNames: Boolean, selected: Boolean, key: String) {
    Box(modifier = GlanceModifier.fillMaxWidth().padding(3.dp)) {
        Column(
            modifier = GlanceModifier
                .fillMaxWidth()
                .height(TileHeight)
                .background(ImageProvider(if (selected) R.drawable.widget_tile_on_bg else R.drawable.widget_tile_bg))
                .clickable(actionRunCallback<PickNoAction>(actionParametersOf(NoParam to n, KeyParam to key, OnParam to selected)))
                .semantics { contentDescription = listOfNotNull("${n}번", name, "선택됨".takeIf { selected }).joinToString(" ") },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = two(n),
                style = TextStyle(
                    color = ColorProvider(if (selected) NugaColors.BtnLtInk else NugaColors.InkNum),
                    fontSize = if (withNames) 17.sp else 19.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                ),
                maxLines = 1,
                modifier = GlanceModifier.fillMaxWidth(),
            )
            if (withNames) {
                Text(
                    text = name ?: "",
                    style = TextStyle(
                        color = ColorProvider(if (selected) NugaColors.Text2 else NugaColors.Ink2),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    ),
                    maxLines = 1,
                    modifier = GlanceModifier.fillMaxWidth(),
                )
            }
        }
    }
}

/**
 * [기록]: 번호를 골랐으면 "05번 / ✎ 기록" — 누르면 바로 저장.
 * 안 골랐으면 "✎ 기록" — 누르면 기록 시트(번호 릴)를 그 반으로 연다.
 */
@Composable
private fun CaptureButton(t: NugaWidget.Target, sel: Int?, modifier: GlanceModifier) {
    val context = LocalContext.current
    val navy = ColorProvider(NugaColors.BtnLtInk)
    val action = if (sel != null) {
        actionRunCallback<SaveNoAction>(actionParametersOf(NoParam to sel, KeyParam to t.key, ClassParam to t.classLabel))
    } else {
        actionStartActivity(openIntent(context, t.classLabel))
    }
    // 위아래 3dp: 번호 칸의 여백과 윗 · 아랫 끝을 맞춘다
    Box(modifier = modifier.padding(vertical = 3.dp)) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ImageProvider(R.drawable.widget_record_bg))
                .clickable(action)
                .semantics { contentDescription = if (sel != null) "${sel}번 기록" else "기록 시트 열기" },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = sel?.let { "${two(it)}번" } ?: "",
                style = TextStyle(color = navy, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                maxLines = 1,
                modifier = GlanceModifier.visibility(if (sel != null) Visibility.Visible else Visibility.Gone),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    provider = ImageProvider(R.drawable.ic_widget_record),
                    contentDescription = null,
                    modifier = GlanceModifier.size(if (sel != null) 15.dp else 20.dp),
                )
                Spacer(modifier = GlanceModifier.width(if (sel != null) 4.dp else 6.dp))
                Text(
                    text = "기록",
                    style = TextStyle(color = navy, fontSize = if (sel != null) 14.sp else 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
                    maxLines = 1,
                )
            }
        }
    }
}

/** nuga://record?class=…&src=widget — 카테고리 없이 기록 시트(번호 릴)를 위젯의 반으로 연다 */
private fun openIntent(context: Context, classLabel: String): Intent {
    val uri = Uri.Builder().scheme("nuga").authority("record")
        .appendQueryParameter("class", classLabel)
        .appendQueryParameter("src", "widget")
        .build()
    return Intent(Intent.ACTION_VIEW, uri)
        .setClass(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
}
