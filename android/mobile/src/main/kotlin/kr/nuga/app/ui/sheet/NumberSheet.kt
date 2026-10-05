package kr.nuga.app.ui.sheet

import android.Manifest
import android.content.res.Configuration
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kr.nuga.app.speech.SpeechToText
import kr.nuga.app.ui.SheetState
import kr.nuga.app.ui.hasCategory
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.NightChip
import kr.nuga.app.ui.theme.NugaButton
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.CATEGORY_NONE
import kr.nuga.shared.model.Config
import kotlin.math.abs
import kotlin.math.roundToInt

/** 릴 한 칸 높이와 한 번에 보이는 칸 수(가운데 하나 + 위아래 둘씩) */
private val ReelRow = 56.dp
private const val ReelRows = 5

/**
 * 기록 시트: 반 · 번호 릴 · 저장. 카테고리는 고르지 않는다(0 = 미정, PC가 보충할 때 정한다).
 * 밤의 시트(웹 '쉬는 시간 기록' 머리와 같은 빛): 위 테두리에 빛줄기, 오른쪽 위 번짐.
 * 번호는 세로 릴: 굴리면 한 칸씩 딸깍 멈추고(스냅 + 햅틱), 가운데 유리 판 위의 숫자가 고른 번호다.
 * 메모·음성 메모는 저장 옆 작은 [메모] 버튼을 눌렀을 때만 펼친다.
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

    val size = config.classSize(state.classLabel).coerceAtLeast(1)
    var memoOpen by rememberSaveable { mutableStateOf(state.memo.isNotEmpty()) }
    val memoFocus = remember { FocusRequester() }
    var focusMemo by remember { mutableStateOf(false) }

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
                        .padding(top = 18.dp, bottom = 8.dp)
                        .navigationBarsPadding(),
                ) {
                    // 반: 여러 반이면 칩(지금 수업 반이 켜진 채로 열린다), 한 반이면 큰 이름
                    Row(modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (config.classes.size > 1) {
                            Row(
                                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                config.classes.forEach { c ->
                                    NightChip(
                                        label = c.classLabel,
                                        selected = c.classLabel == state.classLabel,
                                        onClick = { onClass(c.classLabel) },
                                        fontSize = 14.sp,
                                    )
                                }
                            }
                        } else {
                            Text(
                                state.classLabel,
                                style = MaterialTheme.typography.titleLarge,
                                color = NugaColors.InkDisplay,
                                maxLines = 1,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        // 예전 링크(category=N)로 열렸을 때만: 그 카테고리를 작게 보이고, 눌러서 뺄 수 있다
                        if (hasCategory(state.category)) {
                            Spacer(Modifier.width(8.dp))
                            LegacyCategoryTag(
                                label = config.categoryLabel(state.category),
                                key = state.category,
                                onClear = { onCategory(CATEGORY_NONE) },
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                        Text("${size}명", style = MaterialTheme.typography.bodySmall.tnum(), color = NugaColors.Ink3)
                    }

                    Spacer(Modifier.height(6.dp))

                    // 번호 릴: 반을 바꾸면(또는 시작 번호를 읽기 전에는) 새로 만든다
                    Box(Modifier.fillMaxWidth().height(ReelRow * ReelRows)) {
                        val no = state.no
                        if (no != null) {
                            key(state.classLabel, size) {
                                NumberReel(
                                    count = size,
                                    initial = no.coerceIn(1, size),
                                    nameOf = { n -> if (showNames) config.nameOf(state.classLabel, n) else null },
                                    withNames = showNames && config.roster?.any { it.classLabel == state.classLabel } == true,
                                    onSelect = onNo,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    // 메모(선택): 펼쳤을 때만. 마이크는 칸 안 오른쪽
                    if (memoOpen) {
                        OutlinedTextField(
                            value = state.memo,
                            onValueChange = onMemo,
                            modifier = Modifier.fillMaxWidth().focusRequester(memoFocus),
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
                        Spacer(Modifier.height(10.dp))
                        LaunchedEffect(focusMemo) {
                            if (focusMemo) {
                                runCatching { memoFocus.requestFocus() }
                                focusMemo = false
                            }
                        }
                    }

                    // [메모] [저장 · N번]: 저장이 화면의 주인공, 메모는 옆의 작은 유리 버튼
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MemoToggle(
                            open = memoOpen,
                            hasMemo = state.memo.isNotBlank(),
                            onToggle = {
                                memoOpen = !memoOpen
                                if (!memoOpen) speech.stop() else focusMemo = true
                            },
                        )
                        Spacer(Modifier.width(8.dp))
                        NugaButton(
                            onClick = onSave,
                            enabled = state.no != null,
                            modifier = Modifier.weight(1f),
                            tone = ButtonTone.Lit,
                            height = 56.dp,
                            radius = 10.dp,
                            fontSize = 17.sp,
                        ) {
                            Text(text = state.no?.let { "저장 · ${it}번" } ?: "저장", maxLines = 1)
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}

// ------------------------------------------------------------------ 번호 릴

/** 한 칸 넘어갈 때마다 짧은 '틱' (Android 14+는 전용 진동, 그 아래는 글자 손잡이 진동) */
private val ReelTick: HapticFeedbackType
    get() = if (Build.VERSION.SDK_INT >= 34) HapticFeedbackType.SegmentFrequentTick else HapticFeedbackType.TextHandleMove

