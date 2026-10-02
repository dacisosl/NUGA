package kr.nuga.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kr.nuga.app.ui.home.HomeScreen
import kr.nuga.app.ui.records.RecordsScreen
import kr.nuga.app.ui.recordings.RecordingsScreen
import kr.nuga.app.ui.settings.SettingsScreen
import kr.nuga.app.ui.sheet.NumberSheet
import kr.nuga.app.ui.theme.NugaColors
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

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar(containerColor = NugaColors.Surface, tonalElevation = 0.dp) {
                Tab.entries.forEachIndexed { index, t ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { Icon(t.icon, contentDescription = t.label) },
                        label = { Text(t.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = NugaColors.Accent,
                            selectedTextColor = NugaColors.Accent,
                            indicatorColor = NugaColors.AccentSoft,
                            unselectedIconColor = NugaColors.Text2,
                            unselectedTextColor = NugaColors.Text2,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
        when (Tab.entries[tab]) {
            Tab.Home -> HomeScreen(vm = vm, modifier = modifier)
            Tab.Records -> RecordsScreen(vm = vm, modifier = modifier)
            Tab.Recordings -> RecordingsScreen(vm = vm, modifier = modifier)
            Tab.Settings -> SettingsScreen(vm = vm, modifier = modifier)
        }
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
