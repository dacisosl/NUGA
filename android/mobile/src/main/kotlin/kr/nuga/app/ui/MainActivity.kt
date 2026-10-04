package kr.nuga.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import kr.nuga.app.ui.theme.NugaTheme
import kr.nuga.shared.model.RecordSource

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 틀이 늘 밤(남색)이라 시스템 막대는 투명 + 밝은 아이콘. 시스템 다크 모드와 상관없이 고정
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        setContent {
            NugaTheme {
                NugaRoot(vm)
            }
        }
        handleDeepLink(intent)
    }

    companion object {
        /** 알림에서 특정 탭으로 열기: "recordings" */
        const val EXTRA_TAB = "tab"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /** nuga://record?category=N&class=2-3&src=widget|notify */
    private fun handleDeepLink(intent: Intent?) {
        intent?.getStringExtra(EXTRA_TAB)?.let { vm.requestTab(it); intent.removeExtra(EXTRA_TAB) }
        val data = intent?.data ?: return
        if (data.scheme == "nuga" && data.host == "pair") { vm.requestPair(data.toString()); intent.data = null; return }
        if (data.scheme != "nuga" || data.host != "record") return
        val category = data.getQueryParameter("category")?.toIntOrNull()
        val classLabel = data.getQueryParameter("class")?.takeIf { it.isNotBlank() }
        val source = when (data.getQueryParameter("src")) {
            "widget" -> RecordSource.WIDGET
            else -> RecordSource.PHONE
        }
        vm.openSheet(category = category, classLabel = classLabel, source = source)
        intent.data = null
    }
}