/** 릴이 끝에 닿아도 남은 끌기·튕기기를 시트로 넘기지 않는다 (번호를 굴리다 시트가 닫히지 않게) */
private val KeepScrollInReel = object : NestedScrollConnection {
    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset = available
    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity = available
}

/**
 * 세로 번호 릴 1..count. 위아래 두 칸씩 여백을 두어 1번과 마지막 번호도 가운데에 설 수 있다.
 * 손을 떼면 가장 가까운 칸에 딸깍 멈추고(SnapPosition.Center), 가운데 칸이 바뀔 때마다 햅틱 + [onSelect].
 * 다른 칸을 누르면 그 번호가 가운데로 굴러온다. 가운데에서 멀수록 작고 흐리다(재구성 없이 그리기 단계에서).
 * [initial]은 처음 한 번만 읽는다. 밖에서 번호를 바꾸려면 key로 릴을 새로 만든다.
 */
@Composable
private fun NumberReel(
    count: Int,
    initial: Int,
    nameOf: (Int) -> String?,
    withNames: Boolean,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = initial - 1)
    val fling = rememberSnapFlingBehavior(lazyListState = listState, snapPosition = SnapPosition.Center)
    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val report by rememberUpdatedState(onSelect)
    val centre: State<Float> = remember(listState) { derivedStateOf { listState.centreFloat() } }
    var reported by remember { mutableIntStateOf(initial) }

    LaunchedEffect(listState, count) {
        snapshotFlow { centre.value.roundToInt().coerceIn(0, count - 1) + 1 }.collect { n ->
            if (n != reported) {
                reported = n
                haptic.performHapticFeedback(ReelTick)
                report(n)
            }
        }
    }

    Box(modifier.semantics { contentDescription = "번호" }, contentAlignment = Alignment.Center) {
        // 가운데 유리 판: 고른 번호가 서는 자리 (움직이지 않는다)
        Box(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
                .height(ReelRow)
                .reelPlate(),
        )
        LazyColumn(
            state = listState,
            flingBehavior = fling,
            contentPadding = PaddingValues(vertical = ReelRow * (ReelRows / 2)),
            modifier = Modifier
                .fillMaxSize()
                .nestedScroll(KeepScrollInReel)
                .fadeEdges(),
        ) {
            items(count = count, key = { it }) { index ->
                val n = index + 1
                ReelRowItem(
                    n = n,
                    name = nameOf(n),
                    withNames = withNames,
                    isSelected = n == reported,
                    centre = centre,
                    index = index,
                    onClick = { scope.launch { listState.animateScrollToItem(index) } },
                )
            }
        }
    }
}

/** 릴 한 칸. 크기·투명도는 가운데와의 거리(칸 단위)로: 0 → 1.0·1.0, 1 → 0.74·0.58, 2 → 0.56·0.30 */
@Composable
private fun ReelRowItem(
    n: Int,
    name: String?,
    withNames: Boolean,
    isSelected: Boolean,
    centre: State<Float>,
    index: Int,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ReelRow)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClickLabel = "${n}번 고르기",
                onClick = onClick,
            )
            .semantics { selected = isSelected }
            .graphicsLayer {
                val d = abs(index - centre.value).coerceAtMost(2.5f)
                val s = if (d <= 1f) 1f - 0.26f * d else 0.74f - 0.18f * (d - 1f)
                scaleX = s
                scaleY = s
                alpha = if (d <= 1f) 1f - 0.42f * d else (0.58f - 0.28f * (d - 1f)).coerceAtLeast(0f)
            },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$n",
            color = NugaColors.InkNum,
            fontSize = 40.sp,
            lineHeight = 44.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.045).em,
            style = MaterialTheme.typography.displaySmall.tnum(),
            textAlign = if (withNames) TextAlign.End else TextAlign.Center,
            maxLines = 1,
            modifier = if (withNames) Modifier.width(76.dp) else Modifier,
        )
        if (withNames) {
            Spacer(Modifier.width(18.dp))
            Text(
                text = name ?: "",
                color = NugaColors.Ink,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = (-0.02).em,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(128.dp),
            )
        }
    }
}

/** 뷰포트 가운데에 선 칸의 위치(칸 단위, 소수). 3.4면 4번째 칸(index 3)이 가운데에서 0.4칸 아래로 비껴 있다 */
private fun LazyListState.centreFloat(): Float {
    val info = layoutInfo
    val items = info.visibleItemsInfo
    if (items.isEmpty()) return firstVisibleItemIndex.toFloat()
    val mid = (info.viewportStartOffset + info.viewportEndOffset) / 2f
    var best = items[0]
    var bestD = Float.MAX_VALUE
    for (item in items) {
        val d = abs(item.offset + item.size / 2f - mid)
        if (d < bestD) {
            bestD = d
            best = item
        }
    }
    return best.index + (mid - (best.offset + best.size / 2f)) / best.size.coerceAtLeast(1)
}

