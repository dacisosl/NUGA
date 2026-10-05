import { create } from "zustand";
import {
  emptyDoc, nowIso, uuid, classSortKey, lessonFor, makeSampleDoc, migrateDoc, estimateAchievement, migrateStudent, clampScore, LEGACY_LEVEL_SCORE, lengthIn, presetLimitIn, schoolStyle, defaultGuideFor, checkAdherence,
  type Achievement, type Category, type Standard, type Draft, type NugaDoc, type NugaRecord, type Performance, type Settings, type Student, type SyncMessage, type Tombstone,
} from "@nuga/core";
import { getPersist } from "./lib/persist";
import { hasKey, loadSecrets, setKey, setWebRemember } from "./lib/secrets";
import { isTauri } from "./lib/platform";

/** 화면: 현황판(main) · 생기부 생성(draft, 검토 포함) · 설정 · 모바일 확인. today·records·review 는 옛 이름(→ main / draft) */
export type Page = "main" | "today" | "records" | "draft" | "review" | "settings" | "mobile";
export interface Toast { id: number; text: string; kind?: "notice" | "dark"; action?: { label: string; onClick: () => void }; onClick?: () => void; ttl?: number }

/** 알림 모달(쉬는 시간 기록). records = 수동 1차 기록 id, transcripts = 자동 추천이 붙은 수업 스크립트 id, backlog = 미반영 전체 보기 */
export interface Inbox { records: string[]; transcripts: string[]; backlog: boolean }

export interface Outbox { messages: SyncMessage[]; tombstones: Tombstone[] }

/** 영역 = 독립 문서(명단·기록·초안·시간표). 동기화·AI·표시 옵션은 모든 영역이 공유한다. */
export interface AreaMeta { id: string; name: string; createdAt: string }
/** 공통 설정: 모든 영역이 같은 값을 쓴다 (동기화·AI·표시 옵션·보완 대기). 글자수·기준과 초안 프롬프트는 영역별. */
export interface GlobalSettings { sync: Settings["sync"]; ai: Settings["ai"]; options: Settings["options"]; supplementEnabled: boolean; arrivalMode?: Settings["arrivalMode"]; recording?: Settings["recording"] }
let lastGlobal: GlobalSettings | null = null;
export interface AreaStats { id: string; name: string; students: number; records: number; drafts: number; performances: number }
export interface MultiBackup { format: "nuga-multi"; version: 1; exportedAt: string; global: GlobalSettings | null; currentArea: string; areas: { meta: AreaMeta; doc: NugaDoc }[] }

const DEFAULT_AREA = "default";
function normalizeDoc(doc: NugaDoc): NugaDoc {
  const base = emptyDoc();
  // 0.2.0 이하 문서는 lengthMode·lengthBand 가 없을 수 있다. 옛 문서의 기본 단위는 '공백 포함 글자'였다.
  const legacy = { lengthMode: "withSpaces" as const };
  doc.settings = { ...base.settings, ...legacy, ...doc.settings, options: { ...base.settings.options, ...(doc.settings.options || {}) }, ai: { ...base.settings.ai, ...(doc.settings.ai || {}) } };
  fixArrival(doc.settings);
  return migrateDoc(doc);
}
/**
 * 0.6.6 이전 문서에는 arrivalMode 가 없다. 교사 요청에 따라 기본은 '알림 팝업으로 먼저 확인'.
 * popup·queue 는 보완 대기를 켜고, direct 는 끈다.
 */
