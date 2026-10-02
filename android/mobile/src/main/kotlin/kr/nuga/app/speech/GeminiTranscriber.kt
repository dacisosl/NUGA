package kr.nuga.app.speech

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.transcript.TranscriptParser
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class SpeechException(message: String, val retryable: Boolean) : IOException(message)

/**
 * Gemini 로 수업 녹음 한 개를 통째로 받아쓰기 + 화자 구분 (v3 7.5).
 * 1) Files API 로 음성 업로드 (resumable) → 2) 처리 완료(ACTIVE)까지 대기 → 3) generateContent(JSON 스키마) → 4) 업로드 파일 삭제.
 * 보내는 것은 음성과 지시문뿐이다. 반·번호·이름·날짜는 보내지 않는다.
 */
class GeminiTranscriber(
    private val apiKey: String,
    private val model: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .writeTimeout(10, TimeUnit.MINUTES)
        .build(),
) {
    private val base = "https://generativelanguage.googleapis.com"
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /** 응답 원문(JSON 문자열). 해석은 [TranscriptParser.parse] */
    suspend fun transcribe(audio: File, mime: String = "audio/aac"): String = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) throw SpeechException("Gemini 키가 없음 (PC 설정 → 녹음 → 폰으로 키 보내기)", retryable = false)
        val fileName = upload(audio, mime)
        try {
            val uri = waitActive(fileName)
            generate(uri, mime)
        } finally {
            runCatching { deleteFile(fileName) }.onFailure { Log.w(TAG, "delete uploaded file failed: ${it.message}") }
        }
    }

    private fun upload(audio: File, mime: String): String {
        val startBody = buildJsonObject { putJsonObject("file") { put("display_name", "lesson-audio") } }.toString().toRequestBody(jsonType)
        val start = Request.Builder().url("$base/upload/v1beta/files")
            .header("x-goog-api-key", apiKey)
            .header("X-Goog-Upload-Protocol", "resumable")
            .header("X-Goog-Upload-Command", "start")
            .header("X-Goog-Upload-Header-Content-Length", audio.length().toString())
            .header("X-Goog-Upload-Header-Content-Type", mime)
            .post(startBody).build()
        val uploadUrl = client.newCall(start).execute().use { res ->
            check(res, res.body?.string().orEmpty())
            res.header("X-Goog-Upload-URL") ?: res.header("x-goog-upload-url") ?: throw SpeechException("업로드 주소를 받지 못함", true)
        }
        val put = Request.Builder().url(uploadUrl)
            .header("X-Goog-Upload-Offset", "0")
            .header("X-Goog-Upload-Command", "upload, finalize")
            .post(audio.asRequestBody(mime.toMediaType())).build()
        return client.newCall(put).execute().use { res ->
            val text = res.body?.string().orEmpty()
            check(res, text)
            val file = NugaJson.parseToJsonElement(text).jsonObject["file"]?.jsonObject ?: throw SpeechException("업로드 응답 형식 오류", true)
            (file["name"] as? JsonPrimitive)?.contentOrNull ?: throw SpeechException("업로드 파일 이름 없음", true)
        }
    }

    private suspend fun waitActive(name: String): String {
        repeat(60) {
            val req = Request.Builder().url("$base/v1beta/$name").header("x-goog-api-key", apiKey).get().build()
            val obj = client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty(); check(res, text)
                NugaJson.parseToJsonElement(text).jsonObject
            }
            when ((obj["state"] as? JsonPrimitive)?.contentOrNull) {
                "ACTIVE" -> return (obj["uri"] as? JsonPrimitive)?.contentOrNull ?: throw SpeechException("파일 주소 없음", true)
                "FAILED" -> throw SpeechException("Gemini 가 음성 파일을 처리하지 못함", false)
            }
            delay(5_000)
        }
        throw SpeechException("음성 파일 처리가 오래 걸림", true)
    }

    private fun generate(fileUri: String, mime: String): String {
        val body = buildJsonObject {
            putJsonArray("contents") {
                add(buildJsonObject {
                    put("role", "user")
                    putJsonArray("parts") {
                        add(buildJsonObject { putJsonObject("file_data") { put("mime_type", mime); put("file_uri", fileUri) } })
                        add(buildJsonObject { put("text", TranscriptParser.PROMPT) })
                    }
                })
            }
            putJsonObject("generationConfig") {
                put("responseMimeType", "application/json")
                put("responseSchema", NugaJson.parseToJsonElement(TranscriptParser.GEMINI_SCHEMA_JSON))
                put("maxOutputTokens", 65536)
                put("temperature", 0.0)
            }
        }.toString().toRequestBody(jsonType)
        val req = Request.Builder().url("$base/v1beta/models/$model:generateContent").header("x-goog-api-key", apiKey).post(body).build()
        return client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty(); check(res, text)
            val root = NugaJson.parseToJsonElement(text).jsonObject
            val block = root["promptFeedback"]?.jsonObject?.get("blockReason")
            if (block != null) throw SpeechException("요청이 차단됨", false)
            val cand = root["candidates"]?.jsonArray?.firstOrNull()?.jsonObject ?: throw SpeechException("응답이 비어 있음", true)
            val parts = cand["content"]?.jsonObject?.get("parts")?.jsonArray ?: throw SpeechException("응답이 비어 있음 (${(cand["finishReason"] as? JsonPrimitive)?.contentOrNull})", true)
            parts.mapNotNull { p -> (p as? JsonObject)?.takeIf { (it["thought"] as? JsonPrimitive)?.contentOrNull != "true" }?.get("text")?.let { (it as? JsonPrimitive)?.contentOrNull } }.joinToString("")
                .ifBlank { throw SpeechException("받아쓴 내용이 없음", false) }
        }
    }

    private fun deleteFile(name: String) {
        val req = Request.Builder().url("$base/v1beta/$name").header("x-goog-api-key", apiKey).delete().build()
        client.newCall(req).execute().close()
    }

    private fun check(res: okhttp3.Response, body: String) {
        if (res.isSuccessful) return
        val msg = runCatching { NugaJson.parseToJsonElement(body).jsonObject["error"]?.jsonObject?.get("message")?.let { (it as JsonPrimitive).contentOrNull } }.getOrNull()
        when (res.code) {
            400 -> throw SpeechException("Gemini 요청 오류: ${msg ?: "형식"}", false)
            401, 403 -> throw SpeechException("Gemini 키가 올바르지 않거나 권한 없음", false)
            429 -> throw SpeechException("Gemini 요청 한도 초과", true)
            else -> throw SpeechException("Gemini 오류 ${res.code}${msg?.let { ": $it" } ?: ""}", res.code >= 500)
        }
    }

    private companion object { const val TAG = "GeminiTranscriber" }
}
