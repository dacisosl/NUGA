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

/** 동기화 엔진이 쓰는 중계 모양: 누가 릴레이(RelayClient) 또는 공개 중계 ntfy.sh(NtfyClient) */
export interface SyncTransport {
  readonly baseUrl: string;
  readonly keyId: string;
  health(): Promise<boolean>;
  send(message: SyncMessage, from?: Envelope["from"]): Promise<string>;
  pull(forWho: "pc" | "phone", after?: string): Promise<{ item: RelayItem; message: SyncMessage | null }[]>;
  ack(id: string): Promise<void>;
  clear(): Promise<void>;
}

/* ---------------- 공개 중계 ntfy.sh ----------------
 * 로그인(아이디·비밀번호)으로 연결할 때 쓴다. 계정·서버 없이 https 로 어디서나 닿는다.
 * - 통로(topic): PC 가 받는 것 `nuga-<keyId>-pc`, 폰이 받는 것 `nuga-<keyId>-ph`.
 * - 본문 = 지금 봉투(암호문) JSON 그대로. ntfy 메시지 한도(4KB)를 넘으면 조각으로 나눠 보내고 받는 쪽이 합친다.
 * - 서버에서 지울 수 없으므로 ack 는 하지 않고, 받는 쪽이 이어 받을 위치(시각 + 그 초에 받은 id)를 기억한다. 같은 기록이 다시 와도 id 로 합쳐져 괜찮다.
 * - ntfy.sh 공개 서버: 보관 12시간, 하루 메시지 250건(IP당), 메시지 4KB.
 */
export const NTFY_BASE = "https://ntfy.sh";
/** 조각 하나의 본문 글자 수 (조각 머리를 붙여도 4KB 를 넘지 않게) */
export const NTFY_CHUNK = 3500;

export function ntfyTopic(keyId: string, forWho: "pc" | "phone"): string { return `nuga-${keyId}-${forWho === "pc" ? "pc" : "ph"}`; }

interface NtfyChunk { nuga: "c1"; m: string; i: number; n: number; d: string }
/** 봉투 글을 ntfy 메시지 본문들로 (짧으면 그대로 하나) */
export function chunkForNtfy(text: string, mid: string, size = NTFY_CHUNK): string[] {
  if (text.length <= size) return [text];
  const n = Math.ceil(text.length / size);
  return Array.from({ length: n }, (_, i) => JSON.stringify({ nuga: "c1", m: mid, i, n, d: text.slice(i * size, (i + 1) * size) } satisfies NtfyChunk));
}

export interface NtfyLine { id: string; time?: number; event: string; topic?: string; message?: string }
/** ntfy 의 줄 단위 JSON 응답 → 메시지 줄 (open·keepalive 는 뺀다) */
export function parseNtfyLines(body: string): NtfyLine[] {
  const out: NtfyLine[] = [];
  for (const line of body.split("\n")) {
    const t = line.trim(); if (!t) continue;
    try { const j = JSON.parse(t) as NtfyLine; if (j && j.event === "message" && typeof j.id === "string") out.push(j); } catch { /* 깨진 줄은 건너뛴다 */ }
  }
  return out;
}

/** 조각 묶음을 기다리는 시간(초): 이보다 오래 덜 온 묶음은 잃어버린 것으로 보고 건너뛴다 */
export const NTFY_CHUNK_WAIT = 45;

export interface NtfyUnit { id: string; time: number; text: string }
/**
 * 메시지 줄을 완성된 봉투 글로 합친다 (보낸 순서대로).
 * - 조각 묶음이 아직 덜 왔으면(머리 조각은 있고 시간이 얼마 안 지남) 그 묶음의 첫 조각 앞에서 멈춘다: 다음에 이어서 다시 받는다.
 * - 머리(0번) 조각이 없는 묶음은 이미 받은 묶음의 꼬리이거나 잃어버린 것: 막지 않고 건너뛴다.
 *   (ntfy 는 since=<id> 로 물어도 같은 초에 온 앞 조각을 다시 보낸다)
 * - 머리 조각이 NTFY_CHUNK_WAIT 초보다 오래됐는데 덜 왔으면 건너뛴다 (영원히 막히지 않게).
 * @returns units 완성된 글, upto 처리한 마지막 줄의 위치(-1 = 없음)
 */
