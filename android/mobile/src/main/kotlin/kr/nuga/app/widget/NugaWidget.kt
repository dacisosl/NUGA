package kr.nuga.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartService
import kr.nuga.app.record.RecordStartActivity
import kr.nuga.app.record.RecordingService
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kr.nuga.app.R
import kr.nuga.app.graph
import kr.nuga.app.ui.MainActivity
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.shared.model.Config
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime

class NugaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NugaWidget()
}

object WidgetUpdater {
    suspend fun updateAll(context: Context) {
        runCatching { NugaWidget().updateAll(context) }
            .onFailure { Log.w("WidgetUpdater", "update failed: ${it.message}") }
    }
}

/** 4×2 home screen widget: current (or next) lesson on top, 4 category buttons below. */
class NugaWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Single

    data class State(
        val headline: String,
        val subline: String,
        val inClass: Boolean,
        val todayCount: Int,
        val categories: List<Pair<Int, String>>,
        /** null = 녹음 꺼짐, "idle" / "recording" / "paused" / "standby" */
        val rec: String? = null,
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = loadState(context)
        provideContent { WidgetContent(state) }
    }

    private suspend fun loadState(context: Context): State {
        val g = context.graph
        val config = runCatching { g.configRepo.current() }.getOrNull()
        val todayCount = runCatching { g.db.recordDao().countDay(NugaTime.todayIso()) }.getOrDefault(0)
        val categories = (config ?: Config.EMPTY).categories.take(4).map { it.key to it.label }
            .ifEmpty { Config.DEFAULT_CATEGORIES.map { it.key to it.label } }
        if (config == null) {
            return State("설정 없음", "PC 연결 또는 샘플 설정", false, todayCount, categories)
        }
        val rs = RecordingService.state.value
        val rec = if (!config.recordingActive) null else when {
            rs.recording != null && rs.paused -> "paused"
            rs.recording != null -> "recording"
            rs.standby -> "standby"
            else -> "idle"
        }
        val now = LocalDateTime.now()
        val lesson = TimetableResolver.resolve(config, now)
        val current = lesson.current
        val next = lesson.next
        return when {
            current != null -> State(current.headline, current.subline ?: "${current.period.start}–${current.period.end}", true, todayCount, categories, rec)
            next != null -> {
                val dayPrefix = if (next.date == now.toLocalDate()) "" else "${NugaTime.koreanDate(next.date)} "
                State("예정 · ${next.headline}", "$dayPrefix${next.period.start} 시작" + (next.subline?.let { " · $it" } ?: ""), false, todayCount, categories, rec)
            }
            else -> State("수업 없음", "시간표 없음", false, todayCount, categories, rec)
        }
    }
}

/**
 * 위젯은 늘 밤 유리(어떤 배경화면에서도 같은 대비): 밤 잉크 글자, 지금 수업은 하늘빛 제목,
 * 카테고리 4버튼은 카테고리 색 유리에 흰 글자.
 */
@Composable
private fun WidgetContent(state: NugaWidget.State) {
    val context = LocalContext.current
    val ink = ColorProvider(NugaColors.Ink)
    val ink2 = ColorProvider(NugaColors.Ink2)
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg))
            .padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 12.dp)
            .clickable(actionStartActivity(openIntent(context, null))),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = state.headline,
                    style = TextStyle(color = if (state.inClass) ColorProvider(NugaColors.Sky) else ink, fontSize = 17.sp, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
                Text(
                    text = state.subline,
                    style = TextStyle(color = ink2, fontSize = 12.sp, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                )
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
        Spacer(modifier = GlanceModifier.height(10.dp))
        Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            state.categories.forEachIndexed { index, (key, label) ->
                if (index > 0) Spacer(modifier = GlanceModifier.width(6.dp))
                CategoryButton(key = key, label = label, modifier = GlanceModifier.defaultWeight().fillMaxSize())
            }
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

@Composable
private fun CategoryButton(key: Int, label: String, modifier: GlanceModifier) {
    val context = LocalContext.current
    val bg = when (key) {
        1 -> R.drawable.widget_cat1_bg
        2 -> R.drawable.widget_cat2_bg
        3 -> R.drawable.widget_cat3_bg
        else -> R.drawable.widget_cat4_bg
    }
    Box(
        modifier = modifier
            .background(ImageProvider(bg))
            .clickable(actionStartActivity(openIntent(context, key))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(androidx.compose.ui.graphics.Color.White),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
            maxLines = 1,
        )
    }
}

private fun openIntent(context: Context, category: Int?): Intent {
    val uri = if (category == null) Uri.parse("nuga://record?src=widget") else Uri.parse("nuga://record?category=$category&src=widget")
    return Intent(Intent.ACTION_VIEW, uri)
        .setClass(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
}
