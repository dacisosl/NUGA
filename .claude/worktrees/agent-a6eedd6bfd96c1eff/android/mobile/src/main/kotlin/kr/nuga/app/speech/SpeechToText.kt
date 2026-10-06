package kr.nuga.app.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

/** Thin wrapper over Android's on-device/online SpeechRecognizer. Only the transcript is kept. */
class SpeechToText(private val context: Context) {
    private var recognizer: SpeechRecognizer? = null
    private val _listening = MutableStateFlow(false)
    val listening: StateFlow<Boolean> get() = _listening

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start(onResult: (String) -> Unit, onPartial: (String) -> Unit = {}, onError: (String) -> Unit = {}) {
        if (!isAvailable()) {
            onError("음성 인식 불가")
            return
        }
        stop()
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { _listening.value = true }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { _listening.value = false }
            override fun onError(error: Int) {
                _listening.value = false
                onError(
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "인식 안 됨"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "마이크 권한 필요"
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "네트워크 오류"
                        else -> "음성 오류 $error"
                    },
                )
            }
            override fun onResults(results: Bundle?) {
                _listening.value = false
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                onResult(text)
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) onPartial(text)
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.KOREAN.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        r.startListening(intent)
    }

    fun stop() {
        recognizer?.let {
            runCatching { it.stopListening() }
            runCatching { it.destroy() }
        }
        recognizer = null
        _listening.value = false
    }
}
