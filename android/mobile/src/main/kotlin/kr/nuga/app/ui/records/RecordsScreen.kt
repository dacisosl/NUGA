package kr.nuga.app.ui.records

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.hasCategory
import kr.nuga.app.ui.home.Card
import kr.nuga.app.ui.home.Divider
import kr.nuga.app.ui.home.RecordRow
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.NightChip
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.ScreenHeader
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.Config
import kr.nuga.shared.time.NugaTime
import java.time.LocalDate

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun RecordsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val config by vm.config.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val all by vm.allRecords.collectAsStateWithLifecycle()
    val cfg = config ?: Config.EMPTY
    var filter by rememberSaveable { mutableIntStateOf(0) }
    var editing by remember { mutableStateOf<RecordEntity?>(null) }

    // 0 = 전체, -1 = 미정(폰·워치에서 분류 없이 보낸 기록, category 0), 1..4 = 카테고리
    val filtered = remember(all, filter) {
        when (filter) {
            0 -> all
            -1 -> all.filter { it.category !in 1..4 }
            else -> all.filter { it.category == filter }
        }
    }
    val grouped = remember(filtered) { filtered.groupBy { it.day }.toSortedMap(compareByDescending { it }) }

    Column(modifier = modifier.fillMaxWidth()) {
        ScreenHeader(index = "02", title = "기록", modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp))
        // 필터: 밤 위 칩. '전체'는 밝은 판, 카테고리는 그 색으로 켜진다
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                NightChip(label = "전체", selected = filter == 0, onClick = { filter = 0 })
            }
            if (all.any { it.category !in 1..4 }) {
                item {
                    NightChip(label = "미정", selected = filter == -1, onClick = { filter = if (filter == -1) 0 else -1 })
                }
            }
            items(cfg.categories.take(4)) { cat ->
                NightChip(
                    label = cat.label,
                    selected = filter == cat.key,
                    onClick = { filter = if (filter == cat.key) 0 else cat.key },
                    swatch = NugaColors.categoryOnDark(cat.key),
                    selectedTone = ButtonTone.category(cat.key, onDark = true),
                )
            }
        }
        if (grouped.isEmpty()) {
            Text("없음", color = NugaColors.Ink2, modifier = Modifier.padding(16.dp))
        }
        LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            grouped.forEach { (day, list) ->
                stickyHeader(key = "h-$day") {
                    // 날짜 꼬리표: 불투명한 밤 유리라 아래로 지나가는 카드를 가린다
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 2.dp)) {
                        val shape = RoundedCornerShape(6.dp)
                        Row(
                            modifier = Modifier
                                .clip(shape)
                                .background(Brush.verticalGradient(listOf(NugaColors.Navy3, NugaColors.Navy2)))
                                .border(1.dp, NugaColors.DLine2, shape)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val date = runCatching { LocalDate.parse(day) }.getOrNull()
                            Text(
                                text = date?.let { NugaTime.koreanDate(it) } ?: day,
                                color = NugaColors.Ink,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight(650),
                                letterSpacing = (-0.015).em,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text("${list.size}건", style = MaterialTheme.typography.bodySmall.tnum(), color = NugaColors.Ink2)
                        }
                    }
                }
                item(key = "c-$day") {
                    Card {
                        list.forEachIndexed { index, r ->
                            if (index > 0) Divider()
                            RecordRow(r, cfg, showName = settings.showNames, onClick = { editing = r })
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    editing?.let { r ->
        EditDialog(
            record = r,
            cfg = cfg,
            onDismiss = { editing = null },
            onSave = { memo -> vm.updateMemo(r.id, memo); editing = null },
            onDelete = { vm.deleteRecord(r.id); editing = null },
        )
    }
}

@Composable
private fun EditDialog(
    record: RecordEntity,
    cfg: Config,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var memo by rememberSaveable(record.id) { mutableStateOf(record.memo) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = NugaColors.Surface,
        // 카테고리는 PC가 정했을 때(1..4)만 붙인다. 0(미정)은 반·번호만
        title = {
            val category = cfg.categoryLabel(record.category).takeIf { hasCategory(record.category) }
            Text(listOfNotNull(record.classLabel, "${record.no}번", category).joinToString(" · "))
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${NugaTime.koreanDate(NugaTime.dateOf(record.time))} ${NugaTime.shortTime(record.time)}",
                    style = MaterialTheme.typography.bodySmall.tnum(), color = NugaColors.Text2,
                )
                if (!record.voiceTranscript.isNullOrBlank()) {
                    Text("음성: ${record.voiceTranscript}", style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2)
                }
                OutlinedTextField(
                    value = memo,
                    onValueChange = { memo = it },
                    label = { Text("메모") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSave(memo) }) { Text("저장", fontWeight = FontWeight(650)) } },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text("삭제", color = NugaColors.Warn) }
                TextButton(onClick = onDismiss) { Text("닫기", color = NugaColors.Text2) }
            }
        },
    )
}
