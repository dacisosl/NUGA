package kr.nuga.wear.ui

import android.app.Activity
import android.app.RemoteInput
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
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
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Picker
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Switch
import androidx.wear.compose.material.SwitchDefaults
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import androidx.wear.compose.material.rememberPickerState
import androidx.wear.input.RemoteInputIntentHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.Record
import kr.nuga.shared.time.NugaTime
import kr.nuga.shared.timetable.LessonState
import java.time.LocalDate

// ------------------------------------------------------------------ 1. 카테고리

private val TileGap = 8.dp

@Composable
fun CategoryScreen(
    config: Config?,
    lesson: LessonState,
    todayCount: Int,
    queueSize: Int,
    onCategory: (Int) -> Unit,
    onSettings: () -> Unit,
) {
    val categories = (config ?: Config.EMPTY).categories.take(4).ifEmpty { Config.DEFAULT_CATEGORIES }
    val side = roundInset(0.06f, 10.dp)
    Scaffold(timeText = { NightTimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .nightSky()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = side)
                .padding(top = 30.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val current = lesson.current
            val next = lesson.next
            when {
                config == null -> {
                    Text("폰 연결 대기", style = WatchType.Headline, maxLines = 1)
                    Text("설정 없음", style = WatchType.Meta, maxLines = 1)
                }
                current != null -> {
                    // In class now: the one live (sky) dot, balanced by an equal spacer so the headline stays centred.
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(WatchColors.Sky)
                        Spacer(Modifier.width(4.dp))
                        Text(current.headline, style = WatchType.Headline, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.width(18.dp))
                    }
                    Text(
                        current.subline ?: "${current.period.start}–${current.period.end}",
                        style = WatchType.Meta, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                else -> {
                    Text("수업 없음", style = WatchType.Headline, maxLines = 1)
                    val nextText = next?.let {
                        val day = if (it.date == LocalDate.now()) "" else NugaTime.koreanDate(it.date) + " "
                        "다음 $day${it.period.start} ${it.headline}"
                    } ?: "시간표 없음"
                    Text(nextText, style = WatchType.Meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(10.dp))
            BoxWithConstraints(Modifier.widthIn(max = 196.dp)) {
                val tileWidth = (maxWidth - TileGap) / 2
                Column(
                    verticalArrangement = Arrangement.spacedBy(TileGap),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    categories.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(TileGap)) {
                            row.forEach { cat ->
                                CategoryTile(
                                    label = cat.label,
                                    glass = Glasses.category(cat.key),
                                    onClick = { onCategory(cat.key) },
                                    modifier = Modifier.width(tileWidth).height(52.dp),
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    buildAnnotatedString {
                        append("오늘 ")
                        withStyle(SpanStyle(color = WatchColors.InkNum, fontWeight = FontWeight.Bold)) { append("$todayCount") }
                    },
                    style = WatchType.Meta,
                )
                if (queueSize > 0) {
                    Spacer(Modifier.width(6.dp))
                    Text("· 대기 $queueSize", style = WatchType.Meta.copy(color = WatchColors.AmberInk, fontWeight = FontWeight.SemiBold))
                }
                Spacer(Modifier.width(2.dp))
                SettingsButton(onClick = onSettings)
            }
        }
    }
}

/** A category is a luminous glass slab in its hue, with a soft glow of the same hue under it. */
@Composable
private fun CategoryTile(label: String, glass: Glass, onClick: () -> Unit, modifier: Modifier = Modifier) {
    GlassButton(onClick = onClick, glass = glass, modifier = modifier, glow = 10.dp) {
        Text(
            label,
            style = WatchType.Tile,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 6.dp),
        )
    }
}

/** 48dp touch target around a 32dp secondary glass disc. */
@Composable
private fun SettingsButton(onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(32.dp).glass(Glasses.Secondary, CircleShape, pressed = pressed), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Settings, contentDescription = "설정", tint = WatchColors.Ink2, modifier = Modifier.size(18.dp))
        }
    }
}

// ------------------------------------------------------------------ 2. 번호 릴

@Composable
fun ReelScreen(
    classLabel: String,
    size: Int,
    category: Int,
    categoryLabel: String,
    startProvider: suspend () -> Int,
    onSave: (Int) -> Unit,
) {
    val count = size.coerceAtLeast(1)
    var start by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(classLabel) { start = startProvider().coerceIn(1, count) }
    val initial = start ?: return
    val picker = rememberPickerState(initialNumberOfOptions = count, initiallySelectedOption = initial - 1, repeatItems = false)
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val catColor = WatchColors.category(category)
    LaunchedEffect(Unit) { focus.requestFocus() }

    Scaffold(timeText = { NightTimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .nightSky()
                .padding(top = 28.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    classLabel,
                    style = WatchType.Meta.copy(color = WatchColors.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.01).em),
                    maxLines = 1,
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .size(8.dp)
                        .shadow(4.dp, WatchShapes.Swatch, ambientColor = catColor, spotColor = catColor)
                        .background(catColor, WatchShapes.Swatch),
                )
                Spacer(Modifier.width(5.dp))
                Text(categoryLabel, style = WatchType.Meta.copy(color = catColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold), maxLines = 1)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .onRotaryScrollEvent { event ->
                        scope.launch {
                            val target = if (event.verticalScrollPixels > 0) picker.selectedOption + 1 else picker.selectedOption - 1
                            picker.animateScrollToOption(target.coerceIn(0, count - 1))
                        }
                        true
                    }
                    .focusRequester(focus)
                    .focusable(),
                contentAlignment = Alignment.Center,
            ) {
                NumberPlate(hue = catColor, modifier = Modifier.size(width = 116.dp, height = 76.dp))
                Picker(
                    state = picker,
                    contentDescription = "번호",
                    modifier = Modifier.fillMaxSize().fadeEdges(),
                    separation = 2.dp,
                    gradientRatio = 0f,
                ) { index ->
                    val selected = index == picker.selectedOption
                    Text(
                        text = "${index + 1}",
                        style = if (selected) WatchType.Numeral else WatchType.Numeral.copy(color = WatchColors.Ink3, fontSize = 30.sp, letterSpacing = (-0.03).em),
                        textAlign = TextAlign.Center,
                    )
                }
            }
            GlassButton(
                onClick = { onSave(picker.selectedOption + 1) },
                glass = Glasses.category(category),
                glow = 10.dp,
                modifier = Modifier.height(52.dp).widthIn(min = 120.dp),
            ) {
                Text(
                    "저장 · ${picker.selectedOption + 1}번",
                    style = WatchType.Button.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 14.dp),
                )
            }
        }
    }
}