/** 위아래 끝을 투명하게 (바탕이 그라데이션이어도 맞는다) */
private fun Modifier.fadeEdges(): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(
            Brush.verticalGradient(0f to Color.Transparent, 0.2f to Color.Black, 0.8f to Color.Black, 1f to Color.Transparent),
            blendMode = BlendMode.DstIn,
        )
    }

/** 판 테두리: 빛이 드는 오른쪽 위가 가장 밝고, 왼쪽 아래에서 하늘빛이 조금 살아난다 */
private val PlateRim = Brush.linearGradient(
    0f to Color.White.copy(alpha = .62f),
    .22f to NugaColors.Sky.copy(alpha = .34f),
    .56f to NugaColors.Sky.copy(alpha = .10f),
    1f to NugaColors.Sky.copy(alpha = .20f),
    start = Offset(Float.POSITIVE_INFINITY, 0f), end = Offset(0f, Float.POSITIVE_INFINITY),
)

/**
 * 고른 번호가 서는 유리 계단 (워치 번호 판과 같은 빛): 옅은 하늘빛 유리 Sky .16 → .05,
 * 오른쪽 위가 밝은 1dp 테두리, 위 모서리를 따라 흰 빛줄기(오른쪽 끝은 따뜻한 반사광), 아래로 푸른 번짐.
 */
private fun Modifier.reelPlate(): Modifier {
    val shape = RoundedCornerShape(12.dp)
    return this
        .drawWithCache {
            val c = Offset(size.width / 2f, size.height)
            val rx = (size.width * .42f).coerceAtLeast(1f)
            val glow = Brush.radialGradient(0f to NugaColors.Bloom.copy(alpha = .34f), 1f to Color.Transparent, center = c, radius = rx)
            onDrawBehind { scale(scaleX = 1f, scaleY = 14.dp.toPx() / rx, pivot = c) { drawCircle(glow, radius = rx, center = c) } }
        }
        .clip(shape)
        .background(Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .16f), NugaColors.Sky.copy(alpha = .05f))))
        .border(1.dp, PlateRim, shape)
        .drawWithCache {
            // 빛줄기는 폭의 6%~94%: 판 전체 폭에 그리고 양 끝을 투명하게 둔다 (사각형 시작 픽셀이 둥근 모서리 밖으로 잘려 나가게)
            val beam = Brush.horizontalGradient(
                0f to Color.White.copy(alpha = 0f),
                .06f to Color.White.copy(alpha = 0f),
                .20f to NugaColors.Ink.copy(alpha = .85f),
                .676f to Color.White,
                .834f to NugaColors.SpecWarm,
                .94f to Color.White.copy(alpha = 0f),
                1f to Color.White.copy(alpha = 0f),
            )
            onDrawWithContent {
                drawContent()
                drawRect(beam, size = Size(size.width, 1.dp.toPx()))
            }
        }
}

// ------------------------------------------------------------------ 작은 것들

/** 저장 옆 작은 [메모] 유리 버튼. 펼치면 하늘빛 테두리, 접혀 있어도 메모가 있으면 점 하나 */
@Composable
private fun MemoToggle(open: Boolean, hasMemo: Boolean, onToggle: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box {
        Row(
            modifier = Modifier
                .minimumInteractiveComponentSize()
                .height(56.dp)
                .clip(shape)
                .background(
                    if (open) Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .17f), NugaColors.Sky.copy(alpha = .06f)))
                    else Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .09f), NugaColors.Sky.copy(alpha = .035f))),
                )
                .border(1.dp, if (open) NugaColors.Sky.copy(alpha = .55f) else NugaColors.DLine2, shape)
                .toggleable(value = open, role = Role.Switch, onValueChange = { onToggle() })
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.EditNote, contentDescription = null, tint = if (open) NugaColors.Sky else NugaColors.Btn2Ink, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(6.dp))
            Text("메모", color = if (open) NugaColors.Ink else NugaColors.Btn2Ink, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.015).em)
        }
        if (hasMemo && !open) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 8.dp, end = 8.dp)
                    .size(7.dp)
                    .background(NugaColors.Sky, CircleShape),
            )
        }
    }
}

/** 예전 링크로 정해진 카테고리: 색 조각 + 낱말 + ×. 누르면 미정으로 */
@Composable
private fun LegacyCategoryTag(label: String, key: Int, onClear: () -> Unit) {
    val shape = RoundedCornerShape(6.dp)
    Row(
        modifier = Modifier
            .minimumInteractiveComponentSize()
            .height(30.dp)
            .clip(shape)
            .background(NugaColors.Sky.copy(alpha = .07f))
            .border(1.dp, NugaColors.DLine2, shape)
            .clickable(role = Role.Button, onClickLabel = "카테고리 빼기", onClick = onClear)
            .padding(start = 9.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).background(NugaColors.categoryOnDark(key), RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(6.dp))
        Text(label, color = NugaColors.Ink2, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(2.dp))
        Icon(Icons.Filled.Close, contentDescription = null, tint = NugaColors.Ink3, modifier = Modifier.size(14.dp))
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
