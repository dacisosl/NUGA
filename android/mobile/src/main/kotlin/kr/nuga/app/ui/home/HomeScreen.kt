package kr.nuga.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.Eyebrow
import kr.nuga.app.ui.theme.NugaButton
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.ScreenHeader
import kr.nuga.app.ui.theme.paperCard
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.RecordSource
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonSlot
import java.time.LocalDateTime

@Composable
fun HomeScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val config by vm.config.collectAsStateWithLifecycle()
    val lesson by vm.lesson.collectAsStateWithLifecycle()
    val now by vm.now.collectAsStateWithLifecycle()
    val today by vm.todayRecords.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val cfg = config ?: Config.EMPTY

    val countsByPeriod: Map<Int, Int> = remember(today, lesson.today) {
        val map = HashMap<Int, Int>()
        for (slot in lesson.today) {
            map[slot.period.no] = today.count { r ->
                val t = NugaTime.parse(r.time)?.toLocalTime() ?: return@count false
                r.classLabel == slot.classLabel && !t.isBefore(slot.start) && t.isBefore(slot.end)
            }
        }
        map
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 머리 띠: 01 —— / 날짜(큰 제목) / 오늘 N건
        item {
            ScreenHeader(index = "01", title = NugaTime.koreanDate(now.toLocalDate())) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = NugaColors.Ink2, fontSize = 13.sp, fontWeight = FontWeight.Medium)) { append("오늘 ") }
                        withStyle(SpanStyle(color = NugaColors.InkNum, fontSize = 24.sp, fontWeight = FontWeight(650), letterSpacing = (-0.045).em, fontFeatureSettings = "tnum")) { append("${today.size}") }
                        withStyle(SpanStyle(color = NugaColors.Ink2, fontSize = 13.sp, fontWeight = FontWeight.Medium)) { append("건") }
                    },
                    modifier = Modifier.padding(bottom = 1.dp),
                )
            }
        }
        item {
            LessonCard(
                cfg = cfg,
                current = lesson.current,
                next = lesson.next,
                now = now,
                onCategory = { key, classLabel -> vm.openSheet(category = key, classLabel = classLabel, source = RecordSource.PHONE) },
            )
        }
        if (lesson.today.isNotEmpty()) {
            item { SectionTitle("오늘 시간표") }
            item {
                Card {
                    lesson.today.forEachIndexed { index, slot ->
                        if (index > 0) Divider()
                        TimetableRow(
                            slot = slot,
                            count = countsByPeriod[slot.period.no] ?: 0,
                            marker = when {
                                slot.contains(now) -> "지금"
                                slot.startDateTime.isAfter(now) -> "예정"
                                else -> ""
                            },
                            onClick = { vm.openSheet(classLabel = slot.classLabel) },
                        )
                    }
                }
            }
        }
        item { SectionTitle("최근 기록") }
        if (today.isEmpty()) {
            item {
                Card { Text("없음", modifier = Modifier.padding(16.dp), color = NugaColors.Text2) }
            }
        } else {
            item {
                Card {
                    val recent = today.sortedByDescending { it.time }.take(10)
                    recent.forEachIndexed { index, r ->
                        if (index > 0) Divider()
                        RecordRow(r, cfg, showName = settings.showNames)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

/** 화면의 초점 하나: 지금 수업이면 하늘빛 테두리로 켜진 카드 */
@Composable
private fun LessonCard(
    cfg: Config,
    current: LessonSlot?,
    next: LessonSlot?,
    now: LocalDateTime,
    onCategory: (Int, String) -> Unit,
) {
    val slot = current ?: next
    Card(modifier = Modifier.fillMaxWidth(), lit = current != null) {
        Column(modifier = Modifier.padding(start = 18.dp, end = 16.dp, top = 18.dp, bottom = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = slot?.headline ?: "수업 없음",
                        style = MaterialTheme.typography.titleLarge,
                        color = if (current != null) NugaColors.Accent else NugaColors.Text,
                    )
                    val sub = when {
                        slot == null -> if (cfg.timetable.isEmpty()) "시간표 없음" else ""
                        current != null -> current.subline ?: "${current.period.start}–${current.period.end}"
                        else -> {
                            val day = if (next!!.date == now.toLocalDate()) "" else NugaTime.koreanDate(next.date) + " "
                            "$day${next.period.start} 시작" + (next.subline?.let { " · $it" } ?: "")
                        }
                    }
                    if (sub.isNotEmpty()) {
                        Spacer(Modifier.height(2.dp))
                        Text(sub, style = MaterialTheme.typography.bodyMedium, color = NugaColors.Text2)
                    }
                }
                if (slot != null) Marker(if (current != null) "지금" else "예정")
            }
            Spacer(Modifier.height(16.dp))
            val classLabel = slot?.classLabel ?: cfg.classes.firstOrNull()?.classLabel ?: "미지정"
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                cfg.categories.take(4).forEach { cat ->
                    CategoryButton(
                        label = cat.label,
                        key = cat.key,
                        modifier = Modifier.weight(1f),
                        onClick = { onCategory(cat.key, classLabel) },
                    )
                }
            }
        }
    }
}

/** 수업 중 한 번에 누르는 카테고리 버튼: 카테고리 색 유리 (윗면이 밝고 아래로 같은 색이 번진다) */
@Composable
fun CategoryButton(label: String, key: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    NugaButton(
        onClick = onClick,
        modifier = modifier,
        tone = ButtonTone.category(key),
        height = 60.dp,
        fontSize = 16.sp,
    ) {
        Text(
            text = label,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.padding(vertical = 8.dp),
        )
    }
}

@Composable
private fun TimetableRow(slot: LessonSlot, count: Int, marker: String, onClick: () -> Unit) {
    val isNow = marker == "지금"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                // 지금 수업 줄: 옅은 파랑 + 왼쪽 2dp 파랑 막대
                if (isNow) Modifier.background(NugaColors.AccentTint).drawBehind { drawRect(NugaColors.Accent, size = Size(2.dp.toPx(), size.height)) }
                else Modifier,
            )
            .clickable(onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "${slot.period.no}",
            modifier = Modifier.width(24.dp),
            style = MaterialTheme.typography.titleSmall.tnum(),
            color = if (isNow) NugaColors.Accent else NugaColors.Text2,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(slot.classLabel, style = MaterialTheme.typography.titleSmall)
            Text(
                listOfNotNull("${slot.period.start}–${slot.period.end}", slot.subline).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall.tnum(), color = NugaColors.Text2,
            )
        }
        if (count > 0) CountBadge(count)
        if (marker.isNotEmpty()) {
            Spacer(Modifier.width(8.dp))
            Marker(marker)
        }
    }
}

