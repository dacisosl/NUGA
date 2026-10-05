import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  WEEKDAY_LABELS, DEFAULT_DRAFT_GUIDE, DRAFT_OUTPUT_RULES, DRAFT_PROMPT_PRESETS, isBlankProgress, syncProgressSkeleton, buildDraftRequest, buildPairingUri, classSortKey, decryptBackup, encryptBackup, generateSyncKey, keyIdOf, nowIso, parseImportJson, progressFromRows, studentsFromRows, toB64, toExportJson,
  LEGACY_LEVEL_SCORE, LENGTH_PRESET, defaultGuideFor, PROVIDER_INFO, PROVIDER_ORDER, DEFAULT_LOCAL_URL, SCHOOL_PRESETS, WRITE_ITEM_LABEL, WRITE_ITEM_PROMPT, applySchoolPreset, clampScore, presetLimitIn, schoolStyle,
  type AiProvider, type BackupContainer, type Level, type LengthMode, type ProgressRow, type SchoolLevel, type Student, type WriteItem,
} from "@nuga/core";
import { Sheet, TopBar } from "../App";
import { achievementOf, classList, guideOf, limitOf, perfsOf, recordsOf, useStore, type AreaStats, type MultiBackup, arrivalModeOf } from "../store";
import { ACH_COLORS, Confirm, EditableCell, Icon, Modal, StudentTag, Switch } from "../components/ui";
import { AreaModal } from "../components/AreaSwitcher";
import { exportSheets, readSheetRows, templateProgress, templateStudents } from "../lib/excel";
import { pickFile, readFileAsText, saveFile, hostName, openExternal } from "../lib/platform";
import { aiLabel, aiReady, previewPayload } from "../lib/ai";
import { modelOf, testProvider } from "../lib/providers";
import { hasKey, keyStoreLabel, onSecretsChange, setKey, setWebRemember, webRemember } from "../lib/secrets";
import { isTauri } from "../lib/platform";
import { syncEngine } from "../lib/syncEngine";
import { RecordingSection } from "./RecordingSettings";
import { ModelCompare } from "../components/ModelCompare";
import { LocalLlmCard } from "../components/LocalLlm";
import { StandardsSection } from "./StandardsSettings";

/** 공통 설정: 모든 영역이 같은 값을 따른다 */
const COMMON_TABS: { key: string; label: string }[] = [
  { key: "display", label: "화면" }, { key: "sync", label: "동기화" }, { key: "backup", label: "백업" }, { key: "ai", label: "AI" }, { key: "recording", label: "녹음" },
  { key: "data", label: "데이터" }, { key: "privacy", label: "개인정보 처리방침" },
];
/** 개별 설정: 지금 열린 영역에만 적용된다 */
const AREA_TABS: { key: string; label: string }[] = [
  { key: "subject", label: "영역" }, { key: "roster", label: "반·명단" }, { key: "timetable", label: "시간표" },
  { key: "progress", label: "진도" }, { key: "category", label: "카테고리" }, { key: "length", label: "항목·분량" }, { key: "standards", label: "성취기준·지침" },
  { key: "prompt", label: "초안 프롬프트" },
];

export function SettingsPage() {
  const tab = useStore((s) => s.settingsTab);
  const setTab = useStore((s) => s.setSettingsTab);
  const areaName = useStore((s) => s.doc.settings.school.subject) || "현재 영역";
  const draftPrompt = useStore((s) => s.doc.settings.draftPrompt) || "";
  const group: "common" | "area" = COMMON_TABS.some((t) => t.key === tab) ? "common" : "area";
  const tabs = group === "common" ? COMMON_TABS : AREA_TABS;
  return (
    <>
      <TopBar title="설정" />
      <Sheet>
      <div className="tabsrow">
        <button className={`tab ${group === "common" ? "active" : ""}`} onClick={() => group !== "common" && setTab(COMMON_TABS[0].key)}>공통 설정</button>
        <button className={`tab ${group === "area" ? "active" : ""}`} onClick={() => group !== "area" && setTab(AREA_TABS[0].key)}>개별 설정<span className="cnt">{areaName}</span></button>
      </div>
      <div className="content">
        <div className={`scope-note ${group}`}>
          {group === "common"
            ? <><b>모든 영역에 똑같이 적용됩니다.</b><span>글자수·기준과 초안 프롬프트는 개별 설정에서 영역마다 정합니다.</span></>
            : <><b>{areaName}에만 적용됩니다.</b><span>다른 영역은 상단 영역 배지에서 바꿔 설정하세요.</span></>}
        </div>
        <div className="settings-layout">
          <nav className="settings-nav">{tabs.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}{t.key === "prompt" && draftPrompt.trim() && <span className="tag">직접 설정</span>}</button>)}</nav>
          <div className="settings-body">
            {tab === "subject" && <SubjectSection />}
            {tab === "roster" && <RosterSection />}
            {tab === "timetable" && <TimetableSection />}
            {tab === "progress" && <ProgressSection />}
            {tab === "category" && <CategorySection />}
            {tab === "length" && <LengthSection />}
            {tab === "sync" && <SyncSection />}
            {tab === "backup" && <BackupSection />}
            {tab === "ai" && <AiSection />}
            {tab === "recording" && <RecordingSection />}
            {tab === "data" && <DataSection />}
            {tab === "privacy" && <PrivacySection />}
            {tab === "prompt" && <PromptSection />}
            {tab === "standards" && <StandardsSection />}
            {tab === "display" && <DisplaySection />}
          </div>
        </div>
      </div>
      </Sheet>
    </>
  );
}

/* ---------- 과목 ---------- */
export function SubjectSection() {
  const school = useStore((s) => s.doc.settings.school);
  const setSettings = useStore((s) => s.setSettings);
  const areas = useStore((s) => s.areas);
  const areaId = useStore((s) => s.areaId);
  const switchArea = useStore((s) => s.switchArea);
  const renameArea = useStore((s) => s.renameArea);
  const deleteArea = useStore((s) => s.deleteArea);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const up = (p: Partial<typeof school>) => setSettings((s) => ({ ...s, school: { ...s.school, ...p } }));
  return (
    <>
    <div className="card pad">
      <div className="flex between"><h3 style={{ margin: 0 }}>영역 목록 <span className="muted small">{areas.length}개</span></h3><button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} />영역 추가</button></div>
      <div className="muted small" style={{ margin: "6px 0 10px" }}>교과·동아리·행동특성처럼 명단과 기록을 따로 관리할 단위입니다. 이름을 클릭하면 바꿀 수 있습니다.</div>
      <table className="table">
        <thead><tr><th style={{ width: 40 }} /><th>영역명</th><th style={{ width: 160 }}>만든 날</th><th style={{ width: 150 }} /></tr></thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.id} className={a.id === areaId ? "selected" : ""}>
              <td className="num muted">{a.id === areaId ? "✓" : ""}</td>
              <td className="name"><EditableCell value={a.name} onSave={(v) => renameArea(a.id, v)} /></td>
              <td className="muted small num">{a.createdAt.slice(0, 10)}</td>
              <td><span className="flex" style={{ justifyContent: "flex-end" }}>{a.id !== areaId && <button className="btn sm" onClick={() => switchArea(a.id)}>열기</button>}{areas.length > 1 && <button className="btn ghost sm" style={{ color: "var(--warn)" }} onClick={() => setDel({ id: a.id, name: a.name })}>삭제</button>}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {adding && <AreaModal onClose={() => setAdding(false)} />}
    {del && <Confirm title={`영역 "${del.name}" 삭제`} body="이 영역의 명단·기록·초안·시간표가 모두 삭제됩니다. 먼저 JSON으로 내보내 두세요." okLabel="삭제" danger onOk={() => deleteArea(del.id)} onClose={() => setDel(null)} />}
    <div className="card pad">
      <h3>현재 영역</h3>
      <div className="grid2">
        <div className="field"><label>영역명 (교과·동아리·행동특성 등)</label><input value={school.subject} onChange={(e) => up({ subject: e.target.value })} placeholder="예: 화학Ⅰ / 과학탐구 동아리 / 행동특성" /><span className="muted small">모든 화면 상단에 크게 표시됩니다.</span></div>
        <div className="field"><label>학년</label><select className="select" value={school.grade} onChange={(e) => up({ grade: Number(e.target.value) })}>{[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}</select></div>
        <div className="field"><label>학년도</label><input type="number" className="num" value={school.year} onChange={(e) => up({ year: Number(e.target.value) })} /></div>
        <div className="field"><label>학기</label><select className="select" value={school.semester} onChange={(e) => up({ semester: Number(e.target.value) })}><option value={1}>1학기</option><option value={2}>2학기</option></select></div>
      </div>
    </div>
    </>
  );
}