export function assembleNtfy(lines: NtfyLine[], nowSec = Math.max(Math.floor(Date.now() / 1000), ...lines.map((l) => l.time || 0))): { units: NtfyUnit[]; upto: number } {
  const groups = new Map<string, { first: number; n: number; parts: Map<number, string>; lastPos: number; lastId: string; time: number; headTime: number }>();
  const units: { pos: number; id: string; time: number; text: string | null; mid?: string }[] = [];
  lines.forEach((l, pos) => {
    const msg = l.message || "";
    let ch: NtfyChunk | null = null;
    if (msg.startsWith('{"nuga":"c1"')) { try { ch = JSON.parse(msg) as NtfyChunk; } catch { ch = null; } }
    if (!ch) { units.push({ pos, id: l.id, time: l.time || 0, text: msg }); return; }
    let g = groups.get(ch.m);
    if (!g) { g = { first: pos, n: ch.n, parts: new Map<number, string>(), lastPos: pos, lastId: l.id, time: l.time || 0, headTime: Infinity }; groups.set(ch.m, g); units.push({ pos, id: l.id, time: l.time || 0, text: null, mid: ch.m }); }
    g.parts.set(ch.i, ch.d); g.lastPos = pos; g.lastId = l.id; g.time = Math.max(g.time, l.time || 0);
    if (ch.i === 0) g.headTime = l.time || 0;
  });
  const usable = (g: { n: number; parts: Map<number, string> }) => g.parts.size >= g.n;
  const dropped = (g: { n: number; parts: Map<number, string>; headTime: number }) => !usable(g) && (!g.parts.has(0) || g.headTime < nowSec - NTFY_CHUNK_WAIT);
  let cut = Infinity;
  for (const g of groups.values()) if (!usable(g) && !dropped(g)) cut = Math.min(cut, g.first);
  const out: NtfyUnit[] = [];
  let upto = -1;
  for (const u of units) {
    if (u.pos >= cut) break;
    if (u.text !== null) { out.push({ id: u.id, time: u.time, text: u.text }); upto = Math.max(upto, u.pos); continue; }
    const g = groups.get(u.mid!)!;
    if (dropped(g)) { if (g.lastPos < cut) upto = Math.max(upto, g.lastPos); continue; }
    if (g.lastPos >= cut) break;
    out.push({ id: g.lastId, time: g.time, text: Array.from({ length: g.n }, (_, i) => g.parts.get(i) || "").join("") });
    upto = Math.max(upto, g.lastPos);
  }
  return { units: out, upto };
}

/**
 * 이어 받을 위치: "c:<유닉스 초>:<그 초에 이미 받은 id,…>".
 * ntfy 의 since=<초> 는 그 초의 메시지를 다시 주므로, 그 초에 받은 id 는 기억해 두었다가 건너뛴다.
 */
export function ntfyCursor(lines: NtfyLine[], upto: number, prev?: { time: number; ids: string[] }): string {
  let time = prev?.time || 0; let ids = new Set(prev?.ids || []);
  for (let i = 0; i <= upto && i < lines.length; i++) {
    const t = lines[i].time || 0;
    if (t > time) { time = t; ids = new Set([lines[i].id]); } else if (t === time) ids.add(lines[i].id);
  }
  return `c:${time}:${[...ids].join(",")}`;
}
export function parseNtfyCursor(c: string | undefined): { time: number; ids: string[] } | null {
  const m = c?.match(/^c:(\d+):(.*)$/);
  return m ? { time: Number(m[1]), ids: m[2] ? m[2].split(",") : [] } : null;
}

/** ntfy 가 요청을 막았을 때(429)의 이유. 42908 = 하루 메시지 수를 다 씀 (같은 인터넷 주소를 쓰는 기기 모두 합쳐 250건) */
export const NTFY_DAILY = "오늘 보낼 수 있는 양을 다 썼습니다";
async function ntfyBusy(r: Response, tail = ""): Promise<string> {
  let code = 0;
  try { code = Number(((await r.json()) as { code?: number }).code) || 0; } catch { /* 본문 없음 */ }
  if (code === 42908) return `중계가 바쁨: ${NTFY_DAILY} (공개 중계의 하루 한도). 내일 다시 보냅니다`;
  return `중계가 잠시 바쁨 (요청이 많음)${tail ? `. ${tail}` : ""}`;
}

