import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  WEEKDAY_LABELS, buildDraftRequest, buildPairingUri, classSortKey, decryptBackup, encryptBackup, generateSyncKey, keyIdOf, nowIso, parseImportJson, progressFromRows, studentsFromRows, toB64, toExportJson,
  type BackupContainer, type Level, type ProgressRow, type Student,
} from "@nuga/core";
import { TopBar } from "../App";
import { classList, perfsOf, recordsOf, useStore } from "../store";
import { Confirm, Icon, LevelBadge, Modal, Switch } from "../components/ui";
import { exportSheets, readSheetRows, templateProgress, templateStudents } from "../lib/excel";
import { pickFile, readFileAsText, saveFile, hostName } from "../lib/platform";
import { previewPayload } from "../lib/ai";
import { syncEngine } from "../lib/syncEngine";

const TABS: { key: string; label: string }[] = [
  { key: "subject", label: "과목" }, { key: "roster", label: "반·명단" }, { key: "timetable", label: "시간표" }, { key: "progress", label: "진도" },
  { key: "category", label: "카테고리" }, { key: "length", label: "글자수·기준" }, { key: "sync", label: "동기화" }, { key: "backup", label: "백업" }, { key: "ai", label: "AI" }, { key: "data", label: "데이터" },
];

export function SettingsPage() {
  const tab = useStore((s) => s.settingsTab);
  const setTab = useStore((s) => s.setSettingsTab);
  return (
    <>
      <TopBar title="설정" />
      <div className="tabsrow" style={{ borderBottom: "none" }} />
      <div className="content">
        <div className="settings-layout">
          <nav className="settings-nav">{TABS.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}</nav>
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
            {tab === "data" && <DataSection />}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 과목 ---------- */
export function SubjectSection() {
  const school = useStore((s) => s.doc.settings.school);
  const setSettings = useStore((s) => s.setSettings);
  const up = (p: Partial<typeof school>) => setSettings((s) => ({ ...s, school: { ...s.school, ...p } }));
  return (
    <div className="card pad">
      <h3>과목</h3>
      <div className="grid2">
        <div className="field"><label>담당 과목</label><input value={school.subject} onChange={(e) => up({ subject: e.target.value })} placeholder="예: 화학Ⅰ" /></div>
        <div className="field"><label>학년</label><select className="select" value={school.grade} onChange={(e) => up({ grade: Number(e.target.value) })}>{[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}</select></div>
        <div className="field"><label>학년도</label><input type="number" className="num" value={school.year} onChange={(e) => up({ year: Number(e.target.value) })} /></div>
        <div className="field"><label>학기</label><select className="select" value={school.semester} onChange={(e) => up({ semester: Number(e.target.value) })}><option value={1}>1학기</option><option value={2}>2학기</option></select></div>
      </div>
    </div>
  );
}

/* ---------- 반·명단 ---------- */
export function RosterSection() {
  const doc = useStore((s) => s.doc);
  const setStudents = useStore((s) => s.setStudents);
  const upsertStudent = useStore((s) => s.upsertStudent);
  const removeStudent = useStore((s) => s.removeStudent);
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
    const c = newClass.trim().replace(/\s/g, "");
    if (!/^\d+-\d+$/.test(c)) { toast({ text: "형식: 2-3" }); return; }
    setSettings((s) => ({ ...s, classes: s.classes.some((x) => x.class === c) ? s.classes : [...s.classes, { class: c, size: 0 }].sort((a, b) => classSortKey(a.class) - classSortKey(b.class)) }));
    setCls(c); setNewClass("");
  };
  const deleteClass = (c: string) => {
    setStudents(doc.students.filter((s) => s.class !== c));
    setSettings((s) => ({ ...s, classes: s.classes.filter((x) => x.class !== c), timetable: s.timetable.filter((t) => t.class !== c) }));
  };
  const addRow = () => { const no = (list[list.length - 1]?.no || 0) + 1; upsertStudent({ class: cls, no, name: "", level: "B" }); };
  const setSize = (n: number) => setSettings((s) => ({ ...s, classes: s.classes.map((x) => x.class === cls ? { ...x, size: n } : x) }));
  const size = doc.settings.classes.find((c) => c.class === cls)?.size || list.length;

  return (
    <>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>반</h3><span className="flex"><input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="2-3" style={{ width: 80 }} onKeyDown={(e) => e.key === "Enter" && addClass()} /><button className="btn sm" onClick={addClass}><Icon name="plus" size={14} />반 추가</button></span></div>
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
            <thead><tr><th style={{ width: 70 }}>번호</th><th>이름</th><th style={{ width: 120 }}>수준</th><th style={{ width: 80 }}>기록</th><th style={{ width: 50 }} /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.no} style={{ height: 44 }}>
                  <td className="tight"><input type="number" className="cell-edit num" value={s.no} onChange={(e) => { const no = Number(e.target.value); if (no > 0) { removeStudent(s.class, s.no); upsertStudent({ ...s, no }); } }} style={{ width: 50 }} /></td>
                  <td className="tight"><input className="cell-edit" value={s.name} placeholder="이름" onChange={(e) => upsertStudent({ ...s, name: e.target.value })} /></td>
                  <td className="tight"><span className="seg">{(["A", "B", "C"] as Level[]).map((l) => <button key={l} className={s.level === l ? "active" : ""} style={{ height: 26, padding: "0 10px" }} onClick={() => upsertStudent({ ...s, level: l })}>{l}</button>)}</span></td>
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

function PasteModal({ cls, onClose }: { cls: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const setStudents = useStore((s) => s.setStudents);
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState("");
  const parsed = useMemo(() => text.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const parts = l.split(/[\t,\s]+/);
    const noIdx = parts.findIndex((p) => /^\d+$/.test(p));
    const no = noIdx >= 0 ? parseInt(parts[noIdx], 10) : i + 1;
    const name = parts.find((p, k) => k !== noIdx && /[가-힣a-zA-Z]{2,}/.test(p)) || "";
    const lv = parts.find((p) => /^[ABCabc]$/.test(p))?.toUpperCase() as Level | undefined;
    return { class: cls, no, name, level: lv || "B" } as Student;
  }).filter((s) => s.name), [text, cls]);
  const apply = () => {
    const others = doc.students.filter((s) => !(s.class === cls && parsed.some((p) => p.no === s.no)));
    setStudents([...others, ...parsed]); toast({ text: `${parsed.length}명 추가` }); onClose();
  };
  return (
    <Modal title={`${cls} 명단 붙여넣기`} onClose={onClose} width="narrow" footer={<><span className="muted small">{parsed.length}명 인식</span><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={!parsed.length} onClick={apply}>추가</button></>}>
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"한 줄에 한 명: 번호 이름 [수준]\n1 김민준 A\n2 이서연"} />
    </Modal>
  );
}

/* ---------- 시간표 ---------- */
export function TimetableSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const classes = classList(doc);
  const [pick, setPick] = useState(classes[0] || "");
  useEffect(() => { if (!classes.includes(pick)) setPick(classes[0] || ""); }, [classes.join(",")]);
  const cell = (w: number, p: number) => doc.settings.timetable.find((t) => t.weekday === w && t.period === p);
  const click = (w: number, p: number) => setSettings((s) => {
    const cur = s.timetable.find((t) => t.weekday === w && t.period === p);
    const rest = s.timetable.filter((t) => !(t.weekday === w && t.period === p));
    if (!cur) return { ...s, timetable: pick ? [...rest, { weekday: w, period: p, class: pick }] : s.timetable };
    if (cur.class === pick) return { ...s, timetable: rest };
    return { ...s, timetable: [...rest, { weekday: w, period: p, class: pick }] };
  });
  const setPeriod = (no: number, k: "start" | "end", v: string) => setSettings((s) => ({ ...s, periods: s.periods.map((p) => p.no === no ? { ...p, [k]: v } : p) }));
  const addPeriod = () => setSettings((s) => { const last = s.periods[s.periods.length - 1]; return { ...s, periods: [...s.periods, { no: (last?.no || 0) + 1, start: last ? addMin(last.end, 10) : "08:50", end: last ? addMin(last.end, 60) : "09:40" }] }; });
  const removePeriod = () => setSettings((s) => ({ ...s, periods: s.periods.slice(0, -1), timetable: s.timetable.filter((t) => t.period < s.periods.length) }));
  return (
    <>
      <div className="card pad">
        <div className="flex between"><h3 style={{ margin: 0 }}>주간 시간표</h3><span className="flex small muted">칠할 반 {classes.map((c) => <button key={c} className={`chip clickable outline ${pick === c ? "selected" : ""}`} onClick={() => setPick(c)}>{c}</button>)}</span></div>
        <div className="muted small" style={{ margin: "6px 0 12px" }}>칸을 클릭하면 선택한 반이 들어가고, 다시 클릭하면 지워집니다.</div>
        <div className="ttgrid">
          <div />{[1, 2, 3, 4, 5].map((w) => <div key={w} className="h">{WEEKDAY_LABELS[w]}</div>)}
          {doc.settings.periods.map((p) => (
            <React.Fragment key={p.no}>
              <div className="p">{p.no}교시</div>
              {[1, 2, 3, 4, 5].map((w) => { const c = cell(w, p.no); return <button key={w} className={`ttcell ${c ? "on" : ""}`} onClick={() => click(w, p.no)}>{c?.class || ""}</button>; })}
            </React.Fragment>
          ))}
        </div>
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
  const rows = doc.settings.progress.map((p, i) => ({ ...p, i })).filter((p) => cls === "all" || p.class === cls).sort((a, b) => a.date.localeCompare(b.date) || classSortKey(a.class) - classSortKey(b.class));
  const up = (i: number, patch: Partial<ProgressRow>) => setSettings((s) => ({ ...s, progress: s.progress.map((p, k) => k === i ? { ...p, ...patch } : p) }));
  const del = (i: number) => setSettings((s) => ({ ...s, progress: s.progress.filter((_, k) => k !== i) }));
  const add = () => setSettings((s) => ({ ...s, progress: [...s.progress, { date: nowIso().slice(0, 10), class: cls === "all" ? classes[0] || "" : cls, unit: "", lesson: 1, title: "" }] }));
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
        <h3 style={{ margin: 0 }}>진도 <span className="muted small">{rows.length}행</span></h3>
        <span className="flex">
          <select className="select" value={cls} onChange={(e) => setCls(e.target.value)}><option value="all">전체 반</option>{classes.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn sm" onClick={importExcel}><Icon name="excel" size={14} />엑셀 가져오기</button>
          <button className="btn sm" onClick={() => exportSheets("진도-양식.xlsx", [{ name: "진도", rows: templateProgress() }])}>양식</button>
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
              <td className="tight"><input type="number" className="cell-edit num" value={p.lesson} onChange={(e) => up(p.i, { lesson: Number(e.target.value) })} /></td>
              <td className="tight"><input className="cell-edit" value={p.title} placeholder="화학 평형" onChange={(e) => up(p.i, { title: e.target.value })} /></td>
              <td className="tight"><button className="btn ghost icon sm" onClick={() => del(p.i)}><Icon name="trash" size={14} /></button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted small" style={{ textAlign: "center" }}>진도 없음 — 기록의 단원·차시는 이 표에서 자동으로 채워집니다</td></tr>}
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
  return (
    <div className="card pad">
      <h3>글자수 · 판단 기준</h3>
      <div className="grid2">
        <div className="field"><label>세특 목표 글자수</label><input type="number" className="num" value={s.targetLength["세특"] || 500} onChange={(e) => setSettings((x) => ({ ...x, targetLength: { ...x.targetLength, "세특": Number(e.target.value) } }))} /><span className="muted small">허용 구간 N−20 ~ N−1 · NEIS 바이트는 검토 패널에 병기</span></div>
        <div className="field"><label>글자수 기준</label><span className="seg"><button className={s.lengthMode === "withSpaces" ? "active" : ""} onClick={() => setSettings({ lengthMode: "withSpaces" })}>공백 포함</button><button className={s.lengthMode === "withoutSpaces" ? "active" : ""} onClick={() => setSettings({ lengthMode: "withoutSpaces" })}>공백 제외</button></span></div>
        <div className="field"><label>기록 부족 기준 (건 이하)</label><input type="number" className="num" value={s.lowRecordThreshold} onChange={(e) => setSettings({ lowRecordThreshold: Number(e.target.value) })} /></div>
        <div className="field"><label>문장 유사도 임계값 (0~1)</label><input type="number" step="0.05" min="0.3" max="1" className="num" value={s.similarityThreshold} onChange={(e) => setSettings({ similarityThreshold: Number(e.target.value) })} /></div>
      </div>
    </div>
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
            <div className="flex small"><span className="muted">워치 번호 릴 시작</span><span className="seg"><button className={doc.settings.options.reelStart === "one" ? "active" : ""} onClick={() => setSettings((s) => ({ ...s, options: { ...s.options, reelStart: "one" } }))}>항상 1번</button><button className={doc.settings.options.reelStart === "last" ? "active" : ""} onClick={() => setSettings((s) => ({ ...s, options: { ...s.options, reelStart: "last" } }))}>마지막 번호</button></span></div>
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
  const doc = useStore((s) => s.doc);
  const replaceDoc = useStore((s) => s.replaceDoc);
  const toast = useStore((s) => s.toast);
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"export" | "import" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const doExport = async () => {
    if (pw.length < 4) { toast({ text: "비밀번호 4자 이상" }); return; }
    const c = await encryptBackup(pw, toExportJson(doc, nowIso()), nowIso());
    if (await saveFile(`누가-암호백업-${nowIso().slice(0, 10)}.nuga`, JSON.stringify(c), [{ name: "누가 백업", extensions: ["nuga"] }])) toast({ text: "암호화 백업 저장" });
    setMode(null); setPw("");
  };
  const doImport = async () => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const j = JSON.parse(text);
      const json = j.format === "nuga-backup" ? await decryptBackup(pw, j as BackupContainer) : text;
      replaceDoc(parseImportJson(json)); toast({ text: "불러오기 완료" }); setMode(null); setPw("");
    } catch (e) { toast({ text: e instanceof Error ? e.message : "불러오기 실패" }); }
  };
  const pickImport = async () => { const [f] = await pickFile(".nuga,.json"); if (!f) return; setFile(f); setMode("import"); };
  return (
    <>
      <div className="card pad">
        <h3>백업</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>서버에는 원본이 없습니다. 학기 중 주기적으로 내보내 보관하세요. 현재 데이터: 학생 {doc.students.length} · 기록 {doc.records.length} · 초안 {doc.drafts.length}</div>
        <div className="flex"><button className="btn primary" onClick={() => setMode("export")}>암호화 백업 내보내기</button><button className="btn" onClick={pickImport}>백업 / JSON 불러오기</button></div>
      </div>
      {mode && (
        <Modal title={mode === "export" ? "백업 비밀번호" : `불러오기 · ${file?.name}`} onClose={() => setMode(null)} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={() => setMode(null)}>취소</button><button className="btn primary" onClick={mode === "export" ? doExport : doImport}>{mode === "export" ? "내보내기" : "불러오기 (덮어씀)"}</button></>}>
          <div className="field"><label>비밀번호 {mode === "import" && <span className="muted">(JSON 파일이면 비워 둠)</span>}</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && (mode === "export" ? doExport() : doImport())} /></div>
          {mode === "import" && <div className="muted small" style={{ marginTop: 8 }}>현재 데이터가 파일 내용으로 대체됩니다.</div>}
        </Modal>
      )}
    </>
  );
}