/* ---------- 반·명단 ---------- */
export function RosterSection() {
  const doc = useStore((s) => s.doc);
  const setStudents = useStore((s) => s.setStudents);
  const upsertStudent = useStore((s) => s.upsertStudent);
  const removeStudent = useStore((s) => s.removeStudent);
  const editStudent = useStore((s) => s.editStudent);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const classes = classList(doc);
  const [cls, setCls] = useState(classes[0] || "");
  const [paste, setPaste] = useState(false);
  const [newClass, setNewClass] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  useEffect(() => { if (!classes.includes(cls)) setCls(classes[0] || ""); }, [classes.join(",")]);
  const list = doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no);

  const importExcel = async () => {
    const [f] = await pickFile(".xlsx,.xls,.csv"); if (!f) return;
    const rows = await readSheetRows(f, true);
    const st = studentsFromRows(rows, cls);
    if (!st.length) { toast({ text: "학생을 찾지 못함 (열: 반·번호·이름 또는 학번·이름)" }); return; }
    const others = doc.students.filter((s) => !st.some((n) => n.class === s.class && n.no === s.no));
    setStudents([...others, ...st].sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || a.no - b.no));
    toast({ text: `${st.length}명 가져옴` });
  };
  const addClass = () => {
    let c = newClass.trim().replace(/\s+/g, " ");
    if (!c) return;
    if (/^\d+\s*-\s*\d+$/.test(c)) c = c.split("-").map((x) => String(parseInt(x, 10))).join("-");
    setSettings((s) => ({ ...s, classes: s.classes.some((x) => x.class === c) ? s.classes : [...s.classes, { class: c, size: 0 }].sort((a, b) => classSortKey(a.class) - classSortKey(b.class)) }));
    setCls(c); setNewClass("");
  };
  const deleteClass = (c: string) => {
    setStudents(doc.students.filter((s) => s.class !== c));
    setSettings((s) => ({ ...s, classes: s.classes.filter((x) => x.class !== c), timetable: s.timetable.filter((t) => t.class !== c) }));
  };
  const addRow = () => { const no = (list[list.length - 1]?.no || 0) + 1; upsertStudent({ class: cls, no, name: "" }); };
  const setSize = (n: number) => setSettings((s) => ({ ...s, classes: s.classes.map((x) => x.class === cls ? { ...x, size: n } : x) }));
  const size = doc.settings.classes.find((c) => c.class === cls)?.size || list.length;

  return (
    <>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>반</h3><span className="flex"><input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="예: 2-3, 과학동아리" style={{ width: 160 }} onKeyDown={(e) => e.key === "Enter" && addClass()} /><button className="btn sm" onClick={addClass}><Icon name="plus" size={14} />반 추가</button></span></div>
        <div className="flex wrap" style={{ marginTop: 10 }}>
          {classes.map((c) => <button key={c} className={`chip clickable ${c === cls ? "selected" : ""} outline`} onClick={() => setCls(c)}>{c} <span className="muted">{doc.students.filter((s) => s.class === c).length}</span></button>)}
          {classes.length === 0 && <span className="muted small">반을 추가하거나 엑셀에서 명단을 가져오세요</span>}
        </div>
      </div>
      {cls && (
        <div className="card pad">
          <div className="flex between">
            <h3 style={{ margin: 0 }}>{cls} 명단 <span className="muted small">{list.length}명</span></h3>
            <span className="flex">
              <span className="small muted flex">최대 번호 <input type="number" className="num" style={{ width: 64, height: 30 }} value={size} onChange={(e) => setSize(Number(e.target.value))} /></span>
              <button className="btn sm" onClick={importExcel}><Icon name="excel" size={14} />엑셀 가져오기</button>
              <button className="btn sm" onClick={() => exportSheets("명단-양식.xlsx", [{ name: "명단", rows: templateStudents() }])}>양식</button>
              <button className="btn sm" onClick={() => setPaste(true)}>붙여넣기</button>
              <button className="btn sm" onClick={addRow}><Icon name="plus" size={14} />행</button>
              <button className="btn ghost sm" onClick={() => setConfirmDel(cls)} style={{ color: "var(--warn)" }}>반 삭제</button>
            </span>
          </div>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th style={{ width: 70 }}>번호</th><th>이름</th><th style={{ width: 150 }} title="성취기준 도달 정도 (0~100). 비우면 기록으로 자동 추정">도달 정도</th><th style={{ width: 80 }}>기록</th><th style={{ width: 50 }} /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.no} style={{ height: 44 }}>
                  <td className="tight"><NoInput value={s.no} onCommit={(no) => { const r = editStudent(s.class, s.no, { no }); if (!r.ok) toast({ text: r.message || "변경 실패" }); return r.ok; }} /></td>
                  <td className="tight"><input className="cell-edit" value={s.name} placeholder="이름" onChange={(e) => upsertStudent({ ...s, name: e.target.value })} /></td>
                  <td className="tight"><AchInput student={s} /></td>
                  <td className="num muted small">{recordsOf(doc, s.class, s.no).length}</td>
                  <td className="tight"><button className="btn ghost icon sm" onClick={() => removeStudent(s.class, s.no)}><Icon name="trash" size={14} /></button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="muted small" style={{ textAlign: "center" }}>학생 없음</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {paste && <PasteModal cls={cls} onClose={() => setPaste(false)} />}
      {confirmDel && <Confirm title={`${confirmDel} 삭제`} body="반의 명단과 시간표가 삭제됩니다. 기록은 남습니다." okLabel="삭제" danger onOk={() => deleteClass(confirmDel)} onClose={() => setConfirmDel(null)} />}
    </>
  );
}

/** 도달 정도 칸: 숫자를 넣으면 교사 조정값, 비우면 자동값(기록으로 추정) */
function AchInput({ student }: { student: Student }) {
  const doc = useStore((s) => s.doc);
  const setAchievement = useStore((s) => s.setAchievement);
  const ach = achievementOf(doc, student);
  const [v, setV] = useState(ach.manual === null ? "" : String(ach.manual));
  useEffect(() => { setV(ach.manual === null ? "" : String(ach.manual)); }, [ach.manual]);
  const commit = () => {
    const t = v.trim();
    if (!t) { if (ach.manual !== null) setAchievement(student.class, student.no, null); return; }
    const n = Number(t); if (Number.isNaN(n)) { setV(ach.manual === null ? "" : String(ach.manual)); return; }
    if (clampScore(n) !== ach.manual) setAchievement(student.class, student.no, n);
  };
  return (
    <span className="flex" style={{ gap: 6 }}>
      <input type="number" min={0} max={100} className="cell-edit num" style={{ width: 58 }} value={v} placeholder={ach.auto === null ? "—" : `자동 ${ach.auto}`}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <span className="small muted">{ach.manual === null ? (ach.confidence === "low" ? "근거 부족" : ach.confidence === "none" ? "" : "자동") : "조정"}</span>
    </span>
  );
}

/** 번호 칸: 입력 후 Enter·포커스 이동 시 반영(기록도 함께 이동). 충돌하면 원래 값으로 되돌림 */
function NoInput({ value, onCommit }: { value: number; onCommit: (no: number) => boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  const commit = () => { const n = Number(v); if (n === value) return; if (!onCommit(n)) setV(String(value)); };
  return <input type="number" className="cell-edit num" min={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); (e.target as HTMLInputElement).blur(); } }} style={{ width: 56 }} />;
}

