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
        val now = LocalDateTime.now()
        val lesson = TimetableResolver.resolve(config, now)
        val current = lesson.current
        val next = lesson.next
        return when {
            current != null -> State(current.headline, current.subline ?: "${current.period.start}–${current.period.end}", true, todayCount, categories)
            next != null -> {
                val dayPrefix = if (next.date == now.toLocalDate()) "" else "${NugaTime.koreanDate(next.date)} "
                State("예정 · ${next.headline}", "$dayPrefix${next.period.start} 시작" + (next.subline?.let { " · $it" } ?: ""), false, todayCount, categories)
            }
            else -> State("수업 없음", "시간표 없음", false, todayCount, categories)
        }
    }
}

@Composable
private fun WidgetContent(state: NugaWidget.State) {
    val context = LocalContext.current
    val text = ColorProvider(NugaColors.Text)
    val text2 = ColorProvider(NugaColors.Text2)
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg))
            .padding(12.dp)
            .clickable(actionStartActivity(openIntent(context, null))),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = state.headline,
                    style = TextStyle(color = if (state.inClass) ColorProvider(NugaColors.Accent) else text, fontSize = 17.sp, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
                Text(
                    text = state.subline,
                    style = TextStyle(color = text2, fontSize = 12.sp),
                    maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(text = "${state.todayCount}", style = TextStyle(color = text, fontSize = 20.sp, fontWeight = FontWeight.Bold))
                Text(text = "오늘", style = TextStyle(color = text2, fontSize = 11.sp))
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
                color = ColorProvider(NugaColors.category(key)),
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