function fixArrival(s: Settings) {
  if (!s.arrivalMode) s.arrivalMode = "popup";
  s.supplementEnabled = s.arrivalMode !== "direct";
}
export function arrivalModeOf(s: Pick<Settings, "arrivalMode">): NonNullable<Settings["arrivalMode"]> { return s.arrivalMode || "popup"; }
function pickGlobal(doc: NugaDoc, _prev: GlobalSettings | null): GlobalSettings {
  const s = doc.settings;
  return { sync: s.sync, ai: { ...s.ai, apiKey: "" }, options: s.options, supplementEnabled: s.supplementEnabled, arrivalMode: s.arrivalMode, recording: s.recording };
}
function applyGlobal(doc: NugaDoc, g: GlobalSettings | null): NugaDoc {
  if (!g) return doc;
  doc.settings = { ...doc.settings, sync: g.sync, ai: g.ai, options: g.options, supplementEnabled: g.supplementEnabled ?? doc.settings.supplementEnabled, arrivalMode: g.arrivalMode, recording: g.recording ?? doc.settings.recording };
  fixArrival(doc.settings);
  return doc;
}
export function currentGlobal(): GlobalSettings | null { return lastGlobal; }
export async function readAreaDoc(id: string): Promise<NugaDoc | null> {
  const p = await getPersist();
  const raw = id === DEFAULT_AREA ? await p.load() : await p.loadAux<NugaDoc>(`doc:${id}`);
  if (!raw) return null;
  return applyGlobal(normalizeDoc(raw), lastGlobal ?? (await p.loadAux<GlobalSettings>("global")));
}
export async function writeAreaDoc(id: string, doc0: NugaDoc): Promise<void> {
  const p = await getPersist();
  // API 키는 문서 파일에 쓰지 않는다 (보안 저장소에만)
  const doc = doc0.settings.ai.apiKey ? { ...doc0, settings: { ...doc0.settings, ai: { ...doc0.settings.ai, apiKey: "" } } } : doc0;
  if (id === DEFAULT_AREA) await p.save(doc); else await p.saveAux(`doc:${id}`, doc);
}

interface State {
  doc: NugaDoc;
  areas: AreaMeta[];
  areaId: string;
  loaded: boolean;
  page: Page;
  cls: string;
  mode2p: "individual" | "batch" | "review";
  selected: { class: string; no: number } | null;
  settingsTab: string;
  /** 다른 페이지에서 누가기록 필터를 정해 들어올 때 (예: 오늘 → 이번 주 0건) */
  recordsFilter: string | null;
  setRecordsFilter(f: string | null): void;
  /** 초안 보기: 한 문장씩 · 구별하기(형광펜). 이 기기에만 저장 */
  view: { split: boolean; highlight: boolean };
  toasts: Toast[];
  inbox: Inbox | null;
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
  setMode2p(m: "individual" | "batch" | "review"): void;
  select(s: { class: string; no: number } | null): void;
  setSettingsTab(t: string): void;
  setView(p: Partial<{ split: boolean; highlight: boolean }>): void;
  toast(t: Omit<Toast, "id">): number;
  dismissToast(id: number): void;
  /** 수동 기록 id 로 알림 모달 열기 (이미 열려 있으면 합친다) */
  openSupplement(ids: string[]): void;
  openInbox(p: Partial<Inbox>): void;
  closeInbox(): void;
  setSyncStatus(s: State["syncStatus"]): void;
  queueMessage(m: SyncMessage): void;
  drainOutbox(): Outbox;

