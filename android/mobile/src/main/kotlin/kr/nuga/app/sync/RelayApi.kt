package kr.nuga.app.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.nuga.shared.model.Envelope
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.RelayError
import kr.nuga.shared.model.RelayItem
import kr.nuga.shared.model.RelayListResponse
import kr.nuga.shared.model.RelayPostResponse
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class RelayException(val code: Int, message: String) : IOException("HTTP $code: $message")

/** Relay HTTP API (PROTOCOL.md §4). The relay only ever sees keyId + ciphertext. */
class RelayApi(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun post(relayUrl: String, keyId: String, envelope: Envelope): RelayPostResponse = withContext(Dispatchers.IO) {
        val body = NugaJson.encodeToString(Envelope.serializer(), envelope).toRequestBody(json)
        val req = Request.Builder().url("${base(relayUrl)}/box/$keyId").post(body).build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw RelayException(res.code, errorOf(text))
            NugaJson.decodeFromString(RelayPostResponse.serializer(), text)
        }
    }

    suspend fun list(relayUrl: String, keyId: String, forWho: String, after: String?): List<RelayItem> = withContext(Dispatchers.IO) {
        val url = StringBuilder("${base(relayUrl)}/box/$keyId?for=$forWho")
        if (!after.isNullOrEmpty()) url.append("&after=").append(java.net.URLEncoder.encode(after, "UTF-8"))
        val req = Request.Builder().url(url.toString()).get().build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw RelayException(res.code, errorOf(text))
            NugaJson.decodeFromString(RelayListResponse.serializer(), text).items
        }
    }

    suspend fun ack(relayUrl: String, keyId: String, id: String) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${base(relayUrl)}/box/$keyId/$id").delete().build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful && res.code != 404) throw RelayException(res.code, errorOf(res.body?.string().orEmpty()))
        }
    }

    suspend fun clear(relayUrl: String, keyId: String) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${base(relayUrl)}/box/$keyId").delete().build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful && res.code != 404) throw RelayException(res.code, errorOf(res.body?.string().orEmpty()))
        }
    }

    suspend fun health(relayUrl: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("${base(relayUrl)}/health").get().build()
            client.newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    private fun base(relayUrl: String): String = relayUrl.trim().trimEnd('/')

    private fun errorOf(text: String): String =
        runCatching { NugaJson.decodeFromString(RelayError.serializer(), text).error }.getOrNull()?.takeIf { it.isNotBlank() }
            ?: text.take(120)
}