/* ---------- AI ---------- */
function AiSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const ai = doc.settings.ai;
  const [preview, setPreview] = useState<string | null>(null);
  const up = (p: Partial<typeof ai>) => setSettings((s) => ({ ...s, ai: { ...s.ai, ...p } }));
  const showPreview = () => {
    const s = doc.students.find((x) => recordsOf(doc, x.class, x.no).length > 0) || doc.students[0];
    const recs = s ? recordsOf(doc, s.class, s.no) : [];
    const req = buildDraftRequest({ level: s?.level || "B", targetLength: doc.settings.targetLength["세특"] || 500, lengthMode: doc.settings.lengthMode, subject: doc.settings.school.subject, records: recs, performances: s ? perfsOf(doc, s.class, s.no) : [], categories: doc.settings.categories });
    setPreview(previewPayload(req));
  };
  return (
    <>
      <div className="card pad">
        <h3>AI 초안 생성</h3>
        <div className="col" style={{ gap: 12 }}>
          <Switch on={ai.enabled} onChange={(v) => up({ enabled: v, provider: v ? "anthropic" : "local" })} label="Claude API 사용 (끄면 규칙 기반 로컬 생성기로 동작)" />
          {ai.enabled && (
            <div className="grid2">
              <div className="field"><label>API 키</label><input type="password" value={ai.apiKey} onChange={(e) => up({ apiKey: e.target.value })} placeholder="sk-ant-…" /><span className="muted small">이 PC에만 저장되며 JSON 내보내기에서 제외됩니다.</span></div>
              <div className="field"><label>모델</label><select className="select" value={ai.model} onChange={(e) => up({ model: e.target.value })}><option value="claude-opus-5-5">claude-opus-5-5 (권장)</option><option value="claude-sonnet-5-5">claude-sonnet-5-5</option><option value="claude-haiku-4-5">claude-haiku-4-5</option></select></div>
            </div>
          )}
          <div className="flex"><button className="btn" onClick={showPreview}>전송 내용 미리보기</button><span className="muted small">반·번호·이름은 전송되지 않습니다. 기록 내용·단원·수준·목표 글자수만 전송.</span></div>
        </div>
      </div>
      {preview !== null && <Modal title="AI에 전송되는 내용 (예시 학생)" onClose={() => setPreview(null)} width="wide"><pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 12, borderRadius: 8, maxHeight: "60vh", overflow: "auto" }}>{preview}</pre></Modal>}
    </>
  );
}

