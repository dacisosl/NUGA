import { create } from "zustand";
import {
  emptyDoc, nowIso, uuid, classSortKey, lessonFor, makeSampleDoc,
  type Category, type Draft, type NugaDoc, type NugaRecord, type Performance, type Settings, type Student, type SyncMessage, type Tombstone,
} from "@nuga/core";
import { getPersist } from "./lib/persist";

export type Page = "records" | "draft" | "review" | "settings";
export interface Toast { id: number; text: string; kind?: "notice" | "dark"; action?: { label: string; onClick: () => void }; onClick?: () => void; ttl?: number }

export interface Outbox { messages: SyncMessage[]; tombstones: Tombstone[] }

/** 영역 = 독립 문서(명단·기록·초안·시간표). 동기화·AI·표시 옵션은 모든 영역이 공유한다. */
export interface AreaMeta { id: string; name: string; createdAt: string }
/** 공통 설정: 모든 영역이 같은 값을 쓴다 (동기화·AI·표시 옵션·보완 대기). 글자수·기준과 초안 프롬프트는 영역별. */
export interface GlobalSettings { sync: Settings["sync"]; ai: Settings["ai"]; options: Settings["options"]; supplementEnabled: boolean }
let lastGlobal: GlobalSettings | null = null;
export interface AreaStats { id: string; name: string; students: number; records: number; drafts: number; performances: number }
export interface MultiBackup { format: "nuga-multi"; version: 1; exportedAt: string; global: GlobalSettings | null; currentArea: string; areas: { meta: AreaMeta; doc: NugaDoc }[] }

const DEFAULT_AREA = "default";
function normalizeDoc(doc: NugaDoc): NugaDoc {
  const base = emptyDoc();
  doc.settings = { ...base.settings, ...doc.settings, options: { ...base.settings.options, ...(doc.settings.options || {}) }, ai: { ...base.settings.ai, ...(doc.settings.ai || {}) } };
  return doc;
}
function pickGlobal(doc: NugaDoc, _prev: GlobalSettings | null): GlobalSettings {
  const s = doc.settings;
  return { sync: s.sync, ai: s.ai, options: s.options, supplementEnabled: s.supplementEnabled };
}
function applyGlobal(doc: NugaDoc, g: GlobalSettings | null): NugaDoc {
  if (!g) return doc;
  doc.settings = { ...doc.settings, sync: g.sync, ai: g.ai, options: g.options, supplementEnabled: g.supplementEnabled ?? doc.settings.supplementEnabled };
  return doc;
}
export function currentGlobal(): GlobalSettings | null { return lastGlobal; }
export async function readAreaDoc(id: string): Promise<NugaDoc | null> {
  const p = await getPersist();
  const raw = id === DEFAULT_AREA ? await p.load() : await p.loadAux<NugaDoc>(`doc:${id}`);
  if (!raw) return null;
  return applyGlobal(normalizeDoc(raw), lastGlobal ?? (await p.loadAux<GlobalSettings>("global")));
}
export async function writeAreaDoc(id: string, doc: NugaDoc): Promise<void> {
  const p = await getPersist();
  if (id === DEFAULT_AREA) await p.save(doc); else await p.saveAux(`doc:${id}`, doc);
}

interface State {
  doc: NugaDoc;
  areas: AreaMeta[];
  areaId: string;
  loaded: boolean;
  page: Page;
  cls: string;
  mode2p: "individual" | "batch";
  selected: { class: string; no: number } | null;
  settingsTab: string;
  /** 초안 보기: 한 문장씩 · 구별하기(형광펜). 이 기기에만 저장 */
  view: { split: boolean; highlight: boolean };
  toasts: Toast[];
  supplementQueue: string[];
  syncStatus: { state: "off" | "idle" | "busy" | "error"; message: string; lastAt?: string };
  outbox: Outbox;
  deviceId: string;

