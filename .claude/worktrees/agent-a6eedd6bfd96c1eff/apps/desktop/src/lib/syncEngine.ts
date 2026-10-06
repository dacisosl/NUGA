import { RelayClient, applyTombstones, buildConfigMessage, mergeRecords, nowIso, lessonFor, routeRecordArea, type NugaRecord, type SyncMessage, type TranscriptPart } from "@nuga/core";
import { useTranscripts } from "./transcripts";
import { runSuggestions } from "./suggestFlow";
import { arrivalModeOf, readAreaDoc, useStore, writeAreaDoc } from "../store";
import type { NugaDoc } from "@nuga/core";
import { notify } from "./platform";

/** PC 쪽 동기화 엔진: 릴레이 폴링 → 복호화 → 병합 → ack. 설정 변경 시 config 내려보내기. */
class SyncEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastConfigJson = "";
  private client: RelayClient | null = null;

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
    document.addEventListener("visibilitychange", this.onVis);
  }
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVis);
  }
  private onVis = () => { if (document.visibilityState === "visible") this.kick(); };

  kick() { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.loop(), 50); }

  /** 설정을 강제로 다시 내려보냄 (설정 화면 버튼) */
  async resendConfig(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try { await this.pushConfigIfChanged(client, true); return true; } catch { return false; }
  }

  private schedule() {
    if (!this.running) return;
    const ms = document.visibilityState === "visible" ? 5000 : 30000;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), ms);
  }

  private getClient(): RelayClient | null {
    const sync = useStore.getState().doc.settings.sync;
    if (!sync) { this.client = null; return null; }
    if (!this.client || this.client.keyId !== sync.keyId || this.client.baseUrl !== sync.relayUrl) this.client = RelayClient.fromSettings(sync);
    return this.client;
  }

  async loop() {
    const st = useStore.getState();
    const client = this.getClient();
    if (!client) { st.setSyncStatus({ state: "off", message: "페어링 안 됨" }); this.schedule(); return; }
    st.setSyncStatus({ state: "busy", message: "동기화 중", lastAt: st.syncStatus.lastAt });
    try {
      await this.pushConfigIfChanged(client);
      await this.pushOutbox(client);
      await this.pull(client);
      useStore.getState().setSyncStatus({ state: "idle", message: "연결됨", lastAt: nowIso() });
    } catch (e) {
      useStore.getState().setSyncStatus({ state: "error", message: e instanceof Error ? e.message : "오류", lastAt: st.syncStatus.lastAt });
    }
    this.schedule();
  }

  /** 설정(시간표·진도·카테고리·명렬 옵션)이 바뀌었으면 폰으로 내려보냄 */
  /** 현재 영역 + 나머지 영역 문서 (반·시간표 합산용) */
  private async allDocs(): Promise<{ id: string; doc: NugaDoc }[]> {
    const st = useStore.getState();
    const out: { id: string; doc: NugaDoc }[] = [{ id: st.areaId, doc: st.doc }];
    for (const a of st.areas) if (a.id !== st.areaId) { const d = await readAreaDoc(a.id); if (d) out.push({ id: a.id, doc: d }); }
    return out;
  }

  async pushConfigIfChanged(client: RelayClient, force = false) {
    const { doc, deviceId } = useStore.getState();
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
    const merged = { ...doc.settings, classes: [...classes].map(([c, size]) => ({ class: c, size })), timetable: [...tt.values()], progress: [...progress.values()] };
    const cfg = buildConfigMessage(merged, roster.map((r) => ({ ...r, level: "B" as const })));
    const key = JSON.stringify({ ...cfg, updatedAt: "" });
    if (!force && key === this.lastConfigJson) return;
    await client.send({ v: 1, type: "config", deviceId, sentAt: nowIso(), payload: cfg }, "pc");
    this.lastConfigJson = key;
  }

  async pushOutbox(client: RelayClient) {
    const st = useStore.getState();
    const { messages, tombstones } = st.outbox;
    if (!messages.length && !tombstones.length) return;
    st.drainOutbox();
    try {
      for (const m of messages) await client.send(m, "pc");
      if (tombstones.length) await client.send({ v: 1, type: "tombstones", deviceId: st.deviceId, sentAt: nowIso(), payload: tombstones }, "pc");
    } catch (e) {
      // 실패하면 되돌려 놓는다
      const cur = useStore.getState().outbox;
      useStore.setState({ outbox: { messages: [...messages, ...cur.messages], tombstones: [...tombstones, ...cur.tombstones] } });
      throw e;
    }
  }

  async pull(client: RelayClient) {
    const st = useStore.getState();
    const after = st.doc.settings.sync?.lastPulledId;
    const items = await client.pull("pc", after);
    if (!items.length) return;
    const incoming: NugaRecord[] = [];
    const tombs: { id: string; deletedAt: string }[] = [];
    const parts: TranscriptPart[] = [];
    let lastId = after;
    for (const { item, message } of items) {
      lastId = item.id;
      if (message) this.handle(message, incoming, tombs, parts);
      await client.ack(item.id);
    }
    await this.apply(incoming, tombs);
    await this.applyTranscripts(client, parts);
    useStore.getState().setSettings((s) => ({ ...s, sync: s.sync ? { ...s.sync, lastPulledId: lastId, lastSyncAt: nowIso() } : null }));
  }

  private handle(m: SyncMessage, incoming: NugaRecord[], tombs: { id: string; deletedAt: string }[], parts: TranscriptPart[]) {
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
    }
  }

  /** 수업 스크립트: 조각을 모아 저장하고, 다 받은 스크립트는 폰에 transcriptAck 를 보내 사본을 지우게 한다 */
  private async applyTranscripts(client: RelayClient, parts: TranscriptPart[]) {
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
      // popup: 어느 화면이든 알림 모달을 바로 띄운다 (이미 열려 있으면 이어서). queue: 미반영에 쌓고 알림만.
      if (mode === "popup") s.openInbox({ records: pending });
      else if (mode === "queue") s.toast({ text: `${body} · 미반영에 추가`, kind: "notice", ttl: 15000, action: { label: "처리하기", onClick: () => useStore.getState().openInbox({ records: pending }) } });
      else s.toast({ text: body, kind: "notice", ttl: 15000, action: { label: "보기", onClick: () => useStore.getState().setPage("today") } });
    }
  }
}

export const syncEngine = new SyncEngine();