/** 붙여넣기: 한 줄에 한 명. 이름만 있으면 번호를 차례로 매김. "3 홍길동", "3. 홍길동", "20315 홍길동", "홍길동 72"(도달 정도) 모두 인식 */
function PasteModal({ cls, onClose }: { cls: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const setStudents = useStore((s) => s.setStudents);
  const toast = useStore((s) => s.toast);
  const existing = doc.students.filter((s) => s.class === cls);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">(existing.length ? "append" : "replace");
  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const used = new Set<number>(mode === "append" ? existing.map((s) => s.no) : []);
    let next = mode === "append" ? Math.max(0, ...existing.map((s) => s.no)) + 1 : 1;
    const out: (Student & { overwrite: boolean })[] = [];
    for (const line of lines) {
      let rest = line.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
      let no: number | null = null;
      const hak = rest.match(/^(\d{4,5})[\s.,)\-]+(.+)$/);
      const num = rest.match(/^(\d{1,3})[\s.,)\-]+(.+)$/);
      if (hak) { no = parseInt(hak[1].slice(-2), 10); rest = hak[2]; }
      else if (num) { no = parseInt(num[1], 10); rest = num[2]; }
      let manual: number | null = null;
      const lv = rest.match(/[\s,]+([ABCabc]|\d{1,3})$/);
      if (lv) { const t = lv[1].toUpperCase(); manual = /\d/.test(t) ? clampScore(Number(t)) : LEGACY_LEVEL_SCORE[t as Level]; rest = rest.slice(0, lv.index).trim(); }
      const name = rest.replace(/[,]+$/, "").trim();
      if (!name) continue;
      if (!no) { while (used.has(next)) next++; no = next++; }
      const overwrite = mode === "append" && existing.some((s) => s.no === no);
      used.add(no);
      out.push({ class: cls, no, name, ...(manual !== null ? { achievement: { auto: null, manual, confidence: "ok" as const } } : {}), overwrite });
    }
    return out;
  }, [text, cls, mode, existing.length]);
  const apply = () => {
    const keep = mode === "replace" ? doc.students.filter((s) => s.class !== cls) : doc.students.filter((s) => !(s.class === cls && parsed.some((p) => p.no === s.no)));
    setStudents([...keep, ...parsed.map(({ overwrite: _o, ...s }) => s)]);
    toast({ text: `${cls} ${parsed.length}명 ${mode === "replace" ? "등록" : "추가"}` }); onClose();
  };
  const overwrites = parsed.filter((p) => p.overwrite).length;
  return (
    <Modal title={`${cls} 명단 붙여넣기`} onClose={onClose} footer={<><span className="muted small">{parsed.length}명 인식{overwrites ? ` · ${overwrites}명 덮어씀` : ""}</span><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={!parsed.length} onClick={apply}>{mode === "replace" ? "명단 등록" : "추가"}</button></>}>
      <div className="col" style={{ gap: 10 }}>
        {existing.length > 0 && (
          <span className="seg" style={{ alignSelf: "flex-start" }}>
            <button className={mode === "append" ? "active" : ""} onClick={() => setMode("append")}>기존 {existing.length}명 뒤에 이어 붙이기</button>
            <button className={mode === "replace" ? "active" : ""} onClick={() => setMode("replace")}>새 명단으로 교체</button>
          </span>
        )}
        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
          <textarea rows={14} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={"한 줄에 한 명씩 이름만 붙여넣어도 됩니다.\n김민준\n이서연\n박지우\n\n번호·도달 정도(0~100)도 가능\n12 최하은 72\n20315 정도윤"} />
          <div className="tablewrap" style={{ maxHeight: 300, border: "1px solid var(--line)" }}>
            <table className="table" style={{ border: "none" }}>
              <thead><tr><th style={{ width: 60 }}>번호</th><th>이름</th><th style={{ width: 70 }}>도달 정도</th></tr></thead>
              <tbody>
                {parsed.map((p, i) => <tr key={i}><td className="num key">{p.no}</td><td className="key name">{p.name}{p.overwrite && <span className="chip check" style={{ marginLeft: 6 }}>덮어씀</span>}</td><td className="num muted">{p.achievement?.manual ?? "자동"}</td></tr>)}
                {!parsed.length && <tr><td colSpan={3} className="muted small" style={{ textAlign: "center" }}>미리보기</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- 시간표 ---------- */
export function TimetableSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const classes = classList(doc);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const drag = useRef<boolean | null>(null);
  useEffect(() => {
    const up = () => { drag.current = null; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(new Set()); };
    window.addEventListener("mouseup", up); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("keydown", esc); };
  }, []);
  const key = (w: number, p: number) => `${w}-${p}`;
  const cell = (w: number, p: number) => doc.settings.timetable.find((t) => t.weekday === w && t.period === p);
  const colorOf = (c: string) => `tc${(Math.max(0, classes.indexOf(c)) % 6) + 1}`;
  const mark = (k: string, on: boolean) => setSel((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n; });
  const onDown = (k: string) => { const on = !sel.has(k); drag.current = on; mark(k, on); };
  const onEnter = (k: string) => { if (drag.current !== null) mark(k, drag.current); };
  const selectClass = (c: string) => setSel(new Set(doc.settings.timetable.filter((t) => t.class === c).map((t) => key(t.weekday, t.period))));

  const apply = (clsRaw: string | null) => {
    const keys = [...sel];
    if (!keys.length) return;
    let cls = clsRaw?.trim().replace(/\s+/g, " ") || null;
    if (cls && /^\d+\s*-\s*\d+$/.test(cls)) cls = cls.split("-").map((x) => String(parseInt(x, 10))).join("-");
    let added = 0; let removed = 0;
    setSettings((s) => {
      const rest = s.timetable.filter((t) => !sel.has(key(t.weekday, t.period)));
      const tt = cls ? [...rest, ...keys.map((k) => { const [w, p] = k.split("-").map(Number); return { weekday: w, period: p, class: cls! }; })] : rest;
      const cl = cls && !s.classes.some((c) => c.class === cls) ? [...s.classes, { class: cls, size: 0 }].sort((a, b) => classSortKey(a.class) - classSortKey(b.class)) : s.classes;
      const r = syncProgressSkeleton(s.progress, tt, s.school.year, s.school.semester); added = r.added; removed = r.removed;
      return { ...s, timetable: tt, classes: cl, progress: r.progress };
    });
    setSel(new Set()); setName("");
    const prog = added || removed ? ` · 진도표 빈 양식 ${added ? `+${added}` : ""}${removed ? ` −${removed}` : ""}행` : "";
    toast({ text: cls ? `${cls} · ${keys.length}칸 지정${prog}` : `${keys.length}칸 비움${prog}` });
  };

  const setPeriod = (no: number, k: "start" | "end", v: string) => setSettings((s) => ({ ...s, periods: s.periods.map((p) => p.no === no ? { ...p, [k]: v } : p) }));
  const addPeriod = () => setSettings((s) => { const last = s.periods[s.periods.length - 1]; return { ...s, periods: [...s.periods, { no: (last?.no || 0) + 1, start: last ? addMin(last.end, 10) : "08:50", end: last ? addMin(last.end, 60) : "09:40" }] }; });
  const removePeriod = () => setSettings((s) => ({ ...s, periods: s.periods.slice(0, -1), timetable: s.timetable.filter((t) => t.period < s.periods.length) }));
  const counts = new Map<string, number>(); for (const t of doc.settings.timetable) counts.set(t.class, (counts.get(t.class) || 0) + 1);

  return (
    <>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>주간 시간표</h3><span className="muted small">칸을 누르거나 끌어서 고른 뒤 반 이름을 정하세요 · Esc 선택 해제</span></div>
        {classes.length > 0 && (
          <div className="flex wrap" style={{ margin: "10px 0 4px" }}>
            {classes.map((c) => <button key={c} className={`chip clickable tchip ${colorOf(c)}`} onClick={() => selectClass(c)} title="이 반의 칸 모두 선택">{c}<span className="muted">{counts.get(c) || 0}칸</span></button>)}
          </div>
        )}
        <div className="ttgrid" style={{ marginTop: 10, userSelect: "none" }}>
          <div />{[1, 2, 3, 4, 5].map((w) => <div key={w} className="h">{WEEKDAY_LABELS[w]}</div>)}
          {doc.settings.periods.map((p) => (
            <React.Fragment key={p.no}>
              <div className="p">{p.no}교시<span className="t">{p.start}</span></div>
              {[1, 2, 3, 4, 5].map((w) => {
                const c = cell(w, p.no); const k = key(w, p.no);
                return <button key={w} className={`ttcell ${c ? `on ${colorOf(c.class)}` : ""} ${sel.has(k) ? "sel" : ""}`} onMouseDown={(e) => { e.preventDefault(); onDown(k); }} onMouseEnter={() => onEnter(k)} title={c ? c.class : "빈 칸"}>{c?.class || ""}</button>;
              })}
            </React.Fragment>
          ))}
        </div>
        {sel.size > 0 && (
          <div className="ttbar">
            <b>선택 {sel.size}칸</b>
            <span className="sep" />
            {classes.map((c) => <button key={c} className={`chip clickable tchip ${colorOf(c)}`} onClick={() => apply(c)}>{c}</button>)}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 반 이름 (예: 2-3, 과학동아리)" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) apply(name); }} autoFocus />
            <button className="btn primary sm" disabled={!name.trim()} onClick={() => apply(name)}>반으로 지정</button>
            <span className="grow" />
            <button className="btn sm" onClick={() => apply(null)}>칸 비우기</button>
            <button className="btn ghost sm" onClick={() => setSel(new Set())}>선택 해제</button>
          </div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>반을 지정하면 진도표에 그 반의 수업 날짜별 빈 행이 자동으로 만들어집니다.</div>
      </div>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>교시 시간</h3><span className="flex"><button className="btn sm" onClick={addPeriod}><Icon name="plus" size={14} />교시</button><button className="btn ghost sm" onClick={removePeriod} disabled={doc.settings.periods.length <= 1}>마지막 삭제</button></span></div>
        <div className="grid3" style={{ marginTop: 10 }}>
          {doc.settings.periods.map((p) => <div key={p.no} className="flex small"><span style={{ width: 44 }}>{p.no}교시</span><input type="time" value={p.start} onChange={(e) => setPeriod(p.no, "start", e.target.value)} /><span>–</span><input type="time" value={p.end} onChange={(e) => setPeriod(p.no, "end", e.target.value)} /></div>)}
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>워치·위젯이 이 시간으로 현재 수업을 판단합니다.</div>
      </div>
    </>
  );
}
function addMin(hm: string, m: number): string { const [h, mi] = hm.split(":").map(Number); const t = h * 60 + mi + m; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }

/* ---------- 진도 ---------- */
export function ProgressSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const classes = classList(doc);
  const [cls, setCls] = useState<string>("all");
  const [blankOnly, setBlankOnly] = useState(false);
  const rows = doc.settings.progress.map((p, i) => ({ ...p, i })).filter((p) => (cls === "all" || p.class === cls) && (!blankOnly || isBlankProgress(p))).sort((a, b) => a.date.localeCompare(b.date) || classSortKey(a.class) - classSortKey(b.class));
  const up = (i: number, patch: Partial<ProgressRow>) => setSettings((s) => ({ ...s, progress: s.progress.map((p, k) => k === i ? { ...p, ...patch } : p) }));
  const del = (i: number) => setSettings((s) => ({ ...s, progress: s.progress.filter((_, k) => k !== i) }));
  const add = () => setSettings((s) => ({ ...s, progress: [...s.progress, { date: nowIso().slice(0, 10), class: cls === "all" ? classes[0] || "" : cls, unit: "", lesson: 0, title: "" }] }));
  const makeSkeleton = () => {
    let added = 0; let removed = 0;
    setSettings((s) => { const r = syncProgressSkeleton(s.progress, s.timetable, s.school.year, s.school.semester); added = r.added; removed = r.removed; return { ...s, progress: r.progress }; });
    toast({ text: doc.settings.timetable.length ? `빈 양식 ${added}행 추가${removed ? ` · 쓸모없는 빈 행 ${removed}개 정리` : ""}` : "먼저 시간표에서 반을 지정하세요" });
  };
  const exportForm = () => {
    const src = doc.settings.progress.filter((p) => cls === "all" || p.class === cls).sort((a, b) => a.date.localeCompare(b.date) || classSortKey(a.class) - classSortKey(b.class));
    const rows = src.length ? src.map((p) => ({ 날짜: p.date, 반: p.class, 단원: p.unit, 차시: p.lesson || "", 제목: p.title })) : templateProgress();
    exportSheets(`진도표-${cls === "all" ? "전체" : cls}.xlsx`, [{ name: "진도", rows, widths: [12, 10, 12, 6, 30] }]);
  };
  const filled = doc.settings.progress.filter((p) => (cls === "all" || p.class === cls) && !isBlankProgress(p)).length;
  const total = doc.settings.progress.filter((p) => cls === "all" || p.class === cls).length;
  const importExcel = async () => {
    const [f] = await pickFile(".xlsx,.xls,.csv"); if (!f) return;
    const p = progressFromRows(await readSheetRows(f, true));
    if (!p.length) { toast({ text: "진도 행을 찾지 못함 (열: 날짜·반·단원·차시·제목)" }); return; }
    setSettings((s) => ({ ...s, progress: [...s.progress.filter((x) => !p.some((n) => n.date === x.date && n.class === x.class)), ...p] }));
    toast({ text: `${p.length}행 가져옴` });
  };
  return (
    <div className="card pad">
      <div className="flex between">
        <h3 style={{ margin: 0 }}>진도 <span className="muted small">채움 {filled} / {total}행</span></h3>
        <span className="flex">
          <label className="flex small muted" style={{ gap: 4 }}><input type="checkbox" className="checkbox" checked={blankOnly} onChange={(e) => setBlankOnly(e.target.checked)} />빈칸만</label>
          <select className="select" value={cls} onChange={(e) => setCls(e.target.value)}><option value="all">전체 반</option>{classes.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn sm" onClick={makeSkeleton} title="시간표의 수업 날짜마다 빈 행 만들기">시간표로 빈 양식</button>
          <button className="btn sm" onClick={exportForm} title="지금 진도표를 엑셀로 내보내 채운 뒤 다시 가져오기">엑셀 양식 내보내기</button>
          <button className="btn sm" onClick={importExcel}><Icon name="excel" size={14} />엑셀 가져오기</button>
          <button className="btn sm" onClick={add}><Icon name="plus" size={14} />행</button>
        </span>
      </div>
      <table className="table" style={{ marginTop: 12 }}>
        <thead><tr><th style={{ width: 150 }}>날짜</th><th style={{ width: 90 }}>반</th><th style={{ width: 120 }}>단원</th><th style={{ width: 80 }}>차시</th><th>제목</th><th style={{ width: 44 }} /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.i} style={{ height: 44 }}>
              <td className="tight"><input type="date" className="cell-edit" value={p.date} onChange={(e) => up(p.i, { date: e.target.value })} /></td>
              <td className="tight"><select className="cell-edit" value={p.class} onChange={(e) => up(p.i, { class: e.target.value })}>{classes.map((c) => <option key={c}>{c}</option>)}</select></td>
              <td className="tight"><input className="cell-edit" value={p.unit} placeholder="3단원" onChange={(e) => up(p.i, { unit: e.target.value })} /></td>
              <td className="tight"><input type="number" className="cell-edit num" value={p.lesson || ""} placeholder="—" onChange={(e) => up(p.i, { lesson: Number(e.target.value) || 0 })} /></td>
              <td className="tight"><input className="cell-edit" value={p.title} placeholder="화학 평형" onChange={(e) => up(p.i, { title: e.target.value })} /></td>
              <td className="tight"><button className="btn ghost icon sm" onClick={() => del(p.i)}><Icon name="trash" size={14} /></button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted small" style={{ textAlign: "center" }}>진도 없음 — 시간표에서 반을 지정하면 빈 양식이 자동으로 생깁니다</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 카테고리 ---------- */
function CategorySection() {
  const cats = useStore((s) => s.doc.settings.categories);
  const setSettings = useStore((s) => s.setSettings);
  return (
    <div className="card pad">
      <h3>카테고리 <span className="muted small">최대 4개, 이름만 변경</span></h3>
      <div className="grid2">
        {cats.map((c) => <div key={c.key} className="field"><label className="flex"><span className={`dot c${c.key}`} />{c.key}번 버튼</label><input value={c.label} maxLength={4} onChange={(e) => setSettings((s) => ({ ...s, categories: s.categories.map((x) => x.key === c.key ? { ...x, label: e.target.value } : x) }))} /></div>)}
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>워치·위젯 버튼과 PC 칩에 같은 이름이 표시됩니다. 변경 후 자동으로 폰에 전송됩니다.</div>
    </div>
  );
}

/* ---------- 글자수·기준 ---------- */
function LengthSection() {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  const toast = useStore((x) => x.toast);
  const [confirmLevel, setConfirmLevel] = useState<SchoolLevel | null>(null);
  const areaName = s.school.subject || "현재 영역";
  const item: WriteItem = s.writeItem || "setuk";
  const preset = s.schoolLevel ? SCHOOL_PRESETS[s.schoolLevel] : null;
  const items: WriteItem[] = preset ? preset.items : (Object.keys(WRITE_ITEM_LABEL) as WriteItem[]);
  const limit = s.targetLength["세특"] || presetLimitIn(item, s.lengthMode);
  const presetValue = presetLimitIn(item, s.lengthMode);
  const custom = limit !== presetValue;
  const band = s.lengthBand || [0.96, 1.0];
  const lenItem = LENGTH_PRESET.items[item];
  const unit = s.lengthMode === "bytes" ? "B" : "자";
  const setLimit = (n: number) => setSettings((x) => ({ ...x, targetLength: { ...x.targetLength, "세특": n }, lengthCustom: n !== presetLimitIn(x.writeItem || "setuk", x.lengthMode) }));
  const setMode = (m: LengthMode) => setSettings((x) => {
    if (x.lengthMode === m) return x;
    const cur = x.targetLength["세특"] || presetLimitIn(x.writeItem || "setuk", x.lengthMode);
    // 바이트 ↔ 글자 바꿀 때 한도도 함께 바꾼다 (한글 1자 ≈ 3바이트)
    const next = x.lengthMode === "bytes" ? Math.round(cur / 3) : m === "bytes" ? cur * 3 : cur;
    return { ...x, lengthMode: m, targetLength: { ...x.targetLength, "세특": next } };
  });
  const setItem = (it: WriteItem) => setSettings((x) => ({ ...x, writeItem: it, targetLength: { ...x.targetLength, "세특": presetLimitIn(it, x.lengthMode) }, lengthCustom: false }));
  const applyLevel = (lv: SchoolLevel) => { setSettings((x) => applySchoolPreset(x, lv)); toast({ text: `${SCHOOL_PRESETS[lv].label} 프리셋 적용` }); };
  const pct = (v: number) => Math.round(v * 100);
  return (
    <>
    <div className="card pad">
      <h3>학교급 · 작성 항목 <span className="muted small">{areaName} 영역</span></h3>
      <div className="col" style={{ gap: 14 }}>
        <div className="field"><label>학교급</label>
          <span className="flex wrap" style={{ gap: 8 }}>
            {(["elem", "middle", "high"] as SchoolLevel[]).map((lv) => (
              <button key={lv} className={`level-card ${s.schoolLevel === lv ? "active" : ""}`} onClick={() => { if (s.schoolLevel !== lv) setConfirmLevel(lv); }}>
                <b>{SCHOOL_PRESETS[lv].label}</b><span>{SCHOOL_PRESETS[lv].userModelLabel}</span><span>카테고리 {SCHOOL_PRESETS[lv].categories.join(" · ")}</span>
              </button>
            ))}
          </span>
          {preset && <span className="muted small">문체 지침: {preset.styleGuide}</span>}
        </div>
        <div className="field"><label>작성 항목</label>
          <span className="seg wrap">{items.map((it) => <button key={it} className={item === it ? "active" : ""} onClick={() => setItem(it)}>{WRITE_ITEM_LABEL[it]}</button>)}</span>
          <span className="muted small">항목에 따라 기재요령 한도와 초안 지침 기본 양식이 정해집니다.</span>
        </div>
      </div>
    </div>
    <div className="card pad">
      <div className="flex between">
        <h3 style={{ margin: 0 }}>분량</h3>
        <span className="flex">
          {!lenItem?.verified && s.lengthMode === "bytes" && <span className="chip check" title={LENGTH_PRESET.note}>기재요령 확인 필요</span>}
          <span className={`chip ${custom ? "check" : "pass"}`}>{custom ? "사용자 설정" : `${LENGTH_PRESET.year} 기재요령 값`}</span>
        </span>
      </div>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="field"><label>단위</label>
          <span className="seg">
            <button className={s.lengthMode === "bytes" ? "active" : ""} onClick={() => setMode("bytes")}>NEIS 바이트</button>
            <button className={s.lengthMode === "withSpaces" ? "active" : ""} onClick={() => setMode("withSpaces")}>글자 (공백 포함)</button>
            <button className={s.lengthMode === "withoutSpaces" ? "active" : ""} onClick={() => setMode("withoutSpaces")}>글자 (공백 제외)</button>
          </span>
          <span className="muted small">NEIS는 바이트로 셉니다: 한글 1자 3B · 영문·숫자·공백 1B · 줄바꿈 2B.</span>
        </div>
        <div className="field"><label>{lenItem?.label || WRITE_ITEM_LABEL[item]} 한도</label>
          <span className="flex">
            <input type="number" className="num" style={{ width: 110 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /><span>{unit}</span>
            {custom && <button className="btn sm" onClick={() => setLimit(presetValue)}>기재요령 값으로 되돌리기 ({presetValue.toLocaleString("ko-KR")}{unit})</button>}
          </span>
          {s.lengthMode === "bytes" && <span className="muted small">한글 위주 문장 기준 약 {Math.round(limit / 2.75).toLocaleString("ko-KR")}자 (공백 포함)</span>}
        </div>
        <div className="field"><label>목표 구간 (한도 대비)</label>
          <span className="flex">
            <input type="number" className="num" style={{ width: 70 }} min={50} max={100} value={pct(band[0])} onChange={(e) => setSettings({ lengthBand: [Math.min(Number(e.target.value), pct(band[1])) / 100, band[1]] })} />%
            <span>~</span>
            <input type="number" className="num" style={{ width: 70 }} min={50} max={100} value={pct(band[1])} onChange={(e) => setSettings({ lengthBand: [band[0], Math.min(100, Math.max(Number(e.target.value), pct(band[0]))) / 100] })} />%
          </span>
          <span className="muted small">지금 기준 {Math.ceil(limit * band[0]).toLocaleString("ko-KR")}~{Math.floor(limit * band[1]).toLocaleString("ko-KR")}{unit}. 한도 초과는 금지, 기록이 적으면 미달을 허용합니다.</span>
        </div>
      </div>
    </div>
    <div className="card pad">
      <h3>판단 기준</h3>
      <div className="grid2">
        <div className="field"><label>기록 부족 기준</label><Switch on={s.lowRecordEnabled} onChange={(v) => setSettings({ lowRecordEnabled: v })} label={s.lowRecordEnabled ? "직접 정함" : "자동 — 반 평균의 절반보다 적은 학생"} />{s.lowRecordEnabled && <span className="flex small muted">기준 <input type="number" className="num" style={{ width: 60, height: 30 }} min={0} value={s.lowRecordThreshold} onChange={(e) => setSettings({ lowRecordThreshold: Math.max(0, Number(e.target.value) || 0) })} />건 이하</span>}<span className="muted small">현황판 학생 카드는 연한 빨강, 기록 계단은 주황 띠로 표시하고, 생기부 명단에도 같은 기준을 씁니다.</span></div>
        <div className="field"><label>문장 유사도 임계값 (0~1)</label><input type="number" step="0.05" min="0.3" max="1" className="num" value={s.similarityThreshold} onChange={(e) => setSettings({ similarityThreshold: Number(e.target.value) })} /></div>
      </div>
    </div>
    {confirmLevel && <Confirm title={`${SCHOOL_PRESETS[confirmLevel].label} 프리셋 적용`} body="이 영역의 카테고리·작성 항목·분량(바이트 한도와 목표 구간)이 프리셋 값으로 바뀝니다. 명단·기록·시간표는 그대로입니다." okLabel="적용" onOk={() => applyLevel(confirmLevel)} onClose={() => setConfirmLevel(null)} />}
    </>
  );
}

/* ---------- 동기화 ---------- */
export function SyncSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const status = useStore((s) => s.syncStatus);
  const toast = useStore((s) => s.toast);
  const sync = doc.settings.sync;
  const [relay, setRelay] = useState(sync?.relayUrl || "http://localhost:8787");
  const [pcName, setPcName] = useState(sync?.pcName || hostName());
  const [qr, setQr] = useState<string>("");
  const [showQr, setShowQr] = useState(false);
  const [unpair, setUnpair] = useState(false);
  const [health, setHealth] = useState<null | boolean>(null);

  useEffect(() => {
    if (!sync) { setQr(""); return; }
    const key = Uint8Array.from(atob(sync.keyB64), (c) => c.charCodeAt(0));
    QRCode.toDataURL(buildPairingUri({ key, relayUrl: sync.relayUrl, pcName: sync.pcName }), { width: 440, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [sync?.keyId, sync?.relayUrl, sync?.pcName]);

  const generate = async () => {
    const key = generateSyncKey();
    const keyId = await keyIdOf(key);
    setSettings((s) => ({ ...s, sync: { keyB64: toB64(key), keyId, relayUrl: relay.trim().replace(/\/+$/, ""), pcName: pcName.trim() || "PC", pairedAt: nowIso(), shareRoster: s.sync?.shareRoster || false } }));
    setShowQr(true); syncEngine.kick();
  };
  const testRelay = async () => {
    setHealth(null);
    try { const r = await fetch(relay.replace(/\/+$/, "") + "/health"); setHealth(r.ok); } catch { setHealth(false); }
  };
  return (
    <>
      <div className="card pad">
        <h3>도착한 기록 처리</h3>
        <div className="arrival-opts">
          {([
            ["popup", "알림 팝업으로 먼저 확인", "폰·워치 기록이 도착하면 어느 화면에서든 쉬는 시간 기록 팝업이 바로 뜹니다. 팝업에서 내용을 적어 저장한 기록만 오늘 기록에 들어갑니다. (권장)"],
            ["queue", "팝업 없이 미반영에 쌓기", "도착 알림만 잠깐 보이고, 기록은 [미반영]에 쌓입니다. 시간 날 때 한꺼번에 처리합니다."],
            ["direct", "바로 기록에 넣기", "확인 없이 바로 확정해 오늘 기록에 넣습니다. 폰에서 쓴 메모가 관찰 내용이 됩니다."],
          ] as const).map(([k, title, desc]) => (
            <label key={k} className={`arrival-opt ${arrivalModeOf(doc.settings) === k ? "on" : ""}`}>
              <input type="radio" name="arrival" checked={arrivalModeOf(doc.settings) === k} onChange={() => setSettings({ arrivalMode: k, supplementEnabled: k !== "direct" })} />
              <span><b>{title}</b><span className="muted small block">{desc}</span></span>
            </label>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>자동 추천(수업 녹음)도 같은 설정을 따릅니다. 이 설정은 모든 영역에 공통입니다.</div>
      </div>
      <div className="card pad">
        <h3>릴레이 서버</h3>
        <div className="grid2">
          <div className="field"><label>릴레이 URL</label><input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="https://relay.example.com 또는 http://192.168.0.10:8787" /></div>
          <div className="field"><label>이 PC 이름</label><input value={pcName} onChange={(e) => setPcName(e.target.value)} /></div>
        </div>
        <div className="flex" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={testRelay}>연결 확인</button>
          {health === true && <span className="small" style={{ color: "var(--ok)" }}>✓ 응답함</span>}{health === false && <span className="small" style={{ color: "var(--warn)" }}>응답 없음</span>}
          <span className="muted small">같은 Wi-Fi 직접 전송: 이 PC에서 <span className="mono">npm run relay</span> 실행 후 PC의 IP 주소를 입력</span>
        </div>
      </div>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>동기화 키</h3>{sync && <span className="flex small"><span className={`dot ${status.state === "idle" ? "" : "gray"}`} style={status.state === "idle" ? { background: "var(--ok)" } : status.state === "error" ? { background: "var(--warn)" } : undefined} />{status.message}{sync.lastSyncAt && <span className="muted"> · 마지막 수신 {sync.lastSyncAt.slice(5, 16).replace("T", " ")}</span>}</span>}</div>
        {!sync ? (
          <div className="col" style={{ marginTop: 10 }}><div className="muted small">키를 만들면 QR이 표시됩니다. 폰 앱 → 설정 → QR 스캔.</div><div><button className="btn primary" onClick={generate}><Icon name="qr" />동기화 키 생성</button></div></div>
        ) : (
          <div className="col" style={{ marginTop: 10, gap: 10 }}>
            <div className="flex small"><span className="muted">keyId</span><span className="mono">{sync.keyId}</span><span className="muted">· {sync.relayUrl}</span><span className="muted">· {sync.pairedAt.slice(0, 10)} 생성</span></div>
            <div className="flex">
              <button className="btn" onClick={() => setShowQr(true)}><Icon name="qr" />QR 보기</button>
              <button className="btn" onClick={() => { syncEngine.resendConfig().then((ok) => toast({ text: ok ? "설정을 폰으로 전송함" : "전송 실패" })); }}><Icon name="sync" />설정 다시 보내기</button>
              <button className="btn" onClick={generate}>키 재생성</button>
              <button className="btn ghost" style={{ color: "var(--warn)" }} onClick={() => setUnpair(true)}>연결 해제</button>
            </div>
            <Switch on={doc.settings.options.showPhoneNames && sync.shareRoster} onChange={(v) => setSettings((s) => ({ ...s, options: { ...s.options, showPhoneNames: v }, sync: s.sync ? { ...s.sync, shareRoster: v } : null }))} label="폰에 이름 표시 (명렬표를 폰으로 전송, 워치에는 전송 안 함)" />
            <Switch on={doc.settings.options.autoLaunchWatch} onChange={(v) => setSettings((s) => ({ ...s, options: { ...s.options, autoLaunchWatch: v } }))} label="수업 시작 시 워치 앱 자동 실행" />
            <div className="flex small"><span className="muted">폰·워치 번호 릴 시작</span><span className="seg"><button className={doc.settings.options.reelStart === "one" ? "active" : ""} onClick={() => setSettings((s) => ({ ...s, options: { ...s.options, reelStart: "one" } }))}>항상 1번</button><button className={doc.settings.options.reelStart === "last" ? "active" : ""} onClick={() => setSettings((s) => ({ ...s, options: { ...s.options, reelStart: "last" } }))}>마지막 번호</button></span></div>
          </div>
        )}
      </div>
      <div className="card pad">
        <h3>연결 기기</h3>
        {doc.devices.length === 0 ? <div className="muted small">아직 없음 — 폰에서 QR을 스캔하면 표시됩니다</div> : doc.devices.map((d) => <div key={d.deviceId} className="flex small" style={{ padding: "4px 0" }}><Icon name={d.name.includes("워치") ? "watch" : "phone"} /><span>{d.name}</span><span className="muted">마지막 {d.lastSeen.slice(5, 16).replace("T", " ")}</span></div>)}
      </div>
      {showQr && sync && (
        <Modal title="폰 앱에서 QR 스캔" onClose={() => setShowQr(false)} width="narrow">
          <div className="qr"><img src={qr} alt="pairing QR" /><div className="col small"><div><b>1.</b> 폰 앱 → 설정 → QR 스캔</div><div><b>2.</b> 스캔 후 폰이 인사(ping)를 보내면 연결 기기에 표시</div><div><b>3.</b> 시간표·진도·카테고리가 자동 전송</div><div className="muted" style={{ marginTop: 8 }}>키는 서버에 전송되지 않습니다. 이 QR을 아는 사람은 기록을 복호화할 수 있으니 공유하지 마세요.</div></div></div>
        </Modal>
      )}
      {unpair && <Confirm title="연결 해제" body="키를 삭제하고 릴레이의 대기 데이터를 비웁니다. 폰은 재페어링해야 합니다." okLabel="해제" danger onOk={async () => { try { const { RelayClient } = await import("@nuga/core"); await RelayClient.fromSettings(sync!).clear(); } catch { /* ignore */ } setSettings({ sync: null }); }} onClose={() => setUnpair(false)} />}
    </>
  );
}

/* ---------- 백업 ---------- */
function BackupSection() {
  const exportAll = useStore((s) => s.exportAll);
  const importAll = useStore((s) => s.importAll);
  const replaceDoc = useStore((s) => s.replaceDoc);
  const areaStats = useStore((s) => s.areaStats);
  const areaName = useStore((s) => s.doc.settings.school.subject) || "현재 영역";
  const toast = useStore((s) => s.toast);
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"export" | "import" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<AreaStats[]>([]);
  useEffect(() => { areaStats().then(setStats); }, [areaStats]);
  const total = stats.reduce((a, x) => ({ s: a.s + x.students, r: a.r + x.records, d: a.d + x.drafts }), { s: 0, r: 0, d: 0 });
  const doExport = async () => {
    if (pw.length < 4) { toast({ text: "비밀번호 4자 이상" }); return; }
    const bundle = await exportAll();
    const c = await encryptBackup(pw, JSON.stringify(bundle), nowIso());
    if (await saveFile(`누가-암호백업-전체영역-${nowIso().slice(0, 10)}.nuga`, JSON.stringify(c), [{ name: "누가 백업", extensions: ["nuga"] }])) toast({ text: `암호화 백업 저장 · 영역 ${bundle.areas.length}개` });
    setMode(null); setPw("");
  };
  const doImport = async () => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const j = JSON.parse(text);
      const json = j.format === "nuga-backup" ? await decryptBackup(pw, j as BackupContainer) : text;
      const parsed = JSON.parse(json);
      if (parsed.format === "nuga-multi") { await importAll(parsed as MultiBackup); toast({ text: `불러오기 완료 · 영역 ${parsed.areas.length}개` }); }
      else { replaceDoc(parseImportJson(json)); toast({ text: `${areaName} 영역에 불러옴` }); }
      setMode(null); setPw(""); areaStats().then(setStats);
    } catch (e) { toast({ text: e instanceof Error ? e.message : "불러오기 실패" }); }
  };
  const pickImport = async () => { const [f] = await pickFile(".nuga,.json"); if (!f) return; setFile(f); setMode("import"); };
  return (
    <>
      <div className="card pad">
        <h3>백업 · 모든 영역</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>서버에는 원본이 없습니다. 학기 중 주기적으로 내보내 보관하세요. 백업 파일 하나에 모든 영역과 공통 설정이 들어갑니다(API 키 제외).</div>
        <table className="table" style={{ marginBottom: 12 }}>
          <thead><tr><th>영역</th><th style={{ width: 90 }}>학생</th><th style={{ width: 90 }}>기록</th><th style={{ width: 90 }}>초안</th></tr></thead>
          <tbody>
            {stats.map((x) => <tr key={x.id}><td className="name">{x.name}</td><td className="num">{x.students}</td><td className="num">{x.records}</td><td className="num">{x.drafts}</td></tr>)}
            {stats.length > 1 && <tr><td className="key">합계</td><td className="num key">{total.s}</td><td className="num key">{total.r}</td><td className="num key">{total.d}</td></tr>}
          </tbody>
        </table>
        <div className="flex"><button className="btn primary" onClick={() => setMode("export")}>암호화 백업 내보내기</button><button className="btn" onClick={pickImport}>백업 / JSON 불러오기</button></div>
      </div>
      {mode && (
        <Modal title={mode === "export" ? "백업 비밀번호" : `불러오기 · ${file?.name}`} onClose={() => setMode(null)} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={() => setMode(null)}>취소</button><button className="btn primary" onClick={mode === "export" ? doExport : doImport}>{mode === "export" ? "내보내기" : "불러오기 (덮어씀)"}</button></>}>
          <div className="field"><label>비밀번호 {mode === "import" && <span className="muted">(JSON 파일이면 비워 둠)</span>}</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && (mode === "export" ? doExport() : doImport())} /></div>
          {mode === "import" && <div className="muted small" style={{ marginTop: 8 }}>전체 영역 백업이면 모든 영역이 파일 내용으로 바뀝니다. 한 영역짜리 JSON이면 지금 열린 {areaName} 영역만 바뀝니다.</div>}
        </Modal>
      )}
    </>
  );
}

/* ---------- AI ---------- */
function AiSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const ai = doc.settings.ai;
  const [, bump] = useState(0);
  useEffect(() => onSecretsChange(() => bump((x) => x + 1)), []);
  const [preview, setPreview] = useState<string | null>(null);
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; message?: string; ms?: number }>({});
  const provider: AiProvider = ai.provider === "rules" ? "anthropic" : ai.provider;
  const info = PROVIDER_INFO[provider];
  const [keyDraft, setKeyDraft] = useState("");
  useEffect(() => { setKeyDraft(""); setTest({}); }, [provider]);
  const up = (p: Partial<typeof ai>) => setSettings((s) => ({ ...s, ai: { ...s.ai, ...p } }));
  const model = modelOf(ai, provider);
  const setModel = (m: string) => up({ models: { ...(ai.models || {}), [provider]: m }, ...(provider === "anthropic" ? { model: m } : {}) });
  const saveKey = async () => {
    try { await setKey(provider, keyDraft); setKeyDraft(""); toast({ text: keyDraft.trim() ? `${info.label} 키 저장 · ${keyStoreLabel()}` : `${info.label} 키 지움` }); }
    catch (e) { toast({ text: `키 저장 실패: ${e instanceof Error ? e.message : e}` }); }
  };
  const runTest = async () => { setTest({ busy: true }); setTest(await testProvider(ai, provider)); };
  const showPreview = () => {
    const s = doc.students.find((x) => recordsOf(doc, x.class, x.no).length > 0) || doc.students[0];
    const recs = s ? recordsOf(doc, s.class, s.no) : [];
    const req = buildDraftRequest({ achievement: s ? achievementOf(doc, s).value : null, targetLength: limitOf(doc), lengthMode: doc.settings.lengthMode, lengthBand: doc.settings.lengthBand, styleGuide: schoolStyle(doc.settings.schoolLevel).styleGuide, subject: doc.settings.school.subject, school: doc.settings.school, records: recs, performances: s ? perfsOf(doc, s.class, s.no) : [], categories: doc.settings.categories });
    setPreview(previewPayload(req, guideOf(doc)));
  };
  const ready = aiReady(ai);
  return (
    <>
      <div className="card pad">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>AI 초안 생성</h3>
          <span className={`chip ${ready ? "pass" : "none"}`}>{aiLabel(ai)}</span>
        </div>
        <div className="col" style={{ gap: 14, marginTop: 12 }}>
          <Switch on={ai.enabled} onChange={(v) => up({ enabled: v, provider })} label={ai.enabled ? "AI 사용" : "AI 끔 — 규칙 기반 생성기로 동작 (교사 메모를 문장으로 옮김)"} />
          {ai.enabled && (
            <>
              <div className="field"><label>제공자</label>
                <div className="provider-grid">
                  {PROVIDER_ORDER.map((p) => (
                    <button key={p} className={`level-card ${provider === p ? "active" : ""}`} onClick={() => up({ provider: p })}>
                      <b>{PROVIDER_INFO[p].label}</b><span>{PROVIDER_INFO[p].desc}</span>
                      <span>{PROVIDER_INFO[p].needsKey ? (hasKey(p) ? "✓ 키 저장됨" : "키 필요") : "키 필요 없음"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid2">
                {info.needsKey ? (
                  <div className="field"><label>{info.label} API 키 {hasKey(provider) && <span className="chip pass" style={{ marginLeft: 6 }}>저장됨</span>}</label>
                    <span className="flex">
                      <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={hasKey(provider) ? "새 키로 바꾸려면 입력" : info.keyHint} autoComplete="off" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && keyDraft.trim()) saveKey(); }} />
                      <button className="btn sm primary" disabled={!keyDraft.trim()} onClick={saveKey}>저장</button>
                      {hasKey(provider) && <button className="btn sm ghost" onClick={() => setKey(provider, "").then(() => toast({ text: `${info.label} 키 지움` }))}>지우기</button>}
                    </span>
                    <span className="muted small">보관 위치: {keyStoreLabel()}. 문서·백업·내보내기에는 들어가지 않습니다.{info.keyUrl && <> <a href={info.keyUrl} onClick={(e) => { e.preventDefault(); openExternal(info.keyUrl!); }}>키 발급</a></>}</span>
                    {!isTauri && <Switch on={webRemember()} onChange={(v) => { setWebRemember(v); bump((x) => x + 1); }} label="이 브라우저에 기억 (공용 PC에서는 끄세요)" />}
                  </div>
                ) : (
                  <div className="field"><label>로컬 LLM 주소 (llama-server)</label>
                    <input value={ai.localUrl || DEFAULT_LOCAL_URL} onChange={(e) => up({ localUrl: e.target.value })} placeholder={DEFAULT_LOCAL_URL} />
                    <span className="muted small">이 PC에서 llama-server 를 실행해 두면 인터넷 없이 초안을 만듭니다. 8GB 메모리 PC는 3~4B 모델(4비트)을 권장합니다.</span>
                  </div>
                )}
                <div className="field"><label>모델</label>
                  <input list={`models-${provider}`} value={model} onChange={(e) => setModel(e.target.value)} />
                  <datalist id={`models-${provider}`}>{info.models.map((m) => <option key={m} value={m} />)}</datalist>
                  <span className="muted small">목록에서 고르거나 직접 입력합니다. 기본값 {info.defaultModel}</span>
                </div>
              </div>
              <div className="flex wrap">
                <button className="btn" onClick={runTest} disabled={test.busy}>{test.busy ? "확인 중…" : "연결 테스트"}</button>
                {test.message && <span className="small" style={{ color: test.ok ? "var(--accent)" : "var(--warn)" }}>{test.ok ? "✓ " : "✕ "}{test.message}{test.ms ? ` · ${(test.ms / 1000).toFixed(1)}초` : ""}</span>}
              </div>
              <div className="field"><label>생성 방식</label>
                <span className="seg">
                  {([["auto", "자동 (로컬 LLM은 단계형)"], ["on", "항상 단계형"], ["off", "한 번에"]] as const).map(([k, l]) => <button key={k} className={(ai.pipeline ?? "auto") === k ? "active" : ""} onClick={() => up({ pipeline: k })}>{l}</button>)}
                </span>
                <span className="muted small">단계형: 기록을 문장 슬롯에 나눠 한 문장씩 쓰고 이어 붙입니다. 작은 로컬 모델의 지시 준수가 좋아지지만 요청 횟수가 늘어납니다.</span>
              </div>
              <div className="muted small">데이터가 가는 곳: {info.where}</div>
            </>
          )}
          <div className="flex"><button className="btn" onClick={showPreview}>전송 내용 미리보기</button><span className="muted small">반·번호·이름은 보내지 않습니다. 기록 내용, 수업 주제, 분량 한도, 표현 방향(도달 정도에 맞는 어휘)만 보냅니다.</span></div>
        </div>
      </div>
      {ai.enabled && <LocalLlmCard />}
      <ModelCompare />
      {preview !== null && <Modal title="AI에 전송되는 내용 (예시 학생)" onClose={() => setPreview(null)} width="wide"><pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 12, borderRadius: 8, maxHeight: "60vh", overflow: "auto" }}>{preview}</pre></Modal>}
    </>
  );
}

/* ---------- 데이터 ---------- */
function DataSection() {
  const loadSample = useStore((s) => s.loadSample);
  const resetEverything = useStore((s) => s.resetEverything);
  const areaStats = useStore((s) => s.areaStats);
  const areaName = useStore((s) => s.doc.settings.school.subject) || "현재 영역";
  const toast = useStore((s) => s.toast);
  const [confirm, setConfirm] = useState<"sample" | "reset" | "demo" | "endDemo" | null>(null);
  const [loc, setLoc] = useState("");
  const [stats, setStats] = useState<AreaStats[]>([]);
  // 데모의 합성 모의 수업 스크립트가 남아 있으면 지우는 단추를 보인다
  const [demoOn, setDemoOn] = useState(false);
  useEffect(() => { import("../lib/persist").then((m) => m.getPersist()).then((p) => setLoc(p.location())); areaStats().then(setStats); }, [areaStats]);
  useEffect(() => { let live = true; import("../lib/demo").then((m) => { if (live) setDemoOn(!!m.demoInfo()); }); return () => { live = false; }; }, [confirm]);
  return (
    <>
      <div className="card pad">
        <h3>데이터 · 모든 영역</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>저장 위치: <span className="mono">{loc}</span></div>
        <table className="table" style={{ marginBottom: 12 }}>
          <thead><tr><th>영역</th><th style={{ width: 80 }}>학생</th><th style={{ width: 80 }}>기록</th><th style={{ width: 90 }}>PDF기록</th><th style={{ width: 80 }}>초안</th></tr></thead>
          <tbody>{stats.map((x) => <tr key={x.id}><td className="name">{x.name}</td><td className="num">{x.students}</td><td className="num">{x.records}</td><td className="num">{x.performances}</td><td className="num">{x.drafts}</td></tr>)}</tbody>
        </table>
        <div className="flex"><button className="btn" onClick={() => setConfirm("sample")}>{areaName}을(를) 샘플 데이터로</button><button className="btn" onClick={() => setConfirm("demo")} title="샘플 + 합성 모의 수업 스크립트 + 추천 카드 (폰 기록 흐름은 모바일 확인에서)">데모 모드</button>{demoOn && <button className="btn ghost" onClick={() => setConfirm("endDemo")} title="데모가 넣은 합성 모의 수업 스크립트를 지웁니다">데모 끝내기</button>}<span className="grow" /><button className="btn ghost" style={{ color: "var(--warn)" }} onClick={() => setConfirm("reset")}>모든 영역 데이터 삭제</button></div>
      </div>
      {confirm === "sample" && <Confirm title="샘플 데이터" body={`지금 열린 ${areaName} 영역의 명단·기록·초안을 샘플(화학Ⅰ · 2개 반)로 대체합니다. 다른 영역과 공통 설정은 그대로입니다.`} okLabel="불러오기" onOk={() => { loadSample(); toast({ text: "샘플 불러옴" }); }} onClose={() => setConfirm(null)} />}
      {confirm === "demo" && <Confirm title="데모 모드" body={`지금 열린 ${areaName} 영역을 샘플로 바꾸고, 합성 모의 수업 스크립트와 추천 카드를 넣습니다. 쌓인 기록은 현황판에서 보고, 폰에서 기록하는 흐름은 상단의 모바일 확인에서 해 볼 수 있습니다. 모두 합성 데이터입니다.`} okLabel="시작" onOk={() => { import("../lib/demo").then((m) => m.startDemo()).then(() => { setDemoOn(true); toast({ text: "데모 모드 시작" }); }); }} onClose={() => setConfirm(null)} />}
      {confirm === "endDemo" && <Confirm title="데모 끝내기" body="데모가 넣은 합성 모의 수업 스크립트를 지웁니다. 샘플 명단·기록은 그대로 남습니다. 샘플까지 지우려면 같은 줄의 [모든 영역 데이터 삭제]를 쓰세요." okLabel="끝내기" onOk={() => { import("../lib/demo").then((m) => m.endDemo()).then(() => { setDemoOn(false); toast({ text: "데모 스크립트를 지웠습니다" }); }); }} onClose={() => setConfirm(null)} />}
      {confirm === "reset" && <Confirm title="모든 영역 데이터 삭제" body={`영역 ${stats.length}개의 명단·기록·초안과 공통 설정(동기화 키 포함)이 모두 삭제됩니다. 먼저 백업하세요.`} okLabel="모두 삭제" danger onOk={async () => { await resetEverything(); toast({ text: "초기화됨" }); }} onClose={() => setConfirm(null)} />}
    </>
  );
}

/* ---------- 개인정보 처리방침 (docs/PRIVACY.md → public/privacy.html) ---------- */
function PrivacySection() {
  const url = `${import.meta.env.BASE_URL}privacy.html`;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="flex" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
        <b>누가 개인정보 처리방침</b><span className="muted small">v1.0 · 2026-09-30</span><span className="grow" />
        <button className="btn sm" onClick={() => openExternal("https://github.com/dacisosl/NUGA/blob/main/docs/PRIVACY.md")}>원문(GitHub)</button>
      </div>
      <iframe title="개인정보 처리방침" src={url} style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }} />
    </div>
  );
}

