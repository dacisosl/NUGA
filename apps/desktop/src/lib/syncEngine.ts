import { NtfyClient, RelayClient, applyTombstones, buildConfigMessage, isTestLogin, mergeRecords, nowIso, lessonFor, routeRecordArea, type ConfigMessage, type NugaRecord, type SyncMessage, type SyncTransport, type TranscriptPart } from "@nuga/core";
import { useTranscripts } from "./transcripts";
import { runSuggestions } from "./suggestFlow";
import { PHONE_AREA, arrivalModeOf, onQueued, readAreaDoc, useStore, writeAreaDoc } from "../store";
import type { NugaDoc } from "@nuga/core";
import { notify } from "./platform";
import { demoInfo } from "./demo";

/** 폰에서 온 기록 id (PC 가 고친 것 중 이것만 폰으로 되보낸다: 공개 중계의 하루 메시지 수를 아끼려고) */
const FROM_PHONE_KEY = "nuga.fromPhone";
function fromPhoneIds(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(FROM_PHONE_KEY) || "[]") as string[]); } catch { return new Set(); } }
function rememberFromPhone(ids: string[]) {
  if (!ids.length) return;
  const all = [...fromPhoneIds(), ...ids].slice(-500);
  try { localStorage.setItem(FROM_PHONE_KEY, JSON.stringify([...new Set(all)])); } catch { /* 저장 불가 */ }
}

/**
 * 동기화 엔진. 이 기기의 역할(store.role)에 따라
 * - PC: 중계 폴링 → 복호화 → 병합 → (팝업) · 설정이 바뀌면 config 를 폰으로.
 * - 폰(로그인으로 연결한 웹): 인사(ping) → PC 가 보낸 config 로 반·시간표·이름을 채우고, 저장한 기록을 PC 로.
 * 중계는 누가 릴레이(QR 페어링) 또는 공개 중계 ntfy.sh(로그인). ntfy 는 새 메시지가 오면 바로(EventSource) 한 바퀴 돈다.
 */
class SyncEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastConfigJson = "";
  private client: SyncTransport | null = null;
  private es: EventSource | null = null;
  private esUrl = "";
  private pinged = "";
  private busy = false;
  private again = false;
  /** 마지막 바퀴를 시작한 때 · 중계가 '요청이 많음'(429)이라 쉬는 끝 (공개 서버 요청 한도를 지키려고) */
  private lastRun = 0;
  private backoffUntil = 0;

  start() {
    if (this.running) return;
    this.running = true;
    // 폰의 새 기록·PC 가 채운 기록처럼 보낼 것이 생기면 다음 폴링을 기다리지 않고 바로 보낸다
    onQueued(() => { if (this.client || useStore.getState().doc.settings.sync) this.kick(); });
    this.loop();
    document.addEventListener("visibilitychange", this.onVis);
  }
  stop() {
    this.running = false;
    onQueued(null);
    if (this.timer) clearTimeout(this.timer);
    this.closeSse();
    document.removeEventListener("visibilitychange", this.onVis);
  }
  /** 로그인·로그아웃·역할이 바뀌었을 때: 연결을 새로 */
  restart() {
    this.client = null; this.pinged = ""; this.lastConfigJson = "";
    this.closeSse();
    this.kick();
  }
  private onVis = () => { if (document.visibilityState === "visible") this.kick(); };

  /** 곧 한 바퀴. 지금 도는 중이면 끝난 뒤 한 번 더 (예약을 걸면 바퀴 끝의 schedule 이 지워 버리므로) */
  kick() {
    if (this.busy) { this.again = true; return; }
    // 공개 중계: 알림이 연달아 와도 1초에 한 번만 묻고, 막혔으면 풀릴 때까지 기다린다
    const now = Date.now();
    const wait = this.isNtfy() ? Math.max(50, this.lastRun + 1000 - now, this.backoffUntil - now) : 50;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), wait);
  }

  /** 설정을 강제로 다시 내려보냄 (설정 화면 버튼) */
  async resendConfig(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try { await this.pushConfigIfChanged(client, true); return true; } catch { return false; }
  }

  private isNtfy(): boolean { return useStore.getState().doc.settings.sync?.transport === "ntfy"; }

  private schedule() {
    if (!this.running) return;
    // ntfy: 새 메시지는 EventSource 로 바로 오니 확인용 폴링은 드물게 (공개 서버 요청 한도: IP당 5초에 1건 꼴)
    // 막혔다가 풀리는 때가 있으면 그때 곧바로 다시 (놓친 알림을 받으러)
    const ms = this.isNtfy()
      ? (this.backoffUntil > Date.now() ? this.backoffUntil - Date.now() + 200 : document.visibilityState === "visible" ? 60000 : 180000)
      : (document.visibilityState === "visible" ? 5000 : 30000);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), ms);
  }

  private getClient(): SyncTransport | null {
    const sync = useStore.getState().doc.settings.sync;
    if (!sync) { this.client = null; return null; }
    const ntfy = sync.transport === "ntfy";
    const fresh = !this.client || this.client.keyId !== sync.keyId || this.client.baseUrl !== sync.relayUrl || (this.client instanceof NtfyClient) !== ntfy;
    if (fresh) this.client = ntfy ? NtfyClient.fromSettings(sync) : RelayClient.fromSettings(sync);
    return this.client;
  }

  /** ntfy: 내가 받는 통로를 EventSource 로 지켜보다가 새 메시지가 오면 바로 한 바퀴 */
  private ensureSse(client: SyncTransport | null) {
    const role = useStore.getState().role;
    const url = client instanceof NtfyClient && typeof EventSource === "function" ? client.sseUrl(role) : "";
    if (url === this.esUrl) return;
    this.closeSse();
    if (!url) return;
    this.esUrl = url;
    try {
      const es = new EventSource(url);
      // 알림에 실린 메시지를 바로 넘긴다: 공개 서버는 새 메시지를 조회 결과에 약 1초 늦게 넣어서, 알림 직후 조회로는 못 볼 수 있다
      es.onmessage = (e) => { if (client instanceof NtfyClient) client.feed(role, String(e.data || "")); this.kick(); };
      this.es = es;
    } catch { this.es = null; }
  }
  private closeSse() { try { this.es?.close(); } catch { /* 이미 닫힘 */ } this.es = null; this.esUrl = ""; }

  async loop() {
    // 한 바퀴가 도는 동안 또 불리면, 끝나고 한 번 더 (겹쳐 돌지 않게)
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.lastRun = Date.now();
    const st = useStore.getState();
    const client = this.getClient();
    this.ensureSse(client);
    try {
      if (!client) { st.setSyncStatus({ state: "off", message: "연결 안 됨" }); return; }
      st.setSyncStatus({ state: "busy", message: "동기화 중", lastAt: st.syncStatus.lastAt });
      try {
        if (st.role === "phone") await this.phoneRound(client);
        else {
          await this.pushConfigIfChanged(client);
          await this.pushOutbox(client);
          const pinged = await this.pull(client);
          // 새 기기가 인사했으면 config 를 바로 보낸다 (다음 바퀴를 기다리지 않게)
          if (pinged) await this.pushConfigIfChanged(client, true);
        }
        useStore.getState().setSyncStatus({ state: "idle", message: "연결됨", lastAt: nowIso() });
      } catch (e) {
        // 중계가 막았으면(429) 20초 쉬었다가 다시 (그사이 알림은 모아 두었다가 한 번에)
        if (e instanceof Error && /바쁨/.test(e.message)) this.backoffUntil = Date.now() + 20000;
        useStore.getState().setSyncStatus({ state: "error", message: e instanceof Error ? e.message : "오류", lastAt: st.syncStatus.lastAt });
      }
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.kick(); } else this.schedule();
    }
  }

  /* ---------------- 폰 역할 ---------------- */
  private async phoneRound(client: SyncTransport) {
    const st = useStore.getState();
    if (st.areaId !== PHONE_AREA) await st.enterPhoneArea();
    // 처음 한 번 인사: PC 가 반·시간표·이름(config)을 보내 준다
    if (this.pinged !== client.keyId) {
      await client.send({ v: 1, type: "ping", deviceId: st.deviceId, sentAt: nowIso(), payload: { name: "폰 (웹)" } }, "phone");
      this.pinged = client.keyId;
    }
    await this.pushOutbox(client);
    const after = useStore.getState().doc.settings.sync?.lastPulledId;
    const items = await client.pull("phone", after);
    if (!items.length) return;
    let lastId = after;
    let cfg: ConfigMessage | null = null;
    const incoming: NugaRecord[] = []; const tombs: { id: string; deletedAt: string }[] = [];
    for (const { item, message } of items) {
      lastId = item.id;
      if (!message) continue;
      if (message.type === "config") cfg = message.payload;
      else if (message.type === "records") incoming.push(...message.payload);
      else if (message.type === "tombstones") tombs.push(...message.payload);
    }
    if (cfg) this.applyConfigOnPhone(cfg);
    if (incoming.length || tombs.length) {
      // PC 가 채운 기록이 되돌아오면 폰의 미반영이 줄어든다 (같은 id, 늦은 updatedAt 우선)
      useStore.getState().update((d) => { d.records = applyTombstones(mergeRecords(d.records, incoming).records, tombs).records; });
    }
    useStore.getState().setSettings((s) => ({ ...s, sync: s.sync ? { ...s.sync, lastPulledId: lastId, lastSyncAt: nowIso() } : null }));
  }

  /** PC 의 반·시간표·진도·과목·이름을 폰 연결 영역에 그대로 (폰에서 번호 칸이 PC 와 같아진다) */
  private applyConfigOnPhone(cfg: ConfigMessage) {
    const st = useStore.getState();
    const first = !st.doc.settings.classes.length;
    st.update((d) => {
      d.settings.school = { ...d.settings.school, ...cfg.school };
      d.settings.categories = cfg.categories;
      d.settings.classes = cfg.classes;
      d.settings.periods = cfg.periods;
      d.settings.timetable = cfg.timetable;
      d.settings.progress = cfg.progress;
      d.settings.options = { ...d.settings.options, reelStart: cfg.options.reelStart, showPhoneNames: !!cfg.roster };
      d.students = cfg.roster ? cfg.roster.map((r) => ({ class: r.class, no: r.no, name: r.name })) : [];
      d.settings.onboarded = true;
    });
    if (first) {
      const s = useStore.getState();
      // '연결 기다리는 중' 알림은 걷어 낸다 (폰 화면 위쪽의 반·시간을 가리지 않게)
      for (const t of s.toasts) if (t.text.startsWith("폰으로 로그인")) s.dismissToast(t.id);
      s.toast({ text: `PC와 연결됨 · ${cfg.classes.map((c) => c.class).join(", ") || "반 없음"}${cfg.roster ? "" : " · 번호만"}`, kind: "notice", ttl: 4000 });
      if (s.page !== "mobile") s.setPage("mobile");
    }
  }

  /* ---------------- PC 역할 ---------------- */
  /** 현재 영역 + 나머지 영역 문서 (반·시간표 합산용) */
  private async allDocs(): Promise<{ id: string; doc: NugaDoc }[]> {
    const st = useStore.getState();
    const out: { id: string; doc: NugaDoc }[] = [{ id: st.areaId, doc: st.doc }];
    for (const a of st.areas) if (a.id !== st.areaId && a.id !== PHONE_AREA) { const d = await readAreaDoc(a.id); if (d) out.push({ id: a.id, doc: d }); }
    return out;
  }

  /** 설정(시간표·진도·카테고리·명렬 옵션)이 바뀌었으면 폰으로 내려보냄 */
  async pushConfigIfChanged(client: SyncTransport, force = false) {
    const { doc, deviceId, role } = useStore.getState();
    if (role === "phone") return;
    const docs = await this.allDocs();
    // 여러 영역의 반·시간표·진도를 합쳐 폰에 내려보낸다 (같은 요일·교시는 먼저 등록된 영역 우선)
    const classes = new Map<string, number>();
    const tt = new Map<string, { weekday: number; period: number; class: string }>();
    const progress = new Map<string, NugaDoc["settings"]["progress"][number]>();
    const roster: { class: string; no: number; name: string }[] = [];
    for (const { doc: d } of docs) {
      for (const c of d.settings.classes) classes.set(c.class, Math.max(classes.get(c.class) || 0, c.size));
      for (const s of d.students) classes.set(s.class, Math.max(classes.get(s.class) || 0, s.no));
      for (const t of d.settings.timetable) { const k = `${t.weekday}-${t.period}`; if (!tt.has(k)) tt.set(k, t); }
      for (const pr of d.settings.progress) progress.set(`${pr.class}|${pr.date}`, pr);
      for (const s of d.students) if (!roster.some((r) => r.class === s.class && r.no === s.no)) roster.push({ class: s.class, no: s.no, name: s.name });
    }
    let progressRows = [...progress.values()];
    const sync = doc.settings.sync;
    const ntfy = sync?.transport === "ntfy";
    // 공개 중계: 메시지 크기를 줄이려고 진도는 오늘 앞뒤만 (폰은 기록할 때의 진도만 쓴다)
    if (ntfy) {
      const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const from = day(-3), to = day(14);
      progressRows = progressRows.filter((p) => p.date >= from && p.date <= to);
    }
    const merged = { ...doc.settings, classes: [...classes].map(([c, size]) => ({ class: c, size })), timetable: [...tt.values()], progress: progressRows };
    const cfg = buildConfigMessage(merged, roster.map((r) => ({ ...r, level: "B" as const })));
    // 공개 테스트 계정은 누구나 같은 통로에 들어올 수 있다: 데모 데이터가 아니면 이름을 보내지 않는다
    if (ntfy && isTestLogin(sync?.login?.id) && !demoInfo() && useStore.getState().areaId !== "whale-demo") cfg.roster = null;
    const key = JSON.stringify({ ...cfg, updatedAt: "" });
    if (!force && key === this.lastConfigJson) return;
    await client.send({ v: 1, type: "config", deviceId, sentAt: nowIso(), payload: cfg }, "pc");
    this.lastConfigJson = key;
  }

  async pushOutbox(client: SyncTransport) {
    const st = useStore.getState();
    const from = st.role === "phone" ? "phone" : "pc";
    let { messages, tombstones } = st.outbox;
    if (!messages.length && !tombstones.length) return;
    st.drainOutbox();
    if (client instanceof NtfyClient) {
      // 공개 중계: 기록 메시지를 하나로 묶고(같은 id 는 마지막 것), PC 는 폰에서 온 기록만 되보낸다 (하루 메시지 수 아끼기)
      const keep = from === "pc" ? fromPhoneIds() : null;
      const byId = new Map<string, NugaRecord>();
      const rest: SyncMessage[] = [];
      for (const m of messages) {
        if (m.type === "records") { for (const r of m.payload) if (!keep || keep.has(r.id)) byId.set(r.id, r); }
        else rest.push(m);
      }
      if (from === "pc" && keep) tombstones = tombstones.filter((t) => keep.has(t.id));
      messages = [...rest, ...(byId.size ? [{ v: 1 as const, type: "records" as const, deviceId: st.deviceId, sentAt: nowIso(), payload: [...byId.values()] }] : [])];
    }
    try {
      for (const m of messages) await client.send(m, from);
      if (tombstones.length) await client.send({ v: 1, type: "tombstones", deviceId: st.deviceId, sentAt: nowIso(), payload: tombstones }, from);
    } catch (e) {
      // 실패하면 되돌려 놓는다
      const cur = useStore.getState().outbox;
      useStore.setState({ outbox: { messages: [...messages, ...cur.messages], tombstones: [...tombstones, ...cur.tombstones] } });
      throw e;
    }
  }

  /** @returns 새 기기의 인사(ping)를 받았는지 */
  async pull(client: SyncTransport): Promise<boolean> {
    const st = useStore.getState();
    const after = st.doc.settings.sync?.lastPulledId;
    const items = await client.pull("pc", after);
    if (!items.length) return false;
    const incoming: NugaRecord[] = [];
    const tombs: { id: string; deletedAt: string }[] = [];
    const parts: TranscriptPart[] = [];
    let lastId = after;
    let pinged = false;
    for (const { item, message } of items) {
      lastId = item.id;
      if (message) pinged = this.handle(message, incoming, tombs, parts) || pinged;
      await client.ack(item.id);
    }
    if (client instanceof NtfyClient) rememberFromPhone(incoming.map((r) => r.id));
    await this.apply(incoming, tombs);
    await this.applyTranscripts(client, parts);
    useStore.getState().setSettings((s) => ({ ...s, sync: s.sync ? { ...s.sync, lastPulledId: lastId, lastSyncAt: nowIso() } : null }));
    return pinged;
  }

  private handle(m: SyncMessage, incoming: NugaRecord[], tombs: { id: string; deletedAt: string }[], parts: TranscriptPart[]): boolean {
    const st = useStore.getState();
    if (m.type === "records") incoming.push(...m.payload);
    else if (m.type === "transcript") parts.push(m.payload);
    else if (m.type === "tombstones") tombs.push(...m.payload);
    else if (m.type === "ping") {
      st.update((d) => {
        const dev = d.devices.find((x) => x.deviceId === m.deviceId);
        if (dev) { dev.lastSeen = nowIso(); dev.name = m.payload.name || dev.name; } else d.devices.push({ deviceId: m.deviceId, name: m.payload.name || "기기", lastSeen: nowIso() });
      });
      // 새 기기가 인사하면 설정을 강제로 내려보낸다
      this.lastConfigJson = "";
      return true;
    }
    return false;
  }

  /** 수업 스크립트: 조각을 모아 저장하고, 다 받은 스크립트는 폰에 transcriptAck 를 보내 사본을 지우게 한다 */
  private async applyTranscripts(client: SyncTransport, parts: TranscriptPart[]) {
    if (!parts.length) return;
    const st = useStore.getState();
    const docs = await this.allDocs();
    const routes = docs.map(({ id, doc: d }) => ({
      id, timetable: d.settings.timetable, periods: d.settings.periods,
      classes: [...new Set([...d.settings.classes.map((c) => c.class), ...d.students.map((s) => s.class)])],
    }));
    const done: string[] = [];
    const store = useTranscripts.getState();
    if (!store.loaded) await store.load();
    for (const part of parts) {
      const tr = part.transcript;
      const areaId = routeRecordArea(routes, { class: tr.class, time: tr.startedAt }, st.areaId);
      const merged = await store.addPart(part, areaId);
      if (merged) done.push(merged.id);
    }
    if (done.length) {
      await client.send({ v: 1, type: "transcriptAck", deviceId: st.deviceId, sentAt: nowIso(), payload: { ids: done } }, "pc");
      // 도착한 스크립트마다 추천 카드를 만든다 (실패해도 동기화는 계속)
      // 추천이 나오면 알림 모달(쉬는 시간 기록)을 띄운다
      for (const id of done) runSuggestions(id).then((r) => { const s = useStore.getState(); if (r.count > 0 && arrivalModeOf(s.doc.settings) === "popup") s.openInbox({ transcripts: [id] }); }).catch(() => {});
      const metas = useTranscripts.getState().index.filter((m) => done.includes(m.id));
      const text = `수업 스크립트 ${done.length}건 도착 — ${metas.map((m) => `${m.class} ${m.period ? `${m.period}교시` : ""}`.trim()).join(", ")}`;
      notify("누가 스크립트 도착", text);
      st.toast({ text, kind: "notice", ttl: 10000 });
    }
  }

  /** 음성 변환 키를 폰으로 (E2E 암호화). 빈 값이면 폰에서 지운다. */
  async sendSecrets(payload: { gemini?: string; openrouter?: string }): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    const { deviceId } = useStore.getState();
    await client.send({ v: 1, type: "secrets", deviceId, sentAt: nowIso(), payload }, "pc");
    return true;
  }

  private async apply(incoming: NugaRecord[], tombs: { id: string; deletedAt: string }[]) {
    if (!incoming.length && !tombs.length) return;
    const st = useStore.getState();
    // 영역 배정: 기록 시각의 시간표 칸 → 같은 날 직전 수업 → 반 이름 → 현재 영역 (core routeRecordArea)
    const docs = await this.allDocs();
    const routes = docs.map(({ id, doc: d }) => ({
      id, timetable: d.settings.timetable, periods: d.settings.periods,
      classes: [...new Set([...d.settings.classes.map((c) => c.class), ...d.students.map((s) => s.class)])],
    }));
    const mine: NugaRecord[] = []; const others = new Map<string, NugaRecord[]>();
    for (const r of incoming) {
      const id = routeRecordArea(routes, r, st.areaId);
      if (id === st.areaId) mine.push(r); else others.set(id, [...(others.get(id) || []), r]);
    }
    for (const [id, recs] of others) {
      const d = docs.find((x) => x.id === id)!.doc;
      const supp = d.settings.supplementEnabled;
      const filled = recs.map((r) => ({ ...r, lesson: r.lesson || lessonFor(d.settings.progress, r.class, r.time), status: !supp && r.status === "pending" ? "confirmed" as const : r.status }));
      d.records = applyTombstones(mergeRecords(d.records, filled).records, tombs).records;
      await writeAreaDoc(id, d);
      const name = st.areas.find((a) => a.id === id)?.name || "다른 영역";
      st.toast({ text: `${recs.length}건 도착 → ${name}`, kind: "notice", ttl: 10000, action: { label: "이동", onClick: () => useStore.getState().switchArea(id) } });
    }
    if (tombs.length) for (const { id, doc: d } of docs) if (id !== st.areaId && !others.has(id)) { const r = applyTombstones(d.records, tombs); if (r.removed.length) { d.records = r.records; await writeAreaDoc(id, d); } }
    incoming = mine;
    if (!incoming.length && !tombs.length) return;
    let added: NugaRecord[] = [];
    st.update((d) => {
      const supp = d.settings.supplementEnabled;
      const filled = incoming.map((r) => ({ ...r, lesson: r.lesson || lessonFor(d.settings.progress, r.class, r.time), status: !supp && r.status === "pending" ? "confirmed" as const : r.status }));
      const m = mergeRecords(d.records, filled);
      added = m.added;
      d.records = applyTombstones(m.records, tombs).records;
      // 기기 목록 갱신
      for (const r of incoming) {
        const dev = d.devices.find((x) => x.name === r.source);
        if (!dev) d.devices.push({ deviceId: r.source, name: r.source === "watch" ? "워치" : r.source === "widget" ? "위젯" : "폰", lastSeen: nowIso() });
        else dev.lastSeen = nowIso();
      }
    });
    const supp = useStore.getState().doc.settings.supplementEnabled;
    const pending = (supp ? added.filter((r) => r.status === "pending") : added).map((r) => r.id);
    if (pending.length) {
      const names = pending.slice(0, 3).map((id) => { const r = added.find((x) => x.id === id)!; return `${r.class} · ${r.no}번`; }).join(", ");
      const body = `${pending.length}건 도착 — ${names}${pending.length > 3 ? " 외" : ""}`;
      notify("누가 기록 도착", body);
      const s = useStore.getState();
      const mode = arrivalModeOf(s.doc.settings);
      // popup: 어느 화면이든 알림 모달을 바로 띄운다 (이미 열려 있으면 이어서). 모바일 화면을 보고 있으면 PC 화면으로 돌아갈 때.
      // queue: 미반영에 쌓고 알림만.
      if (mode === "popup") { if (s.page === "mobile") s.deferInbox(pending); else s.openInbox({ records: pending }); }
      else if (mode === "queue") s.toast({ text: `${body} · 미반영에 추가`, kind: "notice", ttl: 15000, action: { label: "처리하기", onClick: () => useStore.getState().openInbox({ records: pending }) } });
      else s.toast({ text: body, kind: "notice", ttl: 15000, action: { label: "보기", onClick: () => useStore.getState().setPage("today") } });
    }
  }
}

export const syncEngine = new SyncEngine();
// 개발 서버에서만: 자동 검사가 엔진 상태(도는 중·다시·SSE)를 들여다볼 수 있게
if (import.meta.env.DEV) (globalThis as unknown as { __nugaSync?: unknown }).__nugaSync = syncEngine;
