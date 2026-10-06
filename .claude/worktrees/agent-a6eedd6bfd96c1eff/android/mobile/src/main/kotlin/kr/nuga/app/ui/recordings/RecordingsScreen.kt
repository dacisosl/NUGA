package kr.nuga.app.ui.recordings

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kr.nuga.app.record.RecordingItem
import kr.nuga.app.record.RecordingService
import kr.nuga.app.record.RecordingStatus
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.home.Card
import kr.nuga.app.ui.home.Divider
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.Eyebrow
import kr.nuga.app.ui.theme.NugaButton
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.ScreenHeader
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.RecordingMode
import kr.nuga.shared.time.NugaTime

/** 녹음 탭 (v3 13.2): 지금 녹음 상태, 오늘 녹음 대기, 수업별 녹음 목록(남은 보존 시간·변환 상태·다시 듣기) */
@Composable
fun RecordingsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val config by vm.config.collectAsStateWithLifecycle()
    val items by vm.recordings.collectAsStateWithLifecycle()
    val rec by vm.recorder.collectAsStateWithLifecycle()
    val keys by vm.speechKeys.collectAsStateWithLifecycle()
    val cfg = config ?: Config.EMPTY
    val rc = cfg.recording
    var micGranted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { micGranted = it }
    var confirmDelete by remember { mutableStateOf<RecordingItem?>(null) }
    val player = remember { mutableStateOf<MediaPlayer?>(null) }
    var playingId by remember { mutableStateOf<String?>(null) }
    DisposableEffect(Unit) { onDispose { player.value?.release(); player.value = null } }
    var tick by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1000); tick = System.currentTimeMillis() } }

    fun togglePlay(item: RecordingItem) {
        player.value?.release(); player.value = null
        if (playingId == item.id) { playingId = null; return }
        val f = vm.audioFile(item)
        if (!f.exists()) return
        runCatching {
            MediaPlayer().apply { setDataSource(f.absolutePath); setOnCompletionListener { playingId = null }; prepare(); start() }
        }.onSuccess { player.value = it; playingId = item.id }
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader(index = "03", title = "녹음") }
        item {
            Card {
                Column(Modifier.padding(start = 18.dp, end = 16.dp, top = 18.dp, bottom = 16.dp)) {
                    if (rc?.active != true) {
                        Text("수업 녹음이 꺼져 있습니다", style = MaterialTheme.typography.titleMedium, fontSize = 17.sp)
                        Spacer(Modifier.height(6.dp))
                        Text("PC 설정 → 녹음에서 사용 조건(학교 승인·고지·동의)을 확인한 뒤 켜면 이 폰에 반영됩니다.", color = NugaColors.Text2, style = MaterialTheme.typography.bodyMedium)
                    } else {
                        val r = rec.recording
                        val live = r != null && !rec.paused
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // 녹음 중: 빨간 점 + 옅은 고리 (깜박이지 않는다)
                            Box(
                                Modifier.size(16.dp).drawBehind {
                                    if (live) drawCircle(NugaColors.Rec.copy(alpha = .16f), radius = 8.dp.toPx())
                                    drawCircle(if (live) NugaColors.Rec else NugaColors.Field, radius = 5.dp.toPx())
                                },
                            )
                            Spacer(Modifier.width(6.dp))
                            val title = when {
                                r != null && rec.paused -> "일시정지 · ${r.classLabel} ${if (r.period > 0) "${r.period}교시" else ""}"
                                r != null -> "녹음 중 · ${r.classLabel} ${if (r.period > 0) "${r.period}교시" else ""}"
                                rec.standby -> "오늘 녹음 대기 중"
                                else -> "녹음하지 않는 중"
                            }
                            Text(title, style = MaterialTheme.typography.titleMedium, fontSize = 17.sp, color = if (live) NugaColors.Rec else NugaColors.Text)
                            Spacer(Modifier.weight(1f))
                            if (live) {
                                @Suppress("UNUSED_VARIABLE") val t = tick
                                Text(clock((SystemClock.elapsedRealtime() - rec.chronoBase) / 1000), style = MaterialTheme.typography.titleMedium.tnum(), fontSize = 15.sp, color = NugaColors.Text2)
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        if (!micGranted) {
                            Text("마이크 권한이 필요합니다.", color = NugaColors.Warn, style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(8.dp))
                            NugaButton(onClick = { askMic.launch(Manifest.permission.RECORD_AUDIO) }) { Text("마이크 권한 허용") }
                        } else if (rec.recording != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                NugaButton(onClick = { vm.recorderCommand(if (rec.paused) RecordingService.ACTION_RESUME else RecordingService.ACTION_PAUSE) }, tone = ButtonTone.Secondary) { Text(if (rec.paused) "다시 녹음" else "일시정지") }
                                NugaButton(onClick = { vm.recorderCommand(RecordingService.ACTION_STOP) }, tone = ButtonTone.Record) { Text("중단") }
                            }
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                NugaButton(onClick = { vm.startRecordingNow() }, tone = ButtonTone.Record) { Text("● 지금 수업 녹음") }
                                if (rec.standby) NugaButton(onClick = { vm.recorderCommand(RecordingService.ACTION_STANDBY_OFF) }, tone = ButtonTone.Secondary) { Text("대기 끄기") }
                                else NugaButton(onClick = { vm.startStandby() }, tone = ButtonTone.Secondary) { Text("오늘 녹음 대기") }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Text(
                            if (rc.mode == RecordingMode.STANDBY) "대기 방식: 아침에 [오늘 녹음 대기]를 한 번 누르면 시간표의 수업 시간마다 자동으로 녹음합니다."
                            else "1탭 방식: 수업 시작 알림의 [● 녹음 시작]을 누르면 그 수업 끝까지 녹음합니다.",
                            color = NugaColors.Text2, fontSize = 13.sp, lineHeight = 19.sp,
                        )
                        Text("음성은 이 폰에만 저장되고 ${rc.audioTTLHours}시간 뒤 지워집니다. PC로는 스크립트(글)만 보냅니다.", color = NugaColors.Text2, fontSize = 13.sp, lineHeight = 19.sp)
                        if (keys.forProvider(rc.speech.provider).isBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text("음성 변환 키가 아직 없습니다. PC 설정 → 녹음 → [폰으로 키 보내기]", color = NugaColors.Warn, fontSize = 13.sp, lineHeight = 19.sp)
                        }
                    }
                }
            }
        }
        if (items.isEmpty()) {
            item { Text("녹음한 수업이 없습니다.", color = NugaColors.Ink2, modifier = Modifier.padding(8.dp)) }
        } else {
            item { Eyebrow("수업별 녹음") }
            item {
                Card {
                    items.forEachIndexed { i, it ->
                        if (i > 0) Divider()
                        RecordingRow(it, tick, playing = playingId == it.id, onPlay = { togglePlay(it) }, onRetry = { vm.retryTranscribe(it.id) }, onDelete = { confirmDelete = it })
                    }
                }
            }
        }
    }

    confirmDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("녹음 삭제") },
            text = { Text("${item.classLabel} ${item.period}교시 녹음과 이 폰의 스크립트를 지웁니다. PC로 이미 보낸 스크립트는 PC에 남습니다.") },
            confirmButton = { TextButton(onClick = { if (playingId == item.id) { player.value?.release(); player.value = null; playingId = null }; vm.deleteRecording(item.id); confirmDelete = null }) { Text("삭제", color = NugaColors.Warn) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("취소") } },
        )
    }
}