  init(): Promise<void>;
  addArea(a: { name: string; grade: number; year: number; semester: number; copyRoster: boolean }): Promise<void>;
  switchArea(id: string): Promise<void>;
  renameArea(id: string, name: string): void;
  deleteArea(id: string): Promise<void>;
  areaStats(): Promise<AreaStats[]>;
  exportAll(): Promise<MultiBackup>;
  importAll(b: MultiBackup): Promise<void>;
  resetEverything(): Promise<void>;
  flush(): Promise<void>;
  update(mut: (d: NugaDoc) => void, opts?: { silent?: boolean }): void;
  setPage(p: Page): void;
  setClass(c: string): void;
  setMode2p(m: "individual" | "batch"): void;
  select(s: { class: string; no: number } | null): void;
  setSettingsTab(t: string): void;
  setView(p: Partial<{ split: boolean; highlight: boolean }>): void;
  toast(t: Omit<Toast, "id">): number;
  dismissToast(id: number): void;
  openSupplement(ids: string[]): void;
  setSyncStatus(s: State["syncStatus"]): void;
  queueMessage(m: SyncMessage): void;
  drainOutbox(): Outbox;

  // domain actions
  addRecord(r: Omit<NugaRecord, "id" | "createdAt" | "updatedAt">): NugaRecord;
  updateRecord(id: string, patch: Partial<NugaRecord>): void;
  deleteRecord(id: string): void;
  setStudents(students: Student[]): void;
  upsertStudent(s: Student): void;
  editStudent(cls: string, oldNo: number, patch: { no?: number; name?: string; level?: Student["level"] }): { ok: boolean; message?: string; student?: Student };
  removeStudent(cls: string, no: number): void;
  setSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): void;
  saveDraft(d: Draft): void;
  deleteDraft(cls: string, no: number): void;
  addPerformance(p: Omit<Performance, "id">): Performance;
  removePerformance(id: string): void;
  loadSample(): void;
  replaceDoc(d: NugaDoc): void;
  resetAll(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: (() => Promise<void>) | null = null;
function scheduleSave(doc: NugaDoc, outbox: Outbox) {
  if (saveTimer) clearTimeout(saveTimer);
  const areaId = useStore.getState().areaId || DEFAULT_AREA;
  const g = pickGlobal(doc, lastGlobal); lastGlobal = g;
  pendingSave = async () => {
    pendingSave = null;
    const p = await getPersist();
    await writeAreaDoc(areaId, doc);
    await p.saveAux("outbox", outbox);
    await p.saveAux("global", g);
    // 영역 이름 = 영역 문서의 school.subject
    const st = useStore.getState();
    const name = doc.settings.school.subject.trim() || "영역";
    if (st.areas.some((a) => a.id === areaId && a.name !== name)) {
      const areas = st.areas.map((a) => a.id === areaId ? { ...a, name } : a);
      useStore.setState({ areas }); await p.saveAux("areas", areas);
    }
  };
  saveTimer = setTimeout(() => { pendingSave?.(); }, 250);
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  doc: emptyDoc(),
  areas: [],
  areaId: DEFAULT_AREA,
  loaded: false,
  page: "records",
  cls: "",
  mode2p: "individual",
  selected: null,
  settingsTab: "subject",
  view: (() => { try { return { split: false, highlight: false, ...JSON.parse(localStorage.getItem("nuga.view") || "{}") }; } catch { return { split: false, highlight: false }; } })(),
  toasts: [],
  supplementQueue: [],
  syncStatus: { state: "off", message: "연결 안 됨" },
  outbox: { messages: [], tombstones: [] },
  deviceId: "",

  async init() {
    const p = await getPersist();
    let areas = (await p.loadAux<AreaMeta[]>("areas")) || [];
    let areaId = (await p.loadAux<string>("currentArea")) || DEFAULT_AREA;
    if (!areas.length) {
      const first = await p.load();
      areas = [{ id: DEFAULT_AREA, name: first?.settings.school.subject?.trim() || "영역 1", createdAt: nowIso() }];
      await p.saveAux("areas", areas);
    }
    if (!areas.some((a) => a.id === areaId)) areaId = areas[0].id;
    set({ areas, areaId });
    lastGlobal = await p.loadAux<GlobalSettings>("global");
    const doc = (await readAreaDoc(areaId)) || applyGlobal(emptyDoc(), lastGlobal);
    const outbox = (await p.loadAux<Outbox>("outbox")) || { messages: [], tombstones: [] };
    let deviceId = (await p.loadAux<string>("deviceId")) || "";
    if (!deviceId) { deviceId = uuid(); await p.saveAux("deviceId", deviceId); }
    const classes = [...doc.settings.classes].sort((a, b) => classSortKey(a.class) - classSortKey(b.class));
    set({ doc, loaded: true, outbox, deviceId, cls: classes[0]?.class || "", page: doc.settings.onboarded ? "records" : "settings" });
  },

  async flush() { if (saveTimer) clearTimeout(saveTimer); if (pendingSave) await pendingSave(); },

  async addArea(a) {
    await get().flush();
    const p = await getPersist();
    const cur = get().doc;
    const d = applyGlobal(emptyDoc(), pickGlobal(cur, lastGlobal));
    const cs = cur.settings;
    d.settings = { ...d.settings, school: { grade: a.grade, subject: a.name.trim(), year: a.year, semester: a.semester }, categories: cs.categories.map((c) => ({ ...c })), periods: cs.periods.map((x) => ({ ...x })), onboarded: true,
      // 글자수·기준은 영역별이지만 새 영역은 지금 영역 값에서 시작한다
      targetLength: { ...cs.targetLength }, lengthMode: cs.lengthMode, lowRecordThreshold: cs.lowRecordThreshold, lowRecordEnabled: cs.lowRecordEnabled, similarityThreshold: cs.similarityThreshold, draftPrompt: "" };
    if (a.copyRoster) { d.students = cur.students.map((s) => ({ ...s })); d.settings.classes = cur.settings.classes.map((c) => ({ ...c })); }
    const id = uuid();
    await writeAreaDoc(id, d);
    const areas = [...get().areas, { id, name: d.settings.school.subject || "영역", createdAt: nowIso() }];
    await p.saveAux("areas", areas); await p.saveAux("currentArea", id);
    set({ areas, areaId: id, doc: d, cls: d.settings.classes[0]?.class || "", selected: null, supplementQueue: [] });
  },

  async switchArea(id) {
    if (id === get().areaId) return;
    await get().flush();
    const p = await getPersist();
    const doc = (await readAreaDoc(id)) || applyGlobal(emptyDoc(), lastGlobal);
    await p.saveAux("currentArea", id);
    set({ areaId: id, doc, cls: doc.settings.classes[0]?.class || "", selected: null, supplementQueue: [] });
  },

  renameArea(id, name) {
    const n = name.trim(); if (!n) return;
    const areas = get().areas.map((a) => a.id === id ? { ...a, name: n } : a);
    set({ areas }); getPersist().then((p) => p.saveAux("areas", areas));
    if (id === get().areaId) get().setSettings((s) => ({ ...s, school: { ...s.school, subject: n } }));
    else readAreaDoc(id).then((d) => { if (d) { d.settings.school.subject = n; writeAreaDoc(id, d); } });
  },

  async deleteArea(id) {
    const areas = get().areas.filter((a) => a.id !== id);
    if (!areas.length) return;
    const p = await getPersist();
    if (id === DEFAULT_AREA) await p.save(emptyDoc()); else await p.saveAux(`doc:${id}`, null);
    await p.saveAux("areas", areas);
    set({ areas });
    if (id === get().areaId) { const next = areas[0].id; useStore.setState({ areaId: "" }); await get().switchArea(next); }
  },

  async areaStats() {
    await get().flush();
    const out: AreaStats[] = [];
    for (const a of get().areas) {
      const d = a.id === get().areaId ? get().doc : await readAreaDoc(a.id);
      out.push({ id: a.id, name: a.name, students: d?.students.length || 0, records: d?.records.length || 0, drafts: d?.drafts.filter((x) => x.text).length || 0, performances: d?.performances.length || 0 });
    }
    return out;
  },

  async exportAll() {
    await get().flush();
    const areas: MultiBackup["areas"] = [];
    for (const a of get().areas) {
      const d = a.id === get().areaId ? structuredClone(get().doc) : await readAreaDoc(a.id);
      if (!d) continue;
      d.settings.ai = { ...d.settings.ai, apiKey: "" };
      areas.push({ meta: a, doc: d });
    }
    const g = lastGlobal ? { ...lastGlobal, ai: { ...lastGlobal.ai, apiKey: "" } } : null;
    return { format: "nuga-multi", version: 1, exportedAt: nowIso(), global: g, currentArea: get().areaId, areas };
  },

  async importAll(b) {
    if (b.format !== "nuga-multi" || !Array.isArray(b.areas) || !b.areas.length) throw new Error("모든 영역 백업 형식이 아님");
    await get().flush();
    const p = await getPersist();
    for (const a of get().areas) if (!b.areas.some((x) => x.meta.id === a.id)) { if (a.id === DEFAULT_AREA) await p.save(emptyDoc()); else await p.saveAux(`doc:${a.id}`, null); }
    const keepKey = lastGlobal?.ai.apiKey || "";
    for (const { meta, doc } of b.areas) await writeAreaDoc(meta.id, normalizeDoc(doc));
    if (b.global) { lastGlobal = { ...b.global, ai: { ...b.global.ai, apiKey: b.global.ai.apiKey || keepKey } }; await p.saveAux("global", lastGlobal); }
    const areas = b.areas.map((x) => x.meta);
    await p.saveAux("areas", areas);
    const target = areas.some((a) => a.id === b.currentArea) ? b.currentArea : areas[0].id;
    const doc = (await readAreaDoc(target)) || emptyDoc();
    await p.saveAux("currentArea", target);
    set({ areas, areaId: target, doc, cls: doc.settings.classes[0]?.class || "", selected: null, supplementQueue: [] });
  },

  async resetEverything() {
    if (saveTimer) clearTimeout(saveTimer); pendingSave = null;
    const p = await getPersist();
    for (const a of get().areas) { if (a.id === DEFAULT_AREA) continue; await p.saveAux(`doc:${a.id}`, null); }
    const d = emptyDoc();
    await p.save(d);
    const areas: AreaMeta[] = [{ id: DEFAULT_AREA, name: "영역 1", createdAt: nowIso() }];
    lastGlobal = null;
    await p.saveAux("global", null); await p.saveAux("areas", areas); await p.saveAux("currentArea", DEFAULT_AREA);
    await p.saveAux("outbox", { messages: [], tombstones: [] });
    set({ areas, areaId: DEFAULT_AREA, doc: d, cls: "", page: "settings", settingsTab: "subject", selected: null, supplementQueue: [], outbox: { messages: [], tombstones: [] } });
  },

  update(mut, opts) {
    const doc = structuredClone(get().doc);
    mut(doc);
    set({ doc });
    if (!opts?.silent) scheduleSave(doc, get().outbox);
  },
  setPage: (page) => set({ page }),
  setClass: (cls) => set({ cls }),
  setMode2p: (mode2p) => set({ mode2p }),
  select: (selected) => set({ selected }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setView(p) { const view = { ...get().view, ...p }; set({ view }); try { localStorage.setItem("nuga.view", JSON.stringify(view)); } catch { /* 보기 설정 저장 실패는 무시 */ } },
  toast(t) {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.ttl ?? 5000);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openSupplement: (ids) => set({ supplementQueue: ids }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  queueMessage(m) {
    const outbox = { ...get().outbox, messages: [...get().outbox.messages, m] };
    set({ outbox }); scheduleSave(get().doc, outbox);
  },
  drainOutbox() {
    const o = get().outbox;
    const empty = { messages: [], tombstones: [] };
    set({ outbox: empty }); scheduleSave(get().doc, empty);
    return o;
  },

  addRecord(r) {
    const now = nowIso();
    const rec: NugaRecord = { ...r, id: uuid(), createdAt: now, updatedAt: now };
    get().update((d) => { d.records.push(rec); });
    return rec;
  },
  updateRecord(id, patch) {
    get().update((d) => {
      const r = d.records.find((x) => x.id === id); if (!r) return;
      Object.assign(r, patch, { updatedAt: nowIso() });
    });
    const r = get().doc.records.find((x) => x.id === id);
    if (r) get().queueMessage({ v: 1, type: "records", deviceId: get().deviceId, sentAt: nowIso(), payload: [r] });
  },
  deleteRecord(id) {
    get().update((d) => { d.records = d.records.filter((x) => x.id !== id); });
    const outbox = { ...get().outbox, tombstones: [...get().outbox.tombstones, { id, deletedAt: nowIso() }] };
    set({ outbox }); scheduleSave(get().doc, outbox);
  },
  setStudents(students) {
    get().update((d) => {
      d.students = students;
      const sizes = new Map<string, number>();
      for (const s of students) sizes.set(s.class, Math.max(sizes.get(s.class) || 0, s.no));
      const existing = new Map(d.settings.classes.map((c) => [c.class, c]));
      d.settings.classes = [...sizes.entries()].map(([cls, size]) => ({ class: cls, size: Math.max(size, existing.get(cls)?.size || 0) })).sort((a, b) => classSortKey(a.class) - classSortKey(b.class));
    });
    if (!get().cls || !get().doc.settings.classes.some((c) => c.class === get().cls)) set({ cls: get().doc.settings.classes[0]?.class || "" });
  },
  editStudent(cls, oldNo, patch) {
    const d0 = get().doc;
    const cur = d0.students.find((x) => x.class === cls && x.no === oldNo);
    if (!cur) return { ok: false, message: "학생을 찾을 수 없음" };
    const newNo = patch.no ?? oldNo;
    if (!Number.isInteger(newNo) || newNo < 1) return { ok: false, message: "번호는 1 이상의 정수" };
    if (newNo !== oldNo && d0.students.some((x) => x.class === cls && x.no === newNo)) return { ok: false, message: `${cls} ${newNo}번은 이미 있음` };
    const name = (patch.name ?? cur.name).trim() || cur.name;
    const next: Student = { ...cur, name, level: patch.level ?? cur.level, no: newNo };
    const moved: NugaRecord[] = [];
    get().update((d) => {
      d.students = d.students.map((x) => (x.class === cls && x.no === oldNo ? next : x)).sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || a.no - b.no);
      if (newNo !== oldNo) {
        const t = nowIso();
        for (const r of d.records) if (r.class === cls && r.no === oldNo) { r.no = newNo; r.updatedAt = t; moved.push({ ...r }); }
        for (const x of d.drafts) if (x.class === cls && x.no === oldNo) x.no = newNo;
        for (const x of d.performances) if (x.class === cls && x.no === oldNo) x.no = newNo;
        d.settings.classes = d.settings.classes.map((c) => (c.class === cls ? { ...c, size: Math.max(c.size, newNo) } : c));
      }
    });
    if (moved.length) get().queueMessage({ v: 1, type: "records", deviceId: get().deviceId, sentAt: nowIso(), payload: moved });
    const sel = get().selected;
    if (sel && sel.class === cls && sel.no === oldNo) set({ selected: { class: cls, no: newNo } });
    return { ok: true, student: next };
  },
  upsertStudent(s) {
    const students = get().doc.students.filter((x) => !(x.class === s.class && x.no === s.no));
    get().setStudents([...students, s].sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || a.no - b.no));
  },
  removeStudent(cls, no) {
    get().update((d) => { d.students = d.students.filter((x) => !(x.class === cls && x.no === no)); });
  },
  setSettings(patch) {
    get().update((d) => { d.settings = typeof patch === "function" ? patch(d.settings) : { ...d.settings, ...patch }; });
  },
  saveDraft(dr) {
    get().update((d) => {
      const i = d.drafts.findIndex((x) => x.class === dr.class && x.no === dr.no && x.field === dr.field);
      const v = { ...dr, updatedAt: nowIso() };
      if (i >= 0) d.drafts[i] = v; else d.drafts.push(v);
    });
  },
  deleteDraft(cls, no) { get().update((d) => { d.drafts = d.drafts.filter((x) => !(x.class === cls && x.no === no)); }); },
  addPerformance(p) {
    const perf: Performance = { ...p, id: uuid() };
    get().update((d) => { d.performances.push(perf); });
    return perf;
  },
  removePerformance(id) { get().update((d) => { d.performances = d.performances.filter((x) => x.id !== id); }); },
  loadSample() {
    const cur = get().doc;
    const sample = applyGlobal(makeSampleDoc(), lastGlobal ?? pickGlobal(cur, null));
    if (!sample.settings.supplementEnabled) for (const r of sample.records) if (r.status === "pending") r.status = "confirmed";
    set({ doc: sample, cls: sample.settings.classes[0].class, page: "records" });
    scheduleSave(sample, get().outbox);
  },
  replaceDoc(d) {
    set({ doc: d, cls: d.settings.classes[0]?.class || "" });
    scheduleSave(d, get().outbox);
  },
  resetAll() {
    const d = emptyDoc();
    set({ doc: d, cls: "", page: "settings", selected: null, outbox: { messages: [], tombstones: [] } });
    scheduleSave(d, { messages: [], tombstones: [] });
  },
}));

