package kr.nuga.app.ui.settings

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kr.nuga.app.ui.MainViewModel
import kr.nuga.app.ui.home.Card
import kr.nuga.app.ui.home.Divider
import kr.nuga.app.ui.home.SectionTitle
import kr.nuga.app.ui.theme.ButtonTone
import kr.nuga.app.ui.theme.NugaButton
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.ScreenHeader
import kr.nuga.app.ui.theme.tnum
import kr.nuga.shared.model.Config
import kr.nuga.shared.time.NugaTime

@Composable
fun SettingsScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val config by vm.config.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val pairing by vm.pairing.collectAsStateWithLifecycle()
    val outbox by vm.outboxCount.collectAsStateWithLifecycle()
    val syncing by vm.syncing.collectAsStateWithLifecycle()

    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { vm.pair(it) }
    }
    val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        vm.setAutoOpen(granted)
    }

    fun scan() {
        scanLauncher.launch(
            ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt("")
                .setBeepEnabled(false)
                .setOrientationLocked(false),
        )
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader(index = "04", title = "설정") }
        item { SectionTitle("동기화") }
        item {
            Card {
                Column(modifier = Modifier.padding(start = 18.dp, end = 16.dp, top = 16.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val p = pairing
                    if (p != null) {
                        KeyValue("PC", p.pcName.ifBlank { "이름 없음" })
                        KeyValue("키", p.keyIdShort, mono = true)
                        KeyValue("릴레이", p.relayUrl)
                        KeyValue("최근", settings.lastSyncAt.takeIf { it.isNotBlank() }?.let { "${NugaTime.koreanDate(NugaTime.dateOf(it))} ${NugaTime.shortTime(it)}" } ?: "없음")
                        if (settings.lastSyncError.isNotBlank()) KeyValue("오류", settings.lastSyncError, warn = true)
                        KeyValue("대기", "${outbox}건")
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            NugaButton(onClick = vm::syncNow, enabled = !syncing) {
                                if (syncing) CircularProgressIndicator(modifier = Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp, color = NugaColors.Text3)
                                else Text("지금 동기화")
                            }
                            NugaButton(onClick = ::scan, tone = ButtonTone.Secondary) { Text("QR 다시 스캔") }
                        }
                        TextButton(onClick = vm::unpair, modifier = Modifier.offset(x = (-12).dp)) { Text("연결 해제", color = NugaColors.Warn, fontWeight = FontWeight(650)) }
                    } else {
                        KeyValue("상태", "연결 안 됨")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            NugaButton(onClick = ::scan) { Text("QR 스캔") }
                            NugaButton(onClick = vm::loadDemo, tone = ButtonTone.Secondary) { Text("샘플 설정 불러오기") }
                        }
                    }
                }
            }
        }

        item { SectionTitle("시간표") }
        item {
            Card {
                val cfg = config
                if (cfg == null || cfg.timetable.isEmpty()) {
                    Text("없음", modifier = Modifier.padding(16.dp), color = NugaColors.Text2)
                } else {
                    TimetableTable(cfg)
                }
            }
        }

        item { SectionTitle("옵션") }
        item {
            Card {
                val hasRoster = config?.roster?.isNotEmpty() == true
                ToggleRow(
                    title = "이름 표시",
                    sub = if (hasRoster) "명렬표 ${config?.roster?.size}명" else "명렬표 없음",
                    checked = settings.showNames && hasRoster,
                    enabled = hasRoster,
                    onChange = vm::setShowNames,
                )
                Divider()
                ToggleRow(
                    title = "수업 시작 알림",
                    sub = "카테고리 4버튼",
                    checked = settings.autoOpenNotify,
                    onChange = { on ->
                        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            vm.setAutoOpen(on)
                        }
                    },
                )
                Divider()
                ToggleRow(
                    title = "위젯 안내",
                    sub = if (settings.widgetHint) "홈 화면 길게 누르기 → 위젯 → 누가 4×2" else "",
                    checked = settings.widgetHint,
                    onChange = vm::setWidgetHint,
                )
            }
        }

        item {
            val cfg = config
            if (cfg?.school != null) {
                Text(
                    "${cfg.school!!.year}학년도 ${cfg.school!!.semester}학기 · ${cfg.school!!.grade}학년 ${cfg.school!!.subject}",
                    style = MaterialTheme.typography.bodySmall, color = NugaColors.Ink3,
                    modifier = Modifier.padding(start = 2.dp, top = 4.dp),
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun KeyValue(key: String, value: String, mono: Boolean = false, warn: Boolean = false) {
    Row {
        Text(key, modifier = Modifier.width(56.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = NugaColors.Text2)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium.tnum(),
            color = if (warn) NugaColors.Warn else NugaColors.Text,
            fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
        )
    }
}

@Composable
private fun ToggleRow(title: String, sub: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(start = 16.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = if (enabled) NugaColors.Text else NugaColors.Text2)
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = NugaColors.Text2)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = NugaColors.Accent,
                checkedBorderColor = NugaColors.Accent,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = NugaColors.Switch,
                uncheckedBorderColor = NugaColors.Switch,
            ),
        )
    }
}

/** Read-only weekday × period grid. */
@Composable
private fun TimetableTable(cfg: Config) {
    val periods = cfg.periods.sortedBy { it.no }
    val days = listOf("월", "화", "수", "목", "금")
    val cell = 44.dp
    Column(modifier = Modifier.horizontalScroll(rememberScrollState()).padding(12.dp)) {
        Row {
            Spacer(Modifier.width(28.dp))
            periods.forEach { p ->
                Column(modifier = Modifier.width(cell), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${p.no}", style = MaterialTheme.typography.labelMedium.tnum(), color = NugaColors.Text2, fontWeight = FontWeight.Bold)
                    Text(p.start, style = MaterialTheme.typography.labelSmall.tnum(), color = NugaColors.Text2, fontWeight = FontWeight.Medium)
                }
            }
        }
        days.forEachIndexed { index, day ->
            val weekday = index + 1
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                Text(day, modifier = Modifier.width(28.dp), style = MaterialTheme.typography.labelMedium, color = NugaColors.Text2, fontWeight = FontWeight(650))
                periods.forEach { p ->
                    val entry = cfg.timetable.firstOrNull { it.weekday == weekday && it.period == p.no }
                    Text(
                        text = entry?.classLabel ?: "·",
                        modifier = Modifier.width(cell),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (entry != null) NugaColors.Text else NugaColors.Text3,
                        fontWeight = if (entry != null) FontWeight(650) else FontWeight.Normal,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    }
}
