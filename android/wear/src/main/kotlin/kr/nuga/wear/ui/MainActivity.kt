package kr.nuga.wear.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import kotlinx.coroutines.launch

object Routes {
    const val CATEGORY = "category"
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

    SwipeDismissableNavHost(navController = nav, startDestination = Routes.CATEGORY) {
        composable(Routes.CATEGORY) {
            CategoryScreen(
                config = config,
                lesson = lesson,
                todayCount = todayCount,
                queueSize = queueSize,
                onCategory = { key ->
                    vm.selectCategory(key)
                    nav.navigate(Routes.reel(vm.activeClass()))
                },
                onSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.REEL) { entry ->
            val classLabel = entry.arguments?.getString("classLabel")?.let { android.net.Uri.decode(it) } ?: vm.activeClass()
            val category by vm.category.collectAsStateWithLifecycle()
            ReelScreen(
                classLabel = classLabel,
                size = vm.classSize(classLabel),
                category = category,
                categoryLabel = vm.categoryLabel(category),
                startProvider = { vm.reelStart(classLabel) },
                onSave = { no ->
                    vm.startDraft(classLabel, no)
                    nav.navigate(Routes.DONE) {
                        popUpTo(Routes.CATEGORY) { inclusive = false }
                    }
                },
            )
        }
        composable(Routes.DONE) {
            val d = draft
            DoneScreen(
                record = d,
                categoryLabel = d?.let { vm.categoryLabel(it.category) } ?: "",
                onTranscript = vm::setDraftTranscript,
                onCancel = {
                    vm.cancelDraft()
                    nav.popBackStack(Routes.CATEGORY, inclusive = false)
                },
                onFinished = {
                    vm.commitDraft()
                    nav.popBackStack(Routes.CATEGORY, inclusive = false)
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