@Composable
private fun RecordingRow(item: RecordingItem, now: Long, playing: Boolean, onPlay: () -> Unit, onRetry: () -> Unit, onDelete: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${item.classLabel}${if (item.period > 0) " · ${item.period}교시" else ""}", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(8.dp))
            Text(
                "${NugaTime.parse(item.startedAt)?.let { "${it.monthValue}/${it.dayOfMonth} ${NugaTime.shortTime(item.startedAt)}" } ?: ""} · ${clock(item.durationSec.toLong())}",
                color = NugaColors.Text2, style = MaterialTheme.typography.bodySmall.tnum(), fontSize = 13.sp,
            )
            Spacer(Modifier.weight(1f))
            StatusChip(item.status)
        }
        Spacer(Modifier.height(4.dp))
        val left = item.deleteAtMs - now
        Text(
            when {
                item.audioDeleted -> "음성 삭제됨"
                left <= 0 -> "곧 음성 삭제"
                else -> "음성 삭제까지 ${left / 3_600_000}시간 ${(left / 60_000) % 60}분"
            } + (if (item.segmentCount > 0) " · 발언 ${item.segmentCount}개" else ""),
            color = NugaColors.Text2, style = MaterialTheme.typography.bodySmall.tnum(), fontSize = 13.sp,
        )
        if (item.error.isNotBlank()) Text(item.error, color = NugaColors.Warn, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.offset(x = (-12).dp)) {
            if (!item.audioDeleted && item.status != RecordingStatus.RECORDING && item.status != RecordingStatus.PAUSED) TextButton(onClick = onPlay) { Text(if (playing) "■ 정지" else "▶ 다시 듣기", fontWeight = FontWeight(650)) }
            if (!item.audioDeleted && (item.status == RecordingStatus.FAILED || item.status == RecordingStatus.RECORDED)) TextButton(onClick = onRetry) { Text("변환 다시 시도", fontWeight = FontWeight(650)) }
            if (item.status != RecordingStatus.RECORDING && item.status != RecordingStatus.PAUSED) TextButton(onClick = onDelete) { Text("삭제", color = NugaColors.Warn, fontWeight = FontWeight(650)) }
        }
    }
}

/** 상태 칩: 작은 둥글기(4dp), 색 + 낱말 */
@Composable
private fun StatusChip(status: String) {
    val (fg, bg) = when (status) {
        RecordingStatus.RECORDING -> NugaColors.Rec to NugaColors.RecSoft
        RecordingStatus.FAILED -> NugaColors.Warn to NugaColors.WarnSoft
        RecordingStatus.DELIVERED, RecordingStatus.SENT -> NugaColors.Accent to NugaColors.AccentSoft
        else -> NugaColors.Text2 to NugaColors.Mute
    }
    Text(RecordingStatus.label(status), color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.background(bg, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 3.dp))
}

private fun clock(sec: Long): String {
    val s = sec.coerceAtLeast(0)
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60) else "%02d:%02d".format(s / 60, s % 60)
}
