package kr.nuga.app.ui.sheet

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.speech.SpeechToText
import kr.nuga.app.ui.SheetState
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.shared.model.Config

/** 번호 입력 시트: class · category chips · 1..N grid (6 columns) · memo + mic · 저장 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NumberSheet(
    state: SheetState,
    config: Config,
    showNames: Boolean,
    onCategory: (Int) -> Unit,
    onClass: (String) -> Unit,
    onNo: (Int?) -> Unit,
    onMemo: (String) -> Unit,
    onAppendMemo: (String) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    val speech = remember { SpeechToText(context) }
    val listening by speech.listening.collectAsStateWithLifecycle()
    var speechError by remember { mutableStateOf("") }
    DisposableEffect(Unit) { onDispose { speech.stop() } }

    fun startSpeech() {
        speechError = ""
        speech.start(
            onResult = { text -> if (text.isNotBlank()) onAppendMemo(text) },
            onError = { speechError = it },
        )
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startSpeech() else speechError = "마이크 권한 필요"
    }

    val size = config.classSize(state.classLabel)
    val categories = config.categories.take(4).ifEmpty { Config.DEFAULT_CATEGORIES }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = NugaColors.Surface,
        dragHandle = null,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(top = 16.dp, bottom = 8.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // class row
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (config.classes.size > 1) {
                    config.classes.forEach { c ->
                        FilterChip(
                            selected = c.classLabel == state.classLabel,
                            onClick = { onClass(c.classLabel) },
                            label = { Text(c.classLabel, fontWeight = FontWeight.SemiBold) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = NugaColors.Text,
                                selectedLabelColor = NugaColors.Surface,
                                containerColor = NugaColors.Surface,
                            ),
                        )
                    }
                } else {
                    Text(state.classLabel, style = MaterialTheme.typography.titleLarge)
                }
                Spacer(Modifier.weight(1f))
                Text("${size}명", style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2)
            }

            // category chips
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                categories.forEach { cat ->
                    val selected = cat.key == state.category
                    FilterChip(
                        selected = selected,
                        onClick = { onCategory(cat.key) },
                        label = { Text(cat.label, fontWeight = FontWeight.SemiBold) },
                        modifier = Modifier.weight(1f).heightIn(min = 44.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NugaColors.categoryBg(cat.key),
                            selectedLabelColor = NugaColors.category(cat.key),
                            containerColor = NugaColors.Surface,
                            labelColor = NugaColors.Text2,
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            borderColor = NugaColors.Line,
                            selectedBorderColor = NugaColors.category(cat.key),
                            selectedBorderWidth = 1.5.dp,
                        ),
                    )
                }
            }

            // number grid 6 columns
            val rows = (size + 5) / 6
            val cellHeight = 52.dp
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                modifier = Modifier.fillMaxWidth().height(cellHeight * rows + 6.dp * (rows - 1).coerceAtLeast(0)),
                userScrollEnabled = false,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items((1..size).toList()) { n ->
                    val selected = state.no == n
                    val name = if (showNames) config.nameOf(state.classLabel, n) else null
                    Box(
                        modifier = Modifier
                            .height(cellHeight)
                            .background(
                                if (selected) NugaColors.category(state.category) else NugaColors.Bg,
                                RoundedCornerShape(10.dp),
                            )
                            .border(1.dp, if (selected) NugaColors.category(state.category) else NugaColors.Line, RoundedCornerShape(10.dp))
                            .clickable { onNo(if (selected) null else n) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "$n",
                                fontSize = if (name == null) 18.sp else 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (selected) NugaColors.Surface else NugaColors.Text,
                            )
                            if (name != null) {
                                Text(
                                    text = name,
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                    color = if (selected) NugaColors.Surface else NugaColors.Text2,
                                )
                            }
                        }
                    }
                }
            }

            // memo + mic
            OutlinedTextField(
                value = state.memo,
                onValueChange = onMemo,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(if (listening) "듣는 중…" else "메모") },
                supportingText = if (speechError.isNotEmpty()) ({ Text(speechError, color = NugaColors.Warn) }) else null,
                singleLine = false,
                maxLines = 3,
                trailingIcon = {
                    IconButton(onClick = {
                        if (listening) speech.stop()
                        else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                    }) {
                        Icon(
                            imageVector = if (listening) Icons.Filled.MicOff else Icons.Filled.Mic,
                            contentDescription = "음성",
                            tint = if (listening) NugaColors.Warn else NugaColors.Accent,
                        )
                    }
                },
            )

            Button(
                onClick = onSave,
                enabled = state.no != null,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = NugaColors.category(state.category), contentColor = NugaColors.Surface),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text(
                    text = if (state.no == null) "저장" else "저장 · ${state.no}번",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}
