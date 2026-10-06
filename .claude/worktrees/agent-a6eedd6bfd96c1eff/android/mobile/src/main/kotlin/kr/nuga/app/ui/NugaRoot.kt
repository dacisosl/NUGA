package kr.nuga.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kr.nuga.app.ui.home.HomeScreen
import kr.nuga.app.ui.records.RecordsScreen
import kr.nuga.app.ui.recordings.RecordingsScreen
import kr.nuga.app.ui.settings.SettingsScreen
import kr.nuga.app.ui.sheet.NumberSheet
import kr.nuga.app.ui.theme.NugaColors
import kr.nuga.app.ui.theme.nightScene
import kr.nuga.shared.model.Config

private enum class Tab(val label: String, val icon: ImageVector) {
    Home("홈", Icons.Filled.Home),
    Records("기록", Icons.Filled.List),
    Recordings("녹음", Icons.Filled.Mic),
    Settings("설정", Icons.Filled.Settings),
}

@Composable
fun NugaRoot(vm: MainViewModel) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    val config by vm.config.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val sheet by vm.sheet.collectAsStateWithLifecycle()
    val tabRequest by vm.tabRequest.collectAsStateWithLifecycle()
    LaunchedEffect(tabRequest) {
        if (tabRequest == "recordings") tab = Tab.Recordings.ordinal
        if (tabRequest != null) vm.consumeTabRequest()
    }

    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            when (event) {
                is UiEvent.Saved -> scope.launch {
                    val timer = launch {
                        delay(5_000)
                        snackbar.currentSnackbarData?.dismiss()
                    }
                    val result = snackbar.showSnackbar(
                        message = "저장 · ${event.text}",
                        actionLabel = "취소",
                        withDismissAction = false,
                        duration = SnackbarDuration.Indefinite,
                    )
                    timer.cancel()
                    if (result == SnackbarResult.ActionPerformed) vm.undo(event.id)
                }
                is UiEvent.Toast -> scope.launch {
                    snackbar.currentSnackbarData?.dismiss()
                    snackbar.showSnackbar(event.text, duration = SnackbarDuration.Short)
                }
            }
        }
    }

    // 밤 장면은 한 번만, 창 전체(상태 표시줄·내비게이션 바 뒤까지)에 깐다
    Box(Modifier.fillMaxSize().nightScene()) {
        Scaffold(
            containerColor = Color.Transparent,
            contentColor = NugaColors.Ink,
            snackbarHost = { SnackbarHost(snackbar) { NightSnackbar(it) } },
            bottomBar = { TabBar(selected = tab, onSelect = { tab = it }) },
        ) { padding ->
            val modifier = Modifier.padding(padding)
            when (Tab.entries[tab]) {
                Tab.Home -> HomeScreen(vm = vm, modifier = modifier)
                Tab.Records -> RecordsScreen(vm = vm, modifier = modifier)
                Tab.Recordings -> RecordingsScreen(vm = vm, modifier = modifier)
                Tab.Settings -> SettingsScreen(vm = vm, modifier = modifier)
            }
        }
    }

    val pendingPair by vm.pendingPair.collectAsStateWithLifecycle()
    pendingPair?.let { p ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { vm.confirmPair(false) },
            title = { Text("이 PC와 연결할까요?") },
            text = { Text("PC 이름: ${p.pcName.ifBlank { "(없음)" }}\n릴레이: ${p.relayUrl}\n\n본인 PC의 연결 링크가 맞는지 확인하세요. 연결하면 기록이 이 PC로 전송됩니다.") },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { vm.confirmPair(true) }) { Text("연결") } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { vm.confirmPair(false) }) { Text("취소") } },
        )
    }

    sheet?.let { s ->
        NumberSheet(
            state = s,
            config = config ?: Config.EMPTY,
            showNames = settings.showNames,
            onCategory = vm::setSheetCategory,
            onClass = vm::setSheetClass,
            onNo = vm::setSheetNo,
            onMemo = vm::setSheetMemo,
            onAppendMemo = vm::appendSheetMemo,
            onSave = vm::saveSheet,
            onDismiss = vm::closeSheet,
        )
    }
}

/**
 * 하단 탭: 짙은 밤 유리 띠. 위 테두리는 오른쪽이 밝은 빛줄기,
 * 켜진 탭만 유리 알약 + 위쪽 하늘빛 광선 하나 (웹 사이드바 .nav.active와 같은 표현).
 */
@Composable
private fun TabBar(selected: Int, onSelect: (Int) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .drawWithCache {
                val bg = Brush.verticalGradient(listOf(NugaColors.Navy2.copy(alpha = .88f), NugaColors.Navy0))
                val rim = Brush.horizontalGradient(
                    0f to Color.Transparent,
                    .15f to NugaColors.DLine2,
                    .8f to Color(0x66EAF2FF),
                    1f to Color.Transparent,
                )
                onDrawBehind {
                    drawRect(bg)
                    drawRect(rim, size = Size(size.width, 1.dp.toPx()))
                }
            }
            .navigationBarsPadding(),
    ) {
        Row(Modifier.fillMaxWidth().height(66.dp)) {
            Tab.entries.forEachIndexed { index, t ->
                TabItem(t, selected = selected == index, onClick = { onSelect(index) }, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TabItem(t: Tab, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .drawBehind {
                if (!selected) return@drawBehind
                // 위쪽 광선: 28dp × 2dp 하늘빛 + 아래로 번지는 빛
                val w = 28.dp.toPx()
                val x = (size.width - w) / 2f
                drawRect(
                    Brush.radialGradient(
                        0f to NugaColors.Sky.copy(alpha = .30f), 1f to Color.Transparent,
                        center = Offset(size.width / 2f, 0f), radius = 30.dp.toPx(),
                    ),
                )
                drawRect(NugaColors.Sky, topLeft = Offset(x, 0f), size = Size(w, 2.dp.toPx()))
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val shape = RoundedCornerShape(7.dp)
        Box(
            modifier = Modifier
                .size(width = 52.dp, height = 30.dp)
                .clip(shape)
                .then(
                    if (selected) Modifier
                        .background(Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .17f), NugaColors.Sky.copy(alpha = .06f))))
                        .border(1.dp, NugaColors.Sky.copy(alpha = .20f), shape)
                    else Modifier,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(t.icon, contentDescription = null, tint = if (selected) NugaColors.Sky else NugaColors.Ink3, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            t.label,
            color = if (selected) NugaColors.Ink else NugaColors.Ink3,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            letterSpacing = (-0.01).em,
        )
    }
}

/** 알림 띠: 불투명한 밤 타일 (blur 없음), 왼쪽 하늘빛 2dp 막대, 행동 글자는 하늘빛 */
@Composable
private fun NightSnackbar(data: SnackbarData) {
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier = Modifier
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(NugaColors.Navy3, NugaColors.Navy2)))
            .border(1.dp, NugaColors.DLine2, shape)
            .drawBehind {
                drawRect(Color(0x1AEAF2FF), size = Size(size.width, 1.dp.toPx()))
                drawRect(NugaColors.Sky, topLeft = Offset(0f, 12.dp.toPx()), size = Size(2.dp.toPx(), size.height - 24.dp.toPx()))
            }
            .padding(start = 16.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            data.visuals.message,
            color = NugaColors.Ink,
            fontSize = 14.sp,
            letterSpacing = (-0.01).em,
            maxLines = 2,
            modifier = Modifier.weight(1f).padding(vertical = 12.dp),
        )
        data.visuals.actionLabel?.let { label ->
            TextButton(onClick = { data.performAction() }) {
                Text(label, color = NugaColors.Sky, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}
