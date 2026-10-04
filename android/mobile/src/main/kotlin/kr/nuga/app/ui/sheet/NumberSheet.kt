package kr.nuga.app.ui.sheet

import android.Manifest
import android.content.res.Configuration
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kr.nuga.app.speech.SpeechToText
import kr.nuga.app.ui.SheetState
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.NightChip
import kr.nuga.app.ui.theme.NugaButton
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.Config

/**
 * 번호 입력 시트: class · category chips · 1..N grid (6 columns) · memo + mic · 저장
 * 밤의 시트(웹 '쉬는 시간 기록' 머리와 같은 빛): 위 테두리에 빛줄기, 오른쪽 위 번짐.
 * 번호 판은 옅은 유리, 고른 번호 하나만 카테고리 색으로 켜진다.
 */
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

    // M3 시트는 시스템 다크 모드로 상태·내비게이션 바 아이콘 색을 정한다. 시트가 늘 밤이라 '다크'로 알려 밝은 아이콘을 쓰게 한다
    val baseConfig = LocalConfiguration.current
    val nightConfig = remember(baseConfig) {
        Configuration(baseConfig).apply { uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or Configuration.UI_MODE_NIGHT_YES }
    }
    CompositionLocalProvider(LocalConfiguration provides nightConfig) {
        ModalBottomSheet(
            onDismissRequest = onDismiss,
            sheetState = sheetState,
            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
            containerColor = NugaColors.Navy1,
            contentColor = NugaColors.Ink,
            scrimColor = Color(0x94050C16),
            dragHandle = null,
        ) {
            Box(Modifier.fillMaxWidth().sheetNight()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .padding(top = 20.dp, bottom = 8.dp)
                        .navigationBarsPadding(),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // class row
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (config.classes.size > 1) {
                            config.classes.forEach { c ->
                                NightChip(
                                    label = c.classLabel,
                                    selected = c.classLabel == state.classLabel,
                                    onClick = { onClass(c.classLabel) },
                                    fontSize = 14.sp,
                                )
                            }
                        } else {
                            Text(state.classLabel, style = MaterialTheme.typography.titleLarge, color = NugaColors.InkDisplay)
                        }
                        Spacer(Modifier.weight(1f))
                        Text("${size}명", style = MaterialTheme.typography.bodySmall.tnum(), color = NugaColors.Ink3)
                    }

                    // category chips
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        categories.forEach { cat ->
                            NightChip(
                                label = cat.label,
                                selected = cat.key == state.category,
                                onClick = { onCategory(cat.key) },
                                modifier = Modifier.weight(1f),
                                swatch = NugaColors.categoryOnDark(cat.key),
                                selectedTone = ButtonTone.category(cat.key, onDark = true),
                                height = 46.dp,
                                fontSize = 15.sp,
                            )
                        }
                    }

                    // number grid 6 columns
                    val rows = (size + 5) / 6
                    val cellHeight = 52.dp
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(6),
                        // +4dp: 칸마다 픽셀 반올림이 쌓여 마지막 줄 아래 테두리가 잘리지 않게
                        modifier = Modifier.fillMaxWidth().height(cellHeight * rows + 6.dp * (rows - 1).coerceAtLeast(0) + 4.dp),
                        userScrollEnabled = false,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items((1..size).toList()) { n ->
                            val selected = state.no == n
                            val name = if (showNames) config.nameOf(state.classLabel, n) else null
                            NumberPlate(
                                n = n,
                                name = name,
                                selected = selected,
                                category = state.category,
                                height = cellHeight,
                                onClick = { onNo(if (selected) null else n) },
                            )
                        }
                    }

                    // memo + mic
                    OutlinedTextField(
                        value = state.memo,
                        onValueChange = onMemo,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (listening) "듣는 중…" else "메모") },
                        supportingText = if (speechError.isNotEmpty()) ({ Text(speechError, color = NugaColors.AmberInk) }) else null,
                        singleLine = false,
                        maxLines = 3,
                        shape = RoundedCornerShape(6.dp),
                        colors = NightFieldColors(),
                        trailingIcon = {
                            IconButton(onClick = {
                                if (listening) speech.stop()
                                else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                            }) {
                                Icon(
                                    imageVector = if (listening) Icons.Filled.MicOff else Icons.Filled.Mic,
                                    contentDescription = "음성",
                                    tint = if (listening) NugaColors.Amber else NugaColors.Sky,
                                )
                            }
                        },
                    )

                    NugaButton(
                        onClick = onSave,
                        enabled = state.no != null,
                        modifier = Modifier.fillMaxWidth(),
                        tone = ButtonTone.category(state.category, onDark = true),
                        height = 52.dp,
                        fontSize = 16.sp,
                    ) {
                        Text(text = if (state.no == null) "저장" else "저장 · ${state.no}번")
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}