export class NtfyClient implements SyncTransport {
  /** @param since 처음 받을 때의 기준(유닉스 초) — 로그인한 때. 그 전 메시지는 받지 않는다 */
  constructor(public baseUrl: string, public keyId: string, private key: Uint8Array, private since: number, private fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  static fromSettings(sync: NonNullable<Settings["sync"]>): NtfyClient {
    return new NtfyClient(sync.relayUrl || NTFY_BASE, sync.keyId, fromB64(sync.keyB64), sync.login?.at || Math.floor(Date.now() / 1000));
  }

  private url(path: string): string { return this.baseUrl.replace(/\/+$/, "") + path; }
  topic(forWho: "pc" | "phone"): string { return ntfyTopic(this.keyId, forWho); }
  /** 새 메시지가 오면 바로 알려 주는 주소 (EventSource). extra = 같은 연결로 함께 들을 다른 통로 */
  sseUrl(forWho: "pc" | "phone", extra: string[] = []): string { return this.url(`/${[this.topic(forWho), ...extra].join(",")}/sse`); }

  /** 알림(EventSource)으로 받은 메시지 줄. ntfy.sh 는 새 메시지를 조회 결과에 조금(약 1초) 늦게 넣으므로, 알림 직후 조회에 없으면 이것을 쓴다 */
  private fed: Record<"pc" | "phone", NtfyLine[]> = { pc: [], phone: [] };
  /** EventSource 의 data(메시지 JSON 한 줄)를 넣는다. 메시지였으면 true */
  feed(forWho: "pc" | "phone", data: string): boolean {
    const [l] = parseNtfyLines(data);
    if (!l) return false;
    // 여러 통로를 한 연결로 들을 때: 내 통로의 것만
    if (l.topic && l.topic !== this.topic(forWho)) return false;
    const list = this.fed[forWho];
    if (!list.some((x) => x.id === l.id)) { list.push(l); if (list.length > 200) list.splice(0, list.length - 200); }
    return true;
  }

  async health(): Promise<boolean> {
    try { const r = await this.fetchImpl(this.url("/v1/health")); return r.ok; } catch { return false; }
  }

  async send(message: SyncMessage, from: Envelope["from"] = "pc"): Promise<string> {
    const env = await encryptEnvelope(this.key, this.keyId, message, from, nowIso());
    const to = from === "pc" ? "phone" : "pc";
    const mid = Math.random().toString(36).slice(2, 10);
    let last = "";
    for (const body of chunkForNtfy(JSON.stringify(env), mid)) {
      // text/plain 본문 하나 = 단순 요청 (CORS 사전 확인 없이)
      const r = await this.fetchImpl(this.url(`/${this.topic(to)}`), { method: "POST", body });
      if (r.status === 429) throw new Error(await ntfyBusy(r, "잠시 뒤 다시 보냅니다"));
      if (!r.ok) throw new Error(`중계 전송 실패 ${r.status}`);
      try { last = ((await r.json()) as { id?: string }).id || last; } catch { /* id 없이도 계속 */ }
    }
    return last;
  }

  /** @param after 이어 받을 위치 (ntfyCursor). 없으면 로그인한 때부터 */
  async pull(forWho: "pc" | "phone", after?: string): Promise<{ item: RelayItem; message: SyncMessage | null }[]> {
    const cur = parseNtfyCursor(after);
    const since = cur ? cur.time : this.since;
    const r = await this.fetchImpl(this.url(`/${this.topic(forWho)}/json?poll=1&since=${since}`));
    if (r.status === 429) throw new Error(await ntfyBusy(r));
    if (!r.ok) throw new Error(`중계 조회 실패 ${r.status}`);
    // 이미 받은 것(앞 초 · 그 초에 받은 id)은 뺀다
    const seen = new Set(cur?.ids || []);
    // 조회 결과 + 알림으로 받았는데 아직 조회에 안 나온 것 (시각 순서로)
    const polled = parseNtfyLines(await r.text());
    const polledIds = new Set(polled.map((l) => l.id));
    const all = [...polled, ...this.fed[forWho].filter((l) => !polledIds.has(l.id))].sort((a, b) => (a.time || 0) - (b.time || 0));
    const lines = all.filter((l) => (l.time || 0) > since || ((l.time || 0) === since && !seen.has(l.id)));
    const { units, upto } = assembleNtfy(lines);
    if (upto < 0) return [];
    const cursor = ntfyCursor(lines, upto, cur || undefined);
    const upTime = parseNtfyCursor(cursor)?.time || 0;
    this.fed[forWho] = this.fed[forWho].filter((l) => (l.time || 0) >= upTime);
    const fallbackFrom: Envelope["from"] = forWho === "pc" ? "phone" : "pc";
    const out: { item: RelayItem; message: SyncMessage | null }[] = [];
    for (const u of units) {
      let env: Envelope | null = null;
      try { env = JSON.parse(u.text) as Envelope; } catch { env = null; }
      let message: SyncMessage | null = null;
      if (env?.iv && env.ct) { try { message = await decryptEnvelope(this.key, this.keyId, env); } catch { message = null; } }
      // 받는 쪽은 마지막 item.id 를 기억했다가 after 로 돌려준다 (모두 같은 '이어 받을 위치')
      out.push({ item: { id: cursor, from: env?.from || fallbackFrom, iv: env?.iv || "", ct: env?.ct || "", ts: env?.ts || "" }, message });
    }
    // 건너뛴 조각뿐이어도 위치는 앞으로 (같은 것을 계속 받지 않게): 빈 메시지 하나로 위치만 알린다
    if (!out.length) out.push({ item: { id: cursor, from: fallbackFrom, iv: "", ct: "", ts: "" }, message: null });
    return out;
  }

  /** ntfy 는 메시지를 지울 수 없다: 받는 쪽이 이어 받을 위치를 기억한다 */
  async ack(): Promise<void> { /* 할 일 없음 */ }
  async clear(): Promise<void> { /* 12시간 뒤 저절로 사라진다 */ }
}