  // domain actions
  addRecord(r: Omit<NugaRecord, "id" | "createdAt" | "updatedAt">): NugaRecord;
  updateRecord(id: string, patch: Partial<NugaRecord>): void;
  deleteRecord(id: string): void;
  setStudents(students: Student[]): void;
  upsertStudent(s: Student): void;
  editStudent(cls: string, oldNo: number, patch: { no?: number; name?: string; manual?: number | null }): { ok: boolean; message?: string; student?: Student };
  /** 도달 정도 교사 조정값 (null = 자동값으로 되돌리기) */
  setAchievement(cls: string, no: number, manual: number | null): void;
  /** AI 추정 자동값 저장 (교사 조정값은 그대로) */
  setAutoAchievement(cls: string, no: number, auto: { value: number | null; confidence: Achievement["confidence"]; byStandard: Record<string, number> }): void;
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
  page: "main",
  cls: "",
  mode2p: "individual",
  selected: null,
  settingsTab: "subject",
  view: (() => { try { return { split: false, highlight: false, ...JSON.parse(localStorage.getItem("nuga.view") || "{}") }; } catch { return { split: false, highlight: false }; } })(),
  toasts: [],
  inbox: null,
  syncStatus: { state: "off", message: "연결 안 됨" },
  recordsFilter: null,
  setRecordsFilter: (f) => set({ recordsFilter: f }),
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
    await loadSecrets();
    const doc = (await readAreaDoc(areaId)) || applyGlobal(emptyDoc(), lastGlobal);
    // 0.2.0 이하: 문서에 저장돼 있던 Claude API 키를 보안 저장소로 옮기고 문서에서 지운다
    let movedKey = false;
    const legacyKey = (lastGlobal?.ai.apiKey || doc.settings.ai.apiKey || "").trim();
    if (legacyKey) {
      try {
        // 웹 버전에서 키를 계속 기억하던 사용자는 그대로 기억하게 둔다 (설정 → AI 에서 끌 수 있음)
        if (!isTauri) setWebRemember(true);
        if (!hasKey("anthropic")) await setKey("anthropic", legacyKey);
        movedKey = true;
      } catch { /* 옮기지 못하면 다음 실행 때 다시 시도 */ }
    }
    const outbox = (await p.loadAux<Outbox>("outbox")) || { messages: [], tombstones: [] };
    let deviceId = (await p.loadAux<string>("deviceId")) || "";
    if (!deviceId) { deviceId = uuid(); await p.saveAux("deviceId", deviceId); }
    const classes = [...doc.settings.classes].sort((a, b) => classSortKey(a.class) - classSortKey(b.class));
    set({ doc, loaded: true, outbox, deviceId, cls: classes[0]?.class || "", page: doc.settings.onboarded ? "main" : "settings" });
    if (movedKey) get().setSettings((x) => ({ ...x, ai: { ...x.ai, apiKey: "" } }));
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
      targetLength: { ...cs.targetLength }, lengthMode: cs.lengthMode, lengthBand: cs.lengthBand, lengthCustom: cs.lengthCustom, schoolLevel: cs.schoolLevel, writeItem: cs.writeItem, lowRecordThreshold: cs.lowRecordThreshold, lowRecordEnabled: cs.lowRecordEnabled, similarityThreshold: cs.similarityThreshold, draftPrompt: "" };
    if (a.copyRoster) { d.students = cur.students.map((s) => ({ ...s })); d.settings.classes = cur.settings.classes.map((c) => ({ ...c })); }
    const id = uuid();
    await writeAreaDoc(id, d);
    const areas = [...get().areas, { id, name: d.settings.school.subject || "영역", createdAt: nowIso() }];
    await p.saveAux("areas", areas); await p.saveAux("currentArea", id);
    set({ areas, areaId: id, doc: d, cls: d.settings.classes[0]?.class || "", selected: null, inbox: null });
  },

  async switchArea(id) {
    if (id === get().areaId) return;
    await get().flush();
    const p = await getPersist();
    const doc = (await readAreaDoc(id)) || applyGlobal(emptyDoc(), lastGlobal);
    await p.saveAux("currentArea", id);
    set({ areaId: id, doc, cls: doc.settings.classes[0]?.class || "", selected: null, inbox: null });
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
    set({ areas, areaId: target, doc, cls: doc.settings.classes[0]?.class || "", selected: null, inbox: null });
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
    set({ areas, areaId: DEFAULT_AREA, doc: d, cls: "", page: "settings", settingsTab: "subject", selected: null, inbox: null, outbox: { messages: [], tombstones: [] } });
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
  openSupplement: (ids) => (ids.length ? get().openInbox({ records: ids }) : set({ inbox: null })),
  openInbox(p) {
    const cur = get().inbox;
    const uniq = (a: string[]) => [...new Set(a)];
    set({ inbox: {
      records: uniq([...(cur?.records || []), ...(p.records || [])]),
      transcripts: uniq([...(cur?.transcripts || []), ...(p.transcripts || [])]),
      backlog: p.backlog ?? cur?.backlog ?? false,
    } });
  },
  closeInbox: () => set({ inbox: null }),
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
    const base = migrateStudent(cur);
    const next: Student = { ...base, name, no: newNo, ...(patch.manual !== undefined ? { achievement: withManual(base.achievement, patch.manual) } : {}) };
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
  setAchievement(cls, no, manual) {
    get().update((d) => {
      d.students = d.students.map((x) => (x.class === cls && x.no === no ? { ...migrateStudent(x), achievement: withManual(migrateStudent(x).achievement, manual) } : x));
    });
  },
  setAutoAchievement(cls, no, a) {
    get().update((d) => {
      d.students = d.students.map((x) => {
        if (x.class !== cls || x.no !== no) return x;
        const m = migrateStudent(x);
        return { ...m, achievement: { auto: a.value, manual: m.achievement?.manual ?? null, confidence: a.confidence, byStandard: a.byStandard, updatedAt: nowIso() } };
      });
    });
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
    // 보완을 쓰지 않으면 수동 기록을 완료로 바꾸고 메모를 관찰 내용으로 옮긴다
    if (!sample.settings.supplementEnabled) for (const r of sample.records) if (r.status === "pending") { r.status = "confirmed"; r.note = r.note || r.memo || r.voiceMemo?.transcript || ""; }
    set({ doc: sample, cls: sample.settings.classes[0].class, page: "main" });
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

export function catLabel(doc: NugaDoc, c: Category | 0): string {
  if (!c) return "미정";
  return doc.settings.categories.find((x) => x.key === c)?.label || String(c);
}

export function catCounts(records: NugaRecord[]): Record<Category, number> {
  const out: Record<Category, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of records) if (r.category) out[r.category]++;
  return out;
}

export function fillLesson(doc: NugaDoc, r: NugaRecord): NugaRecord {
  return r.lesson ? r : { ...r, lesson: lessonFor(doc.settings.progress, r.class, r.time) };
}

export function isLowRecord(doc: NugaDoc, cls: string, no: number): boolean {
  if (!doc.settings.lowRecordEnabled) return false;
  return recordsOf(doc, cls, no).filter((r) => r.status !== "skipped").length <= doc.settings.lowRecordThreshold;
}

/* ---------- 도달 정도 ---------- */

function withManual(a: Achievement | undefined, manual: number | null): Achievement {
  return { auto: a?.auto ?? null, manual: manual === null ? null : clampScore(manual), confidence: a?.confidence ?? "none", byStandard: a?.byStandard, updatedAt: nowIso() };
}

export interface AchievementView {
  /** 최종값 (교사 조정값 → 자동값) */
  value: number | null;
  auto: number | null;
  manual: number | null;
  confidence: Achievement["confidence"];
  edited: boolean;
}

/** 학생의 도달 정도. 자동값은 기록으로 바로 계산한다 (AI 추정값이 저장돼 있으면 그 값). */
export function achievementOf(doc: NugaDoc, s: Pick<Student, "class" | "no" | "achievement" | "level">): AchievementView {
  const a = s.achievement;
  const manual = a?.manual ?? (s.level ? LEGACY_LEVEL_SCORE[s.level] : null);
  let auto = a?.auto ?? null; let confidence: Achievement["confidence"] = a?.confidence ?? "none";
  if (auto === null) {
    const est = estimateAchievement(doc.records.filter((r) => r.class === s.class && r.no === s.no), doc.performances.filter((p) => p.class === s.class && p.no === s.no));
    auto = est.value; confidence = est.confidence;
  }
  return { value: manual ?? auto, auto, manual, confidence: manual !== null && confidence === "none" ? "ok" : confidence, edited: manual !== null };
}

/* ---------- 글자수(바이트)·검토 기준 ---------- */

/** 이 영역의 한도 (단위는 lengthMode) */
export function limitOf(doc: NugaDoc): number {
  return doc.settings.targetLength["세특"] || presetLimitIn(doc.settings.writeItem || "setuk", doc.settings.lengthMode);
}
export function lengthOfText(doc: NugaDoc, text: string): number { return lengthIn(text, doc.settings.lengthMode); }
export function unitOf(doc: NugaDoc): string { return doc.settings.lengthMode === "bytes" ? "B" : "자"; }
/** 학교급 프리셋의 추가 금지어 */
export function schoolForbidden(doc: NugaDoc): string[] { return schoolStyle(doc.settings.schoolLevel).forbidden.flatMap((g) => g.terms); }
/** 검토 기준 (도달 정도·한도·목표 구간·금지어) */
export function reviewCtxOf(doc: NugaDoc, s: Student, target: number, recordCount: number, otherDrafts: { text: string; label: string }[]) {
  return {
    target, lengthMode: doc.settings.lengthMode, lengthBand: doc.settings.lengthBand, achievement: achievementOf(doc, s).value,
    recordCount, lowRecordThreshold: doc.settings.lowRecordThreshold, otherDrafts, similarityThreshold: doc.settings.similarityThreshold,
    studentName: s.name, extraForbidden: schoolForbidden(doc),
  };
}

/** 이 영역의 초안 지침 (직접 쓴 프롬프트 → 작성 항목 기본 양식) */
export function guideOf(doc: NugaDoc): string { return doc.settings.draftPrompt.trim() || defaultGuideFor(doc.settings.writeItem); }

/* ---------- 반영도·성취기준 ---------- */

const hasNote = (r: NugaRecord) => !!(r.note || r.memo || r.voiceMemo?.transcript || "").trim();

/** 학생의 근거 후보(기록·PDF기록) 내용과 카테고리 */
export function evidenceOf(doc: NugaDoc, s: Pick<Student, "class" | "no">): { evidence: Record<string, string>; evidenceCategory: Record<string, string> } {
  const evidence: Record<string, string> = {}; const evidenceCategory: Record<string, string> = {};
  for (const r of doc.records) {
    if (r.class !== s.class || r.no !== s.no || r.status === "skipped" || !hasNote(r)) continue;
    evidence[r.id] = (r.note || r.memo || r.voiceMemo?.transcript || "").trim();
    evidenceCategory[r.id] = catLabel(doc, r.category);
  }
  for (const p of doc.performances) {
    if (p.class !== s.class || p.no !== s.no) continue;
    evidence[p.id] = `${p.title} ${p.excerpt || ""} ${p.ocrText.slice(0, 600)}`;
    evidenceCategory[p.id] = "PDF기록";
  }
  return { evidence, evidenceCategory };
}

/** 초안 반영도 점검 */
export function adherenceOf(doc: NugaDoc, s: Student, text: string, sentences: Draft["sentences"] | null, limit: number) {
  return checkAdherence({
    text, sentences, ...evidenceOf(doc, s), lengthMode: doc.settings.lengthMode, limit, band: doc.settings.lengthBand,
    achievement: achievementOf(doc, s).value, guide: doc.settings.guide, extraForbidden: schoolForbidden(doc), studentName: s.name,
  });
}

/** 기록이 걸린 수업(진도표)의 성취기준 */
export function standardsFor(doc: NugaDoc, records: NugaRecord[]): Standard[] {
  const list = doc.settings.standards || [];
  if (!list.length) return [];
  const codes = new Set<string>();
  for (const r of records) {
    const day = r.time.slice(0, 10);
    const row = doc.settings.progress.find((p) => p.class === r.class && p.date === day) ||
      doc.settings.progress.filter((p) => p.class === r.class && p.date <= day && (p.standards?.length ?? 0) > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    for (const c of row?.standards || []) codes.add(c);
  }
  return list.filter((x) => codes.has(x.code));
}
