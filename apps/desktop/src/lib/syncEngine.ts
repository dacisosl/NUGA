import { RelayClient, applyTombstones, buildConfigMessage, mergeRecords, nowIso, lessonFor, type NugaRecord, type SyncMessage } from "@nuga/core";
import { useStore } from "../store";
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
  async pushConfigIfChanged(client: RelayClient, force = false) {
    const { doc, deviceId } = useStore.getState();
    const cfg = buildConfigMessage(doc.settings, doc.students);
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
    let lastId = after;
    for (const { item, message } of items) {
      lastId = item.id;
      if (message) this.handle(message, incoming, tombs);
      await client.ack(item.id);
    }
    this.apply(incoming, tombs);
    useStore.getState().setSettings((s) => ({ ...s, sync: s.sync ? { ...s.sync, lastPulledId: lastId, lastSyncAt: nowIso() } : null }));
  }

  private handle(m: SyncMessage, incoming: NugaRecord[], tombs: { id: string; deletedAt: string }[]) {
    const st = useStore.getState();
    if (m.type === "records") incoming.push(...m.payload);
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

  private apply(incoming: NugaRecord[], tombs: { id: string; deletedAt: string }[]) {
    if (!incoming.length && !tombs.length) return;
    const st = useStore.getState();
    let added: NugaRecord[] = [];
    st.update((d) => {
      const filled = incoming.map((r) => ({ ...r, lesson: r.lesson || lessonFor(d.settings.progress, r.class, r.time) }));
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
    const pending = added.filter((r) => r.status === "pending").map((r) => r.id);
    if (pending.length) {
      const names = pending.slice(0, 3).map((id) => { const r = added.find((x) => x.id === id)!; return `${r.class} · ${r.no}번`; }).join(", ");
      const body = `${pending.length}건 도착 — ${names}${pending.length > 3 ? " 외" : ""}`;
      notify("누가 기록 도착", body);
      const s = useStore.getState();
      s.toast({ text: body, kind: "notice", ttl: 15000, action: { label: "보완하기", onClick: () => useStore.getState().openSupplement(pending) } });
    }
  }
}

export const syncEngine = new SyncEngine();