/* ---------- 데이터 ---------- */
function DataSection() {
  const doc = useStore((s) => s.doc);
  const loadSample = useStore((s) => s.loadSample);
  const resetAll = useStore((s) => s.resetAll);
  const toast = useStore((s) => s.toast);
  const [confirm, setConfirm] = useState<"sample" | "reset" | null>(null);
  const [loc, setLoc] = useState("");
  useEffect(() => { import("../lib/persist").then((m) => m.getPersist()).then((p) => setLoc(p.location())); }, []);
  return (
    <>
      <div className="card pad">
        <h3>데이터</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>저장 위치: <span className="mono">{loc}</span></div>
        <div className="flex"><button className="btn" onClick={() => setConfirm("sample")}>샘플 데이터 불러오기</button><button className="btn ghost" style={{ color: "var(--warn)" }} onClick={() => setConfirm("reset")}>모든 데이터 삭제</button></div>
        <div className="muted small" style={{ marginTop: 10 }}>학생 {doc.students.length} · 기록 {doc.records.length} · 수행평가 {doc.performances.length} · 초안 {doc.drafts.length}</div>
      </div>
      {confirm === "sample" && <Confirm title="샘플 데이터" body="현재 데이터를 샘플(화학Ⅰ · 2개 반)로 대체합니다. 동기화·AI 설정은 유지됩니다." okLabel="불러오기" onOk={() => { loadSample(); toast({ text: "샘플 불러옴" }); }} onClose={() => setConfirm(null)} />}
      {confirm === "reset" && <Confirm title="모든 데이터 삭제" body="명단·기록·초안·설정이 모두 삭제됩니다. 먼저 백업하세요." okLabel="삭제" danger onOk={() => { resetAll(); toast({ text: "초기화됨" }); }} onClose={() => setConfirm(null)} />}
    </>
  );
}
