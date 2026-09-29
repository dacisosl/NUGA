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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.theme.NugaColors
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
        item {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(NugaTime.koreanDate(now.toLocalDate()), style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.weight(1f))
                Text("오늘 ${today.size}건", style = MaterialTheme.typography.bodyMedium, color = NugaColors.Text2)
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

@Composable
private fun LessonCard(
    cfg: Config,
    current: LessonSlot?,
    next: LessonSlot?,
    now: LocalDateTime,
    onCategory: (Int, String) -> Unit,
) {
    val slot = current ?: next
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
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
                    if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodyMedium, color = NugaColors.Text2)
                }
                if (slot != null) Marker(if (current != null) "지금" else "예정")
            }
            Spacer(Modifier.height(14.dp))
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

@Composable
fun CategoryButton(label: String, key: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .heightIn(min = 56.dp)
            .background(NugaColors.categoryBg(key), RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = NugaColors.category(key),
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun TimetableRow(slot: LessonSlot, count: Int, marker: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${slot.period.no}", modifier = Modifier.width(24.dp), fontWeight = FontWeight.SemiBold, color = NugaColors.Text2)
        Column(modifier = Modifier.weight(1f)) {
            Text(slot.classLabel, style = MaterialTheme.typography.titleSmall)
            Text(
                listOfNotNull("${slot.period.start}–${slot.period.end}", slot.subline).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2,
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
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(NugaTime.shortTime(r.time), style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2, modifier = Modifier.width(44.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${r.classLabel} · ${r.no}번", style = MaterialTheme.typography.titleSmall)
                if (name != null) {
                    Spacer(Modifier.width(6.dp))
                    Text(name, style = MaterialTheme.typography.bodyMedium, color = NugaColors.Text2)
                }
                if (r.status == "pending") {
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(6.dp).background(NugaColors.Warn, CircleShape))
                }
            }
            val memo = listOfNotNull(r.memo.takeIf { it.isNotBlank() }, r.voiceTranscript?.takeIf { it.isNotBlank() }).joinToString(" / ")
            if (memo.isNotEmpty()) Text(memo, style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2, maxLines = 1)
        }
        CategoryChip(cfg.categoryLabel(r.category), r.category)
        if (!r.synced) {
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(6.dp).background(NugaColors.Text2, CircleShape))
        }
    }
}

@Composable
fun CategoryChip(label: String, key: Int) {
    Text(
        text = label,
        color = NugaColors.category(key),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier
            .background(NugaColors.categoryBg(key), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun Marker(text: String) {
    val accent = text == "지금"
    Text(
        text = text,
        color = if (accent) NugaColors.Accent else NugaColors.Text2,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier
            .background(if (accent) NugaColors.AccentSoft else NugaColors.Cat4Bg, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun CountBadge(count: Int) {
    Text(
        text = "$count",
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier
            .background(NugaColors.Text, RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = NugaColors.Text2, modifier = Modifier.padding(top = 4.dp))
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(NugaColors.Surface, RoundedCornerShape(12.dp))
            .border(1.dp, NugaColors.Line, RoundedCornerShape(12.dp)),
    ) { content() }
}

@Composable
fun Divider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(NugaColors.Line))
}
