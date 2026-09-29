package kr.nuga.app.ui.records

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.data.db.RecordEntity
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.home.Card
import kr.nuga.app.ui.home.Divider
import kr.nuga.app.ui.home.RecordRow
import kr.nuga.app.ui.theme.NugaColors
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

    val filtered = remember(all, filter) { if (filter == 0) all else all.filter { it.category == filter } }
    val grouped = remember(filtered) { filtered.groupBy { it.day }.toSortedMap(compareByDescending { it }) }

    Column(modifier = modifier.fillMaxWidth()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = filter == 0,
                    onClick = { filter = 0 },
                    label = { Text("전체") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NugaColors.Text,
                        selectedLabelColor = NugaColors.Surface,
                        containerColor = NugaColors.Surface,
                    ),
                )
            }
            items(cfg.categories.take(4)) { cat ->
                FilterChip(
                    selected = filter == cat.key,
                    onClick = { filter = if (filter == cat.key) 0 else cat.key },
                    label = { Text(cat.label) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NugaColors.categoryBg(cat.key),
                        selectedLabelColor = NugaColors.category(cat.key),
                        containerColor = NugaColors.Surface,
                    ),
                )
            }
        }
        if (grouped.isEmpty()) {
            Text("없음", color = NugaColors.Text2, modifier = Modifier.padding(16.dp))
        }
        LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            grouped.forEach { (day, list) ->
                stickyHeader(key = "h-$day") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(NugaColors.Bg)
                            .padding(vertical = 6.dp),
                    ) {
                        val date = runCatching { LocalDate.parse(day) }.getOrNull()
                        Text(
                            text = date?.let { NugaTime.koreanDate(it) } ?: day,
                            style = MaterialTheme.typography.labelLarge,
                            color = NugaColors.Text2,
                        )
                        Spacer(Modifier.weight(1f))
                        Text("${list.size}건", style = MaterialTheme.typography.labelLarge, color = NugaColors.Text2)
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
        title = { Text("${record.classLabel} · ${record.no}번 · ${cfg.categoryLabel(record.category)}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${NugaTime.koreanDate(NugaTime.dateOf(record.time))} ${NugaTime.shortTime(record.time)}",
                    style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2,
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
        confirmButton = { TextButton(onClick = { onSave(memo) }) { Text("저장") } },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text("삭제", color = NugaColors.Warn) }
                TextButton(onClick = onDismiss) { Text("닫기") }
            }
        },
    )
}
