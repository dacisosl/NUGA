package kr.nuga.app.record

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.ContextCompat
import kr.nuga.app.ui.MainActivity

/**
 * 보이지 않는 1탭 시작 화면. 알림의 [녹음 시작]·위젯 버튼이 이 화면을 거쳐 서비스를 켠다.
 * Android 14 이상은 앱이 화면에 있을 때만 마이크 서비스를 시작할 수 있어서, 잠깐 활동을 띄웠다가 바로 닫는다.
 */
class RecordStartActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val action = intent.getStringExtra(EXTRA_ACTION) ?: RecordingService.ACTION_START
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            // 권한이 없으면 앱의 녹음 탭을 열어 권한을 받는다
            startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, "recordings").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            Toast.makeText(this, "마이크 권한을 허용한 뒤 다시 눌러 주세요", Toast.LENGTH_LONG).show()
        } else {
            RecordingService.start(
                this, action,
                classLabel = intent.getStringExtra(RecordingService.EXTRA_CLASS),
                period = intent.getIntExtra(RecordingService.EXTRA_PERIOD, -1),
                endMs = intent.getLongExtra(RecordingService.EXTRA_END_MS, 0L),
            )
            Toast.makeText(this, if (action == RecordingService.ACTION_STANDBY_ON) "오늘 녹음 대기를 켰습니다" else "녹음을 시작합니다", Toast.LENGTH_SHORT).show()
        }
        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        const val EXTRA_ACTION = "action"

        fun intent(context: Context, action: String = RecordingService.ACTION_START, classLabel: String? = null, period: Int = -1, endMs: Long = 0L): Intent =
            Intent(context, RecordStartActivity::class.java)
                .putExtra(EXTRA_ACTION, action)
                .putExtra(RecordingService.EXTRA_PERIOD, period)
                .putExtra(RecordingService.EXTRA_END_MS, endMs)
                .apply { classLabel?.let { putExtra(RecordingService.EXTRA_CLASS, it) } }
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
    }
}
