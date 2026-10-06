package kr.nuga.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.Role
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
import kr.nuga.app.ui.hasCategory
import kr.nuga.app.ui.theme.Eyebrow
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
                onRecord = { classLabel -> vm.openSheet(classLabel = classLabel, source = RecordSource.PHONE) },
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

/** 화면의 초점 하나: 지금 수업이면 하늘빛 테두리로 켜진 카드. 아래에 큰 [기록] 버튼 하나 → 번호 릴 */
@Composable
private fun LessonCard(
    cfg: Config,
    current: LessonSlot?,
    next: LessonSlot?,
    now: LocalDateTime,
    onRecord: (String) -> Unit,
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
            CaptureButton(onClick = { onRecord(classLabel) })
        }
    }
}

/** 기록 버튼 테두리: 빛이 드는 오른쪽 위가 흰빛, 아래로 갈수록 파랑 가장자리 */
private val CaptureRim = Brush.linearGradient(
    0f to Color.White.copy(alpha = .62f),
    .30f to Color(0xFF6E9BDD).copy(alpha = .60f),
    1f to NugaColors.AccentEdge,
    start = Offset(Float.POSITIVE_INFINITY, 0f), end = Offset(0f, Float.POSITIVE_INFINITY),
)

/**
 * 수업 중 한 번에 누르는 [기록] 버튼 (화면에서 가장 밝은 것 하나): 행동 파랑 유리 #2F66B8 → #245AA7,
 * 빛이 드는 오른쪽 위에 흰 빛웅덩이, 윗면 반사광, 아래로 같은 파랑이 번진다. 64dp, 연필 + '기록'.
 */
@Composable
private fun CaptureButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(10.dp)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
            .drawWithCache {
                val c = Offset(size.width / 2f, size.height)
                val rx = (size.width * .46f).coerceAtLeast(1f)
                val glow = Brush.radialGradient(
                    0f to NugaColors.Accent.copy(alpha = .46f), .55f to NugaColors.Bloom.copy(alpha = .12f), 1f to Color.Transparent,
                    center = c, radius = rx,
                )
                onDrawBehind { scale(scaleX = 1f, scaleY = 16.dp.toPx() / rx, pivot = c) { drawCircle(glow, radius = rx, center = c) } }
            }
            .clip(shape)
            .background(Brush.verticalGradient(listOf(NugaColors.AccentTop, NugaColors.Accent)))
            .drawWithCache {
                val pool = Brush.radialGradient(
                    0f to Color.White.copy(alpha = .22f), 1f to Color.White.copy(alpha = 0f),
                    center = Offset(size.width, 0f), radius = (size.width * .55f).coerceAtLeast(1f),
                )
                val sheen = Brush.horizontalGradient(
                    0f to Color.Transparent, .55f to Color.White.copy(alpha = .16f), .9f to Color.White.copy(alpha = .40f), 1f to Color.Transparent,
                )
                onDrawBehind {
                    drawRect(pool)
                    drawRect(sheen, topLeft = Offset(0f, 1.dp.toPx()), size = Size(size.width, 1.dp.toPx()))
                }
            }
            .border(1.dp, CaptureRim, shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(color = Color.White),
                role = Role.Button,
                onClickLabel = "번호 고르기",
                onClick = onClick,
            ),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Edit, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Text("기록", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em)
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
        // 카테고리는 PC가 정했을 때(1..4)만. 0(미정)은 칩 없이
        if (hasCategory(r.category)) CategoryChip(cfg.categoryLabel(r.category), r.category)
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