/**
 * The glass step the selected number stands on: a faint translucent plate, a rim brightest at the top-right
 * (tinted by the category), and the stair "nosing beam" along its top edge — white, fading at both ends,
 * with a warm specular toward the right where the light comes from.
 */
@Composable
private fun NumberPlate(hue: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .drawWithCache {
                val w = size.width
                val beamStart = w * 0.06f
                val beamWidth = w * 0.88f
                val beam = Brush.horizontalGradient(
                    0f to Color.White.copy(alpha = 0f),
                    0.16f to WatchColors.Ink.copy(alpha = 0.85f),
                    0.70f to Color.White,
                    0.88f to WatchColors.SpecWarm,
                    1f to Color.White.copy(alpha = 0f),
                    startX = beamStart,
                    endX = beamStart + beamWidth,
                )
                val haloRadius = w * 0.46f
                val top = Offset(w / 2f, 0f)
                val halo = Brush.radialGradient(
                    0f to WatchColors.Sky.copy(alpha = 0.30f),
                    1f to WatchColors.Sky.copy(alpha = 0f),
                    center = top,
                    radius = haloRadius,
                )
                val line = 1.dp.toPx()
                onDrawWithContent {
                    drawContent()
                    scale(scaleX = 1f, scaleY = 0.09f, pivot = top) { drawCircle(halo, radius = haloRadius, center = top) }
                    drawRect(beam, topLeft = Offset(beamStart, 0f), size = Size(beamWidth, line))
                }
            }
            .clip(WatchShapes.Slab)
            .background(Brush.verticalGradient(listOf(WatchColors.Sky.copy(alpha = 0.09f), WatchColors.Sky.copy(alpha = 0.02f))))
            .border(1.dp, rimBrush(hue, light = Color.White.copy(alpha = 0.5f), mid = 0.32f, low = 0.06f, end = 0.16f), WatchShapes.Slab),
    )
}