/* ---------- 초안 프롬프트 (영역별) ---------- */
function PromptSection() {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  const toast = useStore((x) => x.toast);
  const areaName = s.school.subject || "현재 영역";
  const custom = s.draftPrompt.trim().length > 0;
  const base = defaultGuideFor(s.writeItem);
  const value = custom ? s.draftPrompt : base;
  const [confirmPreset, setConfirmPreset] = useState<string | null>(null);
  const applyPreset = (key: string) => {
    const p = DRAFT_PROMPT_PRESETS.find((x) => x.key === key); if (!p) return;
    setSettings({ draftPrompt: p.text === base ? "" : p.text }); toast({ text: `"${p.label}" 양식을 불러옴` });
  };
  return (
    <>
      <div className="card pad">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>초안 프롬프트 <span className="muted small">{areaName} 영역</span></h3>
          <span className="flex">
            <span className={`chip ${custom ? "check" : "pass"}`}>{custom ? "직접 설정" : `기본값 · ${WRITE_ITEM_LABEL[s.writeItem || "setuk"]}`}</span>
            <select className="select" value="" onChange={(e) => { if (e.target.value) setConfirmPreset(e.target.value); }}>
              <option value="">양식 불러오기</option>
              {DRAFT_PROMPT_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button className="btn sm" disabled={!custom} onClick={() => { setSettings({ draftPrompt: "" }); toast({ text: "기본 프롬프트로 되돌림" }); }}>기본값으로</button>
          </span>
        </div>
        <div className="muted small" style={{ margin: "6px 0 10px" }}>AI가 초안을 쓸 때 따르는 지침입니다. 영역마다 따로 저장됩니다. AI가 꺼져 있으면 규칙 기반 생성기가 동작하며 이 지침은 쓰이지 않습니다.</div>
        <textarea className="prompt-edit" rows={16} value={value} onChange={(e) => setSettings({ draftPrompt: e.target.value === base ? "" : e.target.value })} spellCheck={false} />
      </div>
      <div className="card pad">
        <h3>항상 덧붙는 출력 형식 <span className="muted small">바꿀 수 없음</span></h3>
        <div className="muted small" style={{ marginBottom: 8 }}>앱이 AI 응답을 읽고 문장마다 근거 기록을 연결하려면 이 형식이 필요합니다.</div>
        <pre className="prompt-fixed">{DRAFT_OUTPUT_RULES}</pre>
      </div>
      <div className="card pad">
        <h3>함께 전달되는 내용</h3>
        <div className="small muted">영역명, 학년·학년도·학기, 분량 한도, 학교급 문체 지침, 표현 방향(도달 정도에 맞는 서술어 강도와 어휘 · 숫자와 등급은 보내지 않음), 체크한 누가기록(날짜·분류·수업 주제·내용), PDF기록 발췌와 가린 전산화 글, 현재 초안과 대화 내역, 요청 문장. 반·번호·이름과 단원·차시 번호는 보내지 않습니다. 실제 전송 본문은 공통 설정 → AI → 전송 내용 미리보기에서 볼 수 있습니다.</div>
      </div>
      {confirmPreset && <Confirm title="양식 불러오기" body="지금 프롬프트를 선택한 양식으로 바꿉니다." okLabel="불러오기" onOk={() => applyPreset(confirmPreset)} onClose={() => setConfirmPreset(null)} />}
    </>
  );
}

/* ---------- 화면 (모든 영역 공통) ---------- */
function DisplaySection() {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  const view = useStore((x) => x.view);
  const setView = useStore((x) => x.setView);
  const badge = s.options.showLevelBadge !== false;
  return (
    <>
      <div className="card pad">
        <h3>처음에 보이는 정보</h3>
        <div className="arrival-opts">
          {([
            ["simple", "단순하게 (권장)", "알림 팝업에 추천 문구와 학생 명단만 보입니다. 발언 원문·앞뒤 문맥·판단 기준·카테고리는 카드의 [자세히]를 눌러 봅니다. 수동 기록도 메모와 입력칸만 보이고, 수업 발언 후보는 [자세히]에 있습니다."],
            ["full", "처음부터 자세히", "근거가 모두 펼쳐진 채로 열립니다. 발언 원문, 앞뒤 문맥, 판단 기준, 카테고리 선택이 바로 보입니다."],
          ] as const).map(([k, title, desc]) => (
            <label key={k} className={`arrival-opt ${(s.options.detail || "simple") === k ? "on" : ""}`}>
              <input type="radio" name="detail" checked={(s.options.detail || "simple") === k} onChange={() => setSettings((x) => ({ ...x, options: { ...x.options, detail: k } }))} />
              <span><b>{title}</b><span className="muted small block">{desc}</span></span>
            </label>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>어느 쪽이든 카드마다 [자세히]/[접기]로 그때그때 펼치고 접을 수 있습니다. 이 설정은 모든 영역에 공통입니다.</div>
      </div>
      <div className="card pad">
        <h3>학생 이름표</h3>
        <div className="col" style={{ gap: 12 }}>
          <Switch on={badge} onChange={(v) => setSettings((x) => ({ ...x, options: { ...x.options, showLevelBadge: v } }))} label={badge ? "도달 정도 숫자 표시 — 이름표 오른쪽 위 숫자를 누르면 조정" : "도달 정도 숫자 숨김 — 이름표 바탕색으로만 표시"} />
          <span className="flex wrap" style={{ gap: 20, paddingTop: 8 }}>
            {[null, 10, 30, 50, 70, 90].map((v, i) => <StudentTagPreview key={i} value={v} badge={badge} />)}
            <StudentTagPreview value={45} badge={badge} low />
            <StudentTagPreview value={88} badge={badge} edited />
          </span>
          <div className="muted small">바탕색은 성취기준 도달 정도(0~100)를 파랑 5단계로 나타냅니다. 빗금은 추정 불가, 점선은 근거 기록이 적은 자동값, 연필은 교사가 조정한 값입니다. 도달 정도는 생기부·내보내기에 나오지 않고 초안의 표현 방향만 바꿉니다.</div>
        </div>
      </div>
      <div className="card pad">
        <h3>초안 보기</h3>
        <div className="col" style={{ gap: 12 }}>
          <Switch on={view.split} onChange={(v) => setView({ split: v })} label="한 문장씩 나눠 보기" />
          <Switch on={view.highlight} onChange={(v) => setView({ highlight: v })} label="구별하기 — 학생활동·역량·교사의 평가를 형광펜으로" />
          <div className="muted small">초안 작성·검토 화면 위쪽의 스위치와 같은 설정입니다. 이 PC에만 저장됩니다.</div>
        </div>
      </div>
    </>
  );
}

function StudentTagPreview({ value, badge, low, edited }: { value: number | null; badge: boolean; low?: boolean; edited?: boolean }) {
  const step = value === null ? "x" : String(Math.min(4, Math.floor(value / 20)));
  return <span className={`stag g${step} md ${badge ? "" : "nob"} ${low ? "lowconf" : ""}`} title={value === null ? "추정 불가" : `도달 정도 ${value}`}><span className="stag-name">학생</span>{badge && <span className="stag-lv">{value ?? "—"}{edited && <svg className="pen" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>}</span>}</span>;
}
