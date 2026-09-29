package kr.nuga.app.sync

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kr.nuga.app.data.ConfigRepository
import kr.nuga.app.data.Prefs
import kr.nuga.app.data.RecordRepository
import kr.nuga.app.data.SecureStore
import kr.nuga.app.data.db.NugaDatabase
import kr.nuga.app.data.db.OutboxKind
import kr.nuga.shared.model.EnvelopeFrom
import kr.nuga.shared.model.Message
import kr.nuga.shared.model.MessageType
import kr.nuga.shared.model.NugaJson
import kr.nuga.shared.model.Record
import kr.nuga.shared.model.Tombstone
import kr.nuga.shared.sync.Pairing
import kr.nuga.shared.sync.SyncCrypto
import kr.nuga.shared.time.NugaTime

/** Encrypts the outbox and talks to the relay; applies config/records/tombstones coming from the PC. */
class SyncRepository(
    private val context: Context,
    private val db: NugaDatabase,
    private val prefs: Prefs,
    private val secure: SecureStore,
    private val relay: RelayApi,
    private val configRepo: ConfigRepository,
    private val recordRepo: RecordRepository,
) {
    sealed interface Result {
        data object Unpaired : Result
        data class Ok(val sent: Int, val received: Int) : Result
        data class Error(val message: String) : Result
    }

    private val mutex = Mutex()
    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> get() = _syncing

    suspend fun syncNow(): Result = mutex.withLock {
        val pairing = secure.get() ?: return Result.Unpaired
        _syncing.value = true
        try {
            val deviceId = prefs.deviceId()
            val sent = push(pairing, deviceId)
            val received = pull(pairing)
            prefs.setLastSync(NugaTime.nowIso(), "")
            Result.Ok(sent, received)
        } catch (e: Exception) {
            Log.w(TAG, "sync failed", e)
            val msg = e.message ?: e.javaClass.simpleName
            prefs.setLastSync(prefs.current().lastSyncAt, msg)
            Result.Error(msg)
        } finally {
            _syncing.value = false
        }
    }

    /** Outbox → relay. Records and tombstones go as separate messages; acked rows are removed. */
    private suspend fun push(p: SecureStore.PairingInfo, deviceId: String): Int {
        val outbox = db.outboxDao()
        var sentTotal = 0
        while (true) {
            val batch = outbox.next(BATCH)
            if (batch.isEmpty()) break
            val records = LinkedHashMap<String, Record>()
            val tombstones = LinkedHashMap<String, Tombstone>()
            for (item in batch) {
                when (item.kind) {
                    OutboxKind.RECORD -> runCatching { NugaJson.decodeFromString(Record.serializer(), item.payloadJson) }
                        .getOrNull()?.let { records[it.id] = it }
                    OutboxKind.TOMBSTONE -> runCatching { NugaJson.decodeFromString(Tombstone.serializer(), item.payloadJson) }
                        .getOrNull()?.let { tombstones[it.id] = it }
                }
            }
            val now = NugaTime.nowIso()
            if (records.isNotEmpty()) {
                val msg = Message.records(deviceId, now, records.values.toList())
                relay.post(p.relayUrl, p.keyId, SyncCrypto.seal(p.key, EnvelopeFrom.PHONE, msg, now))
                for (r in records.values) recordRepo.markSynced(r.id, r.updatedAt)
            }
            if (tombstones.isNotEmpty()) {
                val msg = Message.tombstones(deviceId, now, tombstones.values.toList())
                relay.post(p.relayUrl, p.keyId, SyncCrypto.seal(p.key, EnvelopeFrom.PHONE, msg, now))
            }
            outbox.deleteSeqs(batch.map { it.seq })
            sentTotal += records.size + tombstones.size
            if (batch.size < BATCH) break
        }
        return sentTotal
    }

    /** relay → phone: config (forwarded to the watch by ConfigRepository), records, tombstones; then ack. */
    private suspend fun pull(p: SecureStore.PairingInfo): Int {
        var received = 0
        var cursor = prefs.current().relayCursor.ifEmpty { null }
        repeat(MAX_PAGES) {
            val items = relay.list(p.relayUrl, p.keyId, "phone", cursor)
            if (items.isEmpty()) return received
            for (item in items) {
                val message = runCatching { SyncCrypto.open(p.key, item.toEnvelope()) }
                    .onFailure { Log.w(TAG, "cannot open envelope ${item.id}: ${it.message}") }
                    .getOrNull()
                if (message != null) {
                    dispatch(message)
                    received++
                }
                // Ack (delete) even when undecryptable so a poisoned item cannot block the box forever.
                runCatching { relay.ack(p.relayUrl, p.keyId, item.id) }
                cursor = item.id
                prefs.setRelayCursor(item.id)
            }
            if (items.size < PAGE) return received
        }
        return received
    }

    private suspend fun dispatch(message: Message) {
        when (message.type) {
            MessageType.CONFIG -> runCatching { message.configPayload() }.getOrNull()?.let {
                configRepo.apply(it, ConfigRepository.Source.PC)
            }
            MessageType.RECORDS -> runCatching { message.recordsPayload() }.getOrNull()?.let { recordRepo.applyRemoteRecords(it) }
            MessageType.TOMBSTONES -> runCatching { message.tombstonesPayload() }.getOrNull()?.let { recordRepo.applyRemoteTombstones(it) }
            MessageType.PING -> Unit
            else -> Log.i(TAG, "unknown message type ${message.type}")
        }
    }

    /** Save the scanned key, announce ourselves, and pull the config right away. */
    suspend fun pair(pairing: Pairing): Result {
        secure.save(pairing, NugaTime.nowIso())
        prefs.clearSyncState()
        val deviceId = prefs.deviceId()
        runCatching {
            val now = NugaTime.nowIso()
            val ping = Message.ping(deviceId, now, android.os.Build.MODEL ?: "phone")
            relay.post(pairing.relayUrl, pairing.keyId, SyncCrypto.seal(pairing.key, EnvelopeFrom.PHONE, ping, now))
        }.onFailure { Log.w(TAG, "ping failed: ${it.message}") }
        SyncScheduler.ensurePeriodic(context)
        return syncNow()
    }

    /** Forget the key. Records stay on the phone; the relay box is emptied best-effort. */
    suspend fun unpair() {
        val p = secure.get()
        if (p != null) runCatching { relay.clear(p.relayUrl, p.keyId) }
        secure.clear()
        prefs.clearSyncState()
        if (configRepo.currentSource() == ConfigRepository.Source.PC) configRepo.clear()
    }

    private companion object {
        const val TAG = "SyncRepository"
        const val BATCH = 100
        const val PAGE = 200
        const val MAX_PAGES = 10
    }
}
