import { create } from "zustand";
import {
  emptyDoc, nowIso, uuid, classSortKey, lessonFor, makeSampleDoc,
  type Category, type Draft, type NugaDoc, type NugaRecord, type Performance, type Settings, type Student, type SyncMessage, type Tombstone,
} from "@nuga/core";
import { getPersist } from "./lib/persist";

export type Page = "records" | "draft" | "review" | "settings";
export interface Toast { id: number; text: string; kind?: "notice" | "dark"; action?: { label: string; onClick: () => void }; onClick?: () => void; ttl?: number }

export interface Outbox { messages: SyncMessage[]; tombstones: Tombstone[] }

interface State {
  doc: NugaDoc;
  loaded: boolean;
  page: Page;
  cls: string;
  mode2p: "individual" | "batch";
  selected: { class: string; no: number } | null;
  settingsTab: string;
  toasts: Toast[];
  supplementQueue: string[];
  syncStatus: { state: "off" | "idle" | "busy" | "error"; message: string; lastAt?: string };
  outbox: Outbox;
  deviceId: string;

  init(): Promise<void>;
  update(mut: (d: NugaDoc) => void, opts?: { silent?: boolean }): void;
  setPage(p: Page): void;
  setClass(c: string): void;
  setMode2p(m: "individual" | "batch"): void;
  select(s: { class: string; no: number } | null): void;
  setSettingsTab(t: string): void;
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
function scheduleSave(doc: NugaDoc, outbox: Outbox) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const p = await getPersist();
    await p.save(doc);
    await p.saveAux("outbox", outbox);
  }, 250);
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  doc: emptyDoc(),
  loaded: false,
  page: "records",
  cls: "",
  mode2p: "individual",
  selected: null,
  settingsTab: "subject",
  toasts: [],
  supplementQueue: [],
  syncStatus: { state: "off", message: "연결 안 됨" },
  outbox: { messages: [], tombstones: [] },
  deviceId: "",

  async init() {
    const p = await getPersist();
    const doc = (await p.load()) || emptyDoc();
    // 이전 버전 호환: 누락 필드 보정
    const base = emptyDoc();
    doc.settings = { ...base.settings, ...doc.settings, options: { ...base.settings.options, ...(doc.settings.options || {}) }, ai: { ...base.settings.ai, ...(doc.settings.ai || {}) } };
    const outbox = (await p.loadAux<Outbox>("outbox")) || { messages: [], tombstones: [] };
    let deviceId = (await p.loadAux<string>("deviceId")) || "";
    if (!deviceId) { deviceId = uuid(); await p.saveAux("deviceId", deviceId); }
    const classes = [...doc.settings.classes].sort((a, b) => classSortKey(a.class) - classSortKey(b.class));
    set({ doc, loaded: true, outbox, deviceId, cls: classes[0]?.class || "", page: doc.settings.onboarded ? "records" : "settings" });
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
    const sample = makeSampleDoc();
    const cur = get().doc;
    sample.settings.sync = cur.settings.sync; sample.settings.ai = cur.settings.ai;
    sample.settings.lowRecordEnabled = cur.settings.lowRecordEnabled; sample.settings.supplementEnabled = cur.settings.supplementEnabled;
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