@Composable
fun RecordRow(r: RecordEntity, cfg: Config, showName: Boolean, onClick: (() -> Unit)? = null) {
    val name = if (showName) cfg.nameOf(r.classLabel, r.no) else null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = 52.dp)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            NugaTime.shortTime(r.time),
            style = MaterialTheme.typography.bodySmall.tnum(),
            color = NugaColors.Text2,
            modifier = Modifier.width(44.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${r.classLabel} · ${r.no}번", style = MaterialTheme.typography.titleSmall)
                if (name != null) {
                    Spacer(Modifier.width(6.dp))
                    Text(name, style = MaterialTheme.typography.bodyMedium, color = NugaColors.Text2)
                }
                if (r.status == "pending") {
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(6.dp).background(NugaColors.WarnDot, CircleShape))
                }
            }
            val memo = listOfNotNull(r.memo.takeIf { it.isNotBlank() }, r.voiceTranscript?.takeIf { it.isNotBlank() }).joinToString(" / ")
            if (memo.isNotEmpty()) Text(memo, style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2, maxLines = 1)
        }
        CategoryChip(cfg.categoryLabel(r.category), r.category)
        if (!r.synced) {
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(6.dp).background(NugaColors.Text3, CircleShape))
        }
    }
}

/** 카테고리 칩: 색 조각 + 낱말 (웹 .chip c1~c4와 같은 모양) */
@Composable
fun CategoryChip(label: String, key: Int) {
    Row(
        modifier = Modifier
            .height(24.dp)
            .background(NugaColors.Mute, RoundedCornerShape(4.dp))
            .border(1.dp, NugaColors.Hair, RoundedCornerShape(4.dp))
            .padding(start = 7.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).background(NugaColors.category(key), RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(5.dp))
        Text(text = label, color = NugaColors.Text, style = MaterialTheme.typography.labelMedium)
    }
}

/** '지금'은 파랑 바탕 + 살아 있는 점 하나, '예정'은 조용한 회색 */
@Composable
fun Marker(text: String) {
    val accent = text == "지금"
    Row(
        modifier = Modifier
            .height(24.dp)
            .background(if (accent) NugaColors.AccentSoft else NugaColors.Mute, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (accent) {
            Box(
                Modifier
                    .size(12.dp)
                    .drawBehind {
                        drawCircle(NugaColors.Accent.copy(alpha = .16f), radius = 4.5.dp.toPx())
                        drawCircle(NugaColors.Accent, radius = 3.dp.toPx(), center = Offset(size.width / 2f, size.height / 2f))
                    },
            )
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = text,
            color = if (accent) NugaColors.Accent else NugaColors.Text2,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight(650),
        )
    }
}

@Composable
fun CountBadge(count: Int) {
    Text(
        text = "$count",
        color = Color.White,
        style = MaterialTheme.typography.labelMedium.tnum(),
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .background(NugaColors.Accent, RoundedCornerShape(4.dp))
            .defaultMinSize(minWidth = 20.dp)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun SectionTitle(text: String) {
    Eyebrow(text)
}

/** 빛나는 종이 카드. 안쪽 글자 기본색은 종이 잉크(Text) */
@Composable
fun Card(modifier: Modifier = Modifier, lit: Boolean = false, content: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .paperCard(lit),
    ) {
        CompositionLocalProvider(LocalContentColor provides NugaColors.Text) { content() }
    }
}

@Composable
fun Divider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(NugaColors.Hair))
}