/** Fades the reel to transparent at the top and bottom (works on any background, unlike a solid gradient colour). */
private fun Modifier.fadeEdges(): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(
            Brush.verticalGradient(
                0f to Color.Transparent,
                0.26f to Color.Black,
                0.74f to Color.Black,
                1f to Color.Transparent,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

// ------------------------------------------------------------------ 3. 저장 완료

@Composable
fun DoneScreen(
    record: Record?,
    categoryLabel: String,
    onTranscript: (String) -> Unit,
    onCancel: () -> Unit,
    onFinished: () -> Unit,
) {
    val context = LocalContext.current
    var seconds by remember(record?.id) { mutableIntStateOf(5) }
    var paused by remember { mutableStateOf(false) }
    var transcript by remember(record?.id) { mutableStateOf("") }

    val memoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        paused = false
        seconds = 3
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val spoken = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
                ?: data?.let { RemoteInput.getResultsFromIntent(it)?.getCharSequence(MEMO_KEY)?.toString() }
            if (!spoken.isNullOrBlank()) {
                transcript = spoken
                onTranscript(spoken)
            }
        }
    }

    LaunchedEffect(record?.id, paused) {
        if (record == null) { onFinished(); return@LaunchedEffect }
        if (paused) return@LaunchedEffect
        while (seconds > 0) {
            delay(1_000)
            seconds--
        }
        onFinished()
    }

    fun startMemo() {
        paused = true
        val speech = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "메모")
        }
        val intent = if (speech.resolveActivity(context.packageManager) != null) {
            speech
        } else {
            RemoteInputIntentHelper.createActionRemoteInputIntent().also {
                RemoteInputIntentHelper.putRemoteInputsExtra(it, listOf(RemoteInput.Builder(MEMO_KEY).setLabel("메모").build()))
            }
        }
        runCatching { memoLauncher.launch(intent) }.onFailure { paused = false }
    }

    Scaffold(timeText = { NightTimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .nightSky()
                .padding(horizontal = 16.dp)
                .padding(top = 26.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            val key = record?.category ?: 4
            val catColor = WatchColors.category(key)
            Box(
                modifier = Modifier.size(40.dp).glass(Glasses.category(key), CircleShape, glow = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Check, contentDescription = "저장", tint = WatchColors.Ink, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = record?.let { "${it.classLabel} · ${it.no}번" } ?: "",
                style = WatchType.Title,
                maxLines = 1,
            )
            Text(categoryLabel, style = WatchType.Meta.copy(color = catColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold), maxLines = 1)
            if (transcript.isNotBlank()) {
                Text(transcript, style = WatchType.Meta, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton(onClick = ::startMemo, glass = Glasses.Secondary, shape = CircleShape, modifier = Modifier.size(52.dp)) {
                    Text("메모", style = WatchType.Button)
                }
                GlassButton(onClick = onCancel, glass = Glasses.Warn, shape = CircleShape, modifier = Modifier.size(52.dp)) {
                    Text(if (paused) "취소" else "취소 $seconds", style = WatchType.Button.copy(fontSize = 13.sp))
                }
            }
        }
    }
}

private const val MEMO_KEY = "memo"

// ------------------------------------------------------------------ 4. 설정

@Composable
fun SettingsScreen(
    autoLaunch: Boolean,
    connected: Boolean,
    queueSize: Int,
    hasConfig: Boolean,
    onAutoLaunch: (Boolean) -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold(timeText = { NightTimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .nightSky()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = roundInset(0.09f, 12.dp))
                .padding(top = roundInset(0.19f, 32.dp), bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ToggleChip(
                checked = autoLaunch,
                onCheckedChange = onAutoLaunch,
                label = { Text("자동 실행", style = WatchType.Button, color = WatchColors.Ink) },
                toggleControl = {
                    Switch(
                        checked = autoLaunch,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = WatchColors.Sky,
                            checkedTrackColor = WatchColors.Sky.copy(alpha = 0.38f),
                            uncheckedThumbColor = WatchColors.Ink3,
                            uncheckedTrackColor = WatchColors.Ink3.copy(alpha = 0.38f),
                        ),
                    )
                },
                colors = ToggleChipDefaults.toggleChipColors(
                    checkedStartBackgroundColor = WatchColors.Navy3,
                    checkedEndBackgroundColor = Color(0xFF2D425C),      // sky .18 over navy: lit toward the light (right)
                    checkedContentColor = WatchColors.Ink,
                    checkedToggleControlColor = WatchColors.Sky,
                    uncheckedStartBackgroundColor = WatchColors.Navy3,
                    uncheckedEndBackgroundColor = Color(0xFF172A40),
                    uncheckedContentColor = WatchColors.Ink,
                    uncheckedToggleControlColor = WatchColors.Ink3,
                ),
                shape = WatchShapes.Slab,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, if (autoLaunch) Glasses.SkyRim else Glasses.Secondary.rim, WatchShapes.Slab),
            )
            NightRule(Modifier.fillMaxWidth(0.7f))
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(if (connected) WatchColors.OkLed else WatchColors.Amber)
                Spacer(Modifier.width(4.dp))
                Text(if (connected) "폰 연결됨" else "폰 없음", style = WatchType.Meta)
            }
            Text(if (hasConfig) "설정 수신됨" else "설정 없음", style = WatchType.Meta)
            GlassButton(
                onClick = onRetry,
                glass = if (queueSize > 0) Glasses.Warn else Glasses.Secondary,
                modifier = Modifier.height(48.dp).widthIn(min = 112.dp),
            ) {
                Text(
                    if (queueSize > 0) "대기 $queueSize · 재전송" else "대기 없음",
                    style = WatchType.Button.copy(fontSize = 13.sp),
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }
    }
}
