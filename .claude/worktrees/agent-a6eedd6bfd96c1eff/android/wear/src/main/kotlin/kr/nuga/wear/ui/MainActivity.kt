package kr.nuga.wear.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import kotlinx.coroutines.launch

object Routes {
    const val HOME = "home"
    const val REEL = "reel/{classLabel}"
    const val DONE = "done"
    const val SETTINGS = "settings"
    fun reel(classLabel: String) = "reel/${android.net.Uri.encode(classLabel)}"
}

class MainActivity : ComponentActivity() {
    private val vm: WatchViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WatchTheme { WatchNav(vm) }
        }
        if (savedInstanceState == null) handleRecordIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleRecordIntent(intent)
    }

    /** The lesson notification's [기록] action opens straight onto the number reel. */
    private fun handleRecordIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_RECORD, false) != true) return
        intent.removeExtra(EXTRA_RECORD)
        vm.requestReel()
    }

    companion object {
        const val EXTRA_RECORD = "record"
    }

    override fun onResume() {
        super.onResume()
        vm.retryQueue()
    }

    override fun onStop() {
        super.onStop()
        // Leaving mid-countdown still keeps the record.
        vm.commitDraft()
    }
}

@Composable
fun WatchNav(vm: WatchViewModel) {
    val nav = rememberSwipeDismissableNavController()
    val scope = rememberCoroutineScope()
    val lesson by vm.lesson.collectAsStateWithLifecycle()
    val todayCount by vm.todayCount.collectAsStateWithLifecycle()
    val queueSize by vm.queueSize.collectAsStateWithLifecycle()
    val connected by vm.phoneConnected.collectAsStateWithLifecycle()
    val autoLaunch by vm.autoLaunch.collectAsStateWithLifecycle()
    val config by vm.config.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val reelRequest by vm.reelRequest.collectAsStateWithLifecycle()

    // From the lesson notification's [기록]: straight to the reel for the current (or next) lesson's class.
    LaunchedEffect(reelRequest) {
        if (!reelRequest) return@LaunchedEffect
        vm.consumeReelRequest()
        vm.awaitConfig()
        nav.navigate(Routes.reel(vm.activeClass())) {
            popUpTo(Routes.HOME) { inclusive = false }
            launchSingleTop = true
        }
    }

    SwipeDismissableNavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                config = config,
                lesson = lesson,
                todayCount = todayCount,
                queueSize = queueSize,
                onRecord = { nav.navigate(Routes.reel(vm.activeClass())) },
                onSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.REEL) { entry ->
            val classLabel = entry.arguments?.getString("classLabel")?.let { android.net.Uri.decode(it) } ?: vm.activeClass()
            ReelScreen(
                classLabel = classLabel,
                size = vm.classSize(classLabel),
                startProvider = { vm.reelStart(classLabel) },
                onSave = { no ->
                    vm.startDraft(classLabel, no)
                    nav.navigate(Routes.DONE) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                },
            )
        }
        composable(Routes.DONE) {
            DoneScreen(
                record = draft,
                onTranscript = vm::setDraftTranscript,
                onCancel = {
                    vm.cancelDraft()
                    nav.popBackStack(Routes.HOME, inclusive = false)
                },
                onFinished = {
                    vm.commitDraft()
                    nav.popBackStack(Routes.HOME, inclusive = false)
                },
            )
            DisposableEffect(Unit) {
                onDispose { scope.launch { vm.commitDraft() } }
            }
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                autoLaunch = autoLaunch,
                connected = connected,
                queueSize = queueSize,
                hasConfig = config != null,
                onAutoLaunch = vm::setAutoLaunch,
                onRetry = vm::retryQueue,
            )
        }
    }
}
