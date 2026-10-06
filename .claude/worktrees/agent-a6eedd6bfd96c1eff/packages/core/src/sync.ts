import type { ConfigMessage, Envelope, NugaRecord, RelayItem, Settings, Student, SyncMessage, Tombstone } from "./types";
import { decryptEnvelope, encryptEnvelope, fromB64 } from "./crypto";
import { nowIso } from "./ids";

export interface MergeResult { records: NugaRecord[]; added: NugaRecord[]; updated: NugaRecord[] }

/** 같은 id 는 updatedAt 이 늦은 쪽 우선. */
export function mergeRecords(local: NugaRecord[], incoming: NugaRecord[]): MergeResult {
  const map = new Map(local.map((r) => [r.id, r]));
  const added: NugaRecord[] = []; const updated: NugaRecord[] = [];
  for (const r of incoming) {
    const cur = map.get(r.id);
    if (!cur) { map.set(r.id, r); added.push(r); }
    else if ((r.updatedAt || "") > (cur.updatedAt || "")) { map.set(r.id, { ...cur, ...r }); updated.push(r); }
  }
  return { records: [...map.values()], added, updated };
}

export function applyTombstones(local: NugaRecord[], tombs: Tombstone[]): { records: NugaRecord[]; removed: string[] } {
  const ids = new Set(tombs.map((t) => t.id));
  const removed = local.filter((r) => ids.has(r.id)).map((r) => r.id);
  return { records: local.filter((r) => !ids.has(r.id)), removed };
}

export function buildConfigMessage(settings: Settings, students: Student[]): ConfigMessage {
  return {
    school: settings.school,
    categories: settings.categories,
    classes: settings.classes,
    periods: settings.periods,
    timetable: settings.timetable,
    progress: settings.progress,
    roster: settings.options.showPhoneNames && settings.sync?.shareRoster ? students.map((s) => ({ class: s.class, no: s.no, name: s.name })) : null,
    options: { autoLaunchWatch: settings.options.autoLaunchWatch, reelStart: settings.options.reelStart },
    recording: settings.recording?.enabled && settings.recording.approvedChecklist
      ? { enabled: true, approvedChecklist: true, mode: settings.recording.mode, audioTTLHours: settings.recording.audioTTLHours, speech: settings.recording.speech, wifiOnly: settings.recording.wifiOnly }
      : null,
    updatedAt: nowIso(),
  };
}

export class RelayClient {
  constructor(public baseUrl: string, public keyId: string, private key: Uint8Array, private fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  static fromSettings(sync: NonNullable<Settings["sync"]>): RelayClient {
    return new RelayClient(sync.relayUrl, sync.keyId, fromB64(sync.keyB64));
  }

  private url(path: string): string { return this.baseUrl.replace(/\/+$/, "") + path; }

  async health(): Promise<boolean> {
    try { const r = await this.fetchImpl(this.url("/health")); return r.ok; } catch { return false; }
  }

  async send(message: SyncMessage, from: Envelope["from"] = "pc"): Promise<string> {
    const env = await encryptEnvelope(this.key, this.keyId, message, from, nowIso());
    const r = await this.fetchImpl(this.url(`/box/${this.keyId}`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env) });
    if (!r.ok) throw new Error(`릴레이 전송 실패 ${r.status}`);
    const j = (await r.json()) as { id: string };
    return j.id;
  }

  async pull(forWho: "pc" | "phone", after?: string, waitSec?: number): Promise<{ item: RelayItem; message: SyncMessage | null }[]> {
    const q = new URLSearchParams({ for: forWho });
    if (after) q.set("after", after);
    if (waitSec) q.set("wait", String(waitSec));
    const r = await this.fetchImpl(this.url(`/box/${this.keyId}?${q}`));
    if (!r.ok) throw new Error(`릴레이 조회 실패 ${r.status}`);
    const j = (await r.json()) as { items: RelayItem[] };
    const out: { item: RelayItem; message: SyncMessage | null }[] = [];
    for (const item of j.items || []) {
      try { out.push({ item, message: await decryptEnvelope(this.key, this.keyId, item) }); }
      catch { out.push({ item, message: null }); }
    }
    return out;
  }

  async ack(id: string): Promise<void> {
    await this.fetchImpl(this.url(`/box/${this.keyId}/${id}`), { method: "DELETE" });
  }

  async clear(): Promise<void> {
    await this.fetchImpl(this.url(`/box/${this.keyId}`), { method: "DELETE" });
  }
}
