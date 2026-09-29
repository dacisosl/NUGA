package kr.nuga.wear.ui

import android.app.Activity
import android.app.RemoteInput
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Picker
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Switch
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
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
    Scaffold(timeText = { TimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(WatchColors.Bg)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp)
                .padding(top = 30.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val current = lesson.current
            val next = lesson.next
            when {
                config == null -> {
                    Text("폰 연결 대기", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = WatchColors.Text)
                    Text("설정 없음", fontSize = 11.sp, color = WatchColors.Text2)
                }
                current != null -> {
                    Text(current.headline, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = WatchColors.Text, maxLines = 1)
                    Text(current.subline ?: "${current.period.start}–${current.period.end}", fontSize = 11.sp, color = WatchColors.Text2, maxLines = 1)
                }
                else -> {
                    Text("수업 없음", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = WatchColors.Text)
                    val nextText = next?.let {
                        val day = if (it.date == LocalDate.now()) "" else NugaTime.koreanDate(it.date) + " "
                        "다음 $day${it.period.start} ${it.headline}"
                    } ?: "시간표 없음"
                    Text(nextText, fontSize = 11.sp, color = WatchColors.Text2, maxLines = 1)
                }
            }
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                categories.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { cat ->
                            CategoryTile(label = cat.label, color = WatchColors.category(cat.key), onClick = { onCategory(cat.key) })
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("오늘 $todayCount", fontSize = 12.sp, color = WatchColors.Text2)
                if (queueSize > 0) {
                    Spacer(Modifier.width(6.dp))
                    Text("· 대기 $queueSize", fontSize = 12.sp, color = WatchColors.Warn)
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(WatchColors.Surface)
                        .clickable(onClick = onSettings),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Settings, contentDescription = "설정", tint = WatchColors.Text2, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
private fun CategoryTile(label: String, color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .width(84.dp)
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(color)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color.White, textAlign = TextAlign.Center)
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

    Scaffold(timeText = { TimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(WatchColors.Bg)
                .padding(top = 28.dp, bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(classLabel, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = WatchColors.Text)
                Spacer(Modifier.width(6.dp))
                Box(Modifier.size(8.dp).clip(CircleShape).background(catColor))
                Spacer(Modifier.width(4.dp))
                Text(categoryLabel, fontSize = 12.sp, color = catColor)
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
                Picker(
                    state = picker,
                    contentDescription = "번호",
                    modifier = Modifier.fillMaxSize(),
                    separation = 2.dp,
                    gradientColor = WatchColors.Bg,
                ) { index ->
                    val selected = index == picker.selectedOption
                    Text(
                        text = "${index + 1}",
                        fontSize = if (selected) 64.sp else 30.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (selected) WatchColors.Text else WatchColors.Text2.copy(alpha = 0.6f),
                        textAlign = TextAlign.Center,
                    )
                }
            }
            Chip(
                onClick = { onSave(picker.selectedOption + 1) },
                label = {
                    Text("저장 · ${picker.selectedOption + 1}번", fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                },
                colors = ChipDefaults.chipColors(backgroundColor = catColor, contentColor = Color.White),
                modifier = Modifier.height(48.dp).fillMaxWidth(0.78f),
            )
        }
    }
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

    Scaffold(timeText = { TimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(WatchColors.Bg)
                .padding(horizontal = 16.dp)
                .padding(top = 26.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            val catColor = WatchColors.category(record?.category ?: 4)
            Box(
                modifier = Modifier.size(40.dp).clip(CircleShape).background(catColor),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Check, contentDescription = "저장", tint = Color.White, modifier = Modifier.size(26.dp))
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = record?.let { "${it.classLabel} · ${it.no}번" } ?: "",
                fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WatchColors.Text,
            )
            Text(categoryLabel, fontSize = 13.sp, color = catColor)
            if (transcript.isNotBlank()) {
                Text(transcript, fontSize = 11.sp, color = WatchColors.Text2, maxLines = 1, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = ::startMemo,
                    colors = ButtonDefaults.buttonColors(backgroundColor = WatchColors.Surface, contentColor = WatchColors.Text),
                    modifier = Modifier.size(52.dp),
                ) { Text("메모", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                Button(
                    onClick = onCancel,
                    colors = ButtonDefaults.buttonColors(backgroundColor = WatchColors.Surface, contentColor = WatchColors.Warn),
                    modifier = Modifier.size(52.dp),
                ) { Text(if (paused) "취소" else "취소 $seconds", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
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
    Scaffold(timeText = { TimeText() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(WatchColors.Bg)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp)
                .padding(top = 32.dp, bottom = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            ToggleChip(
                checked = autoLaunch,
                onCheckedChange = onAutoLaunch,
                label = { Text("자동 실행", fontSize = 13.sp) },
                toggleControl = { Switch(checked = autoLaunch) },
                colors = ToggleChipDefaults.toggleChipColors(checkedStartBackgroundColor = WatchColors.Surface, checkedEndBackgroundColor = WatchColors.Cat1.copy(alpha = 0.5f)),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (connected) WatchColors.Cat2 else WatchColors.Warn))
                Spacer(Modifier.width(6.dp))
                Text(if (connected) "폰 연결됨" else "폰 없음", fontSize = 12.sp, color = WatchColors.Text2)
            }
            Text(if (hasConfig) "설정 수신됨" else "설정 없음", fontSize = 12.sp, color = WatchColors.Text2)
            CompactChip(
                onClick = onRetry,
                label = { Text(if (queueSize > 0) "대기 $queueSize · 재전송" else "대기 없음", fontSize = 12.sp) },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}