/** 시트 바탕: 위가 조금 밝은 남색 + 오른쪽 위 번짐 + 위 테두리 빛줄기(끝은 따뜻한 반사광) */
private fun Modifier.sheetNight(): Modifier = drawWithCache {
    val w = size.width
    val face = Brush.verticalGradient(0f to NugaColors.Navy2, .45f to NugaColors.Navy1, 1f to NugaColors.Navy1)
    val bloomC = Offset(w * .92f, -40.dp.toPx())
    val bloomRx = w * .62f
    val bloom = Brush.radialGradient(
        0f to NugaColors.Bloom.copy(alpha = .30f), .45f to NugaColors.Bloom.copy(alpha = .09f), .70f to NugaColors.Bloom.copy(alpha = 0f),
        center = bloomC, radius = bloomRx.coerceAtLeast(1f),
    )
    val rim = Brush.horizontalGradient(
        0f to Color.Transparent,
        .6f to Color(0x73EAF2FF),
        .85f to NugaColors.SpecWarm.copy(alpha = .85f),
        1f to Color.Transparent,
    )
    val ry = 200.dp.toPx()
    onDrawBehind {
        drawRect(face)
        scale(scaleX = 1f, scaleY = ry / bloomRx, pivot = bloomC) { drawCircle(bloom, radius = bloomRx, center = bloomC) }
        drawRect(rim, topLeft = Offset(16.dp.toPx(), 0f), size = Size(w - 32.dp.toPx(), 1.dp.toPx()))
    }
}

/**
 * 번호 판. 꺼짐: 옅은 유리 (위가 밝은 1dp 테두리), 숫자는 밤 잉크.
 * 켜짐: 카테고리 색 유리 + 흰 숫자 + 아래로 같은 색 번짐.
 */
@Composable
private fun NumberPlate(n: Int, name: String?, selected: Boolean, category: Int, height: Dp, onClick: () -> Unit) {
    val shape = RoundedCornerShape(6.dp)
    val glow = NugaColors.category(category)
    Box(
        modifier = Modifier
            .height(height)
            .drawBehind {
                if (!selected) return@drawBehind
                val c = Offset(size.width / 2f, size.height)
                val rx = size.width * .7f
                scale(scaleX = 1f, scaleY = 10.dp.toPx() / rx, pivot = c) {
                    drawCircle(Brush.radialGradient(0f to glow.copy(alpha = .55f), 1f to Color.Transparent, center = c, radius = rx), radius = rx, center = c)
                }
            }
            .clip(shape)
            .background(
                if (selected) Brush.verticalGradient(listOf(NugaColors.categoryTop(category), NugaColors.category(category)))
                else Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .11f), NugaColors.Sky.copy(alpha = .045f))),
            )
            .border(
                1.dp,
                if (selected) Brush.verticalGradient(listOf(Color.White.copy(alpha = .60f), Color.White.copy(alpha = .16f)))
                else Brush.verticalGradient(listOf(Color(0x3DEAF2FF), Color(0x14ABC9F1))),
                shape,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$n",
                fontSize = if (name == null) 19.sp else 16.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight(650),
                letterSpacing = (-0.02).em,
                style = MaterialTheme.typography.titleMedium.tnum(),
                color = if (selected) Color.White else NugaColors.Ink,
            )
            if (name != null) {
                Text(
                    text = name,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    color = if (selected) Color.White.copy(alpha = .92f) else NugaColors.Ink2,
                )
            }
        }
    }
}

/** 밤 위 입력칸 (웹 어두운 바탕 공통 input) */
@Composable
private fun NightFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = NugaColors.Ink,
    unfocusedTextColor = NugaColors.Ink,
    focusedContainerColor = NugaColors.Sky.copy(alpha = .08f),
    unfocusedContainerColor = NugaColors.Sky.copy(alpha = .05f),
    focusedBorderColor = NugaColors.Sky,
    unfocusedBorderColor = NugaColors.Btn2Line,
    focusedLabelColor = NugaColors.Sky,
    unfocusedLabelColor = NugaColors.Ink2,
    cursorColor = NugaColors.Sky,
    focusedTrailingIconColor = NugaColors.Sky,
    unfocusedTrailingIconColor = NugaColors.Sky,
    selectionColors = TextSelectionColors(handleColor = NugaColors.Sky, backgroundColor = NugaColors.Sky.copy(alpha = .32f)),
)