/* ---------- selectors / helpers ---------- */

export function classList(doc: NugaDoc): string[] {
  const set = new Set<string>(doc.settings.classes.map((c) => c.class));
  for (const s of doc.students) set.add(s.class);
  return [...set].sort((a, b) => classSortKey(a) - classSortKey(b));
}

export function studentsOf(doc: NugaDoc, cls: string): Student[] {
  return doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no);
}

export function recordsOf(doc: NugaDoc, cls: string, no: number): NugaRecord[] {
  return doc.records.filter((r) => r.class === cls && r.no === no).sort((a, b) => b.time.localeCompare(a.time));
}

export function perfsOf(doc: NugaDoc, cls: string, no: number): Performance[] {
  return doc.performances.filter((p) => p.class === cls && p.no === no);
}

export function draftOf(doc: NugaDoc, cls: string, no: number, field = "세특"): Draft | undefined {
  return doc.drafts.find((d) => d.class === cls && d.no === no && d.field === field);
}

export function studentName(doc: NugaDoc, cls: string, no: number): string {
  return doc.students.find((s) => s.class === cls && s.no === no)?.name || `${no}번`;
}

export function catLabel(doc: NugaDoc, c: Category): string {
  return doc.settings.categories.find((x) => x.key === c)?.label || String(c);
}

export function catCounts(records: NugaRecord[]): Record<Category, number> {
  const out: Record<Category, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of records) out[r.category]++;
  return out;
}

export function fillLesson(doc: NugaDoc, r: NugaRecord): NugaRecord {
  return r.lesson ? r : { ...r, lesson: lessonFor(doc.settings.progress, r.class, r.time) };
}

export function isLowRecord(doc: NugaDoc, cls: string, no: number): boolean {
  if (!doc.settings.lowRecordEnabled) return false;
  return recordsOf(doc, cls, no).filter((r) => r.status !== "skipped").length <= doc.settings.lowRecordThreshold;
}
