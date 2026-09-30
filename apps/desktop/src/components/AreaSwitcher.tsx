import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { Icon, Modal, Switch } from "./ui";

/** 상단 영역 배지: 클릭하면 영역 목록, 옆 + 버튼으로 새 영역 추가 */
export function AreaSwitcher() {
  const doc = useStore((s) => s.doc);
  const areas = useStore((s) => s.areas);
  const areaId = useStore((s) => s.areaId);
  const switchArea = useStore((s) => s.switchArea);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h); return () => window.removeEventListener("mousedown", h);
  }, [open]);
  const subject = doc.settings.school.subject || "영역 미설정";
  return (
    <div className="area-wrap" ref={ref}>
      <button className="area" onClick={() => setOpen(!open)} title="영역 전환">
        <b>{subject}</b>
        <span className="meta">{doc.settings.school.grade}학년 · {doc.settings.school.year}-{doc.settings.school.semester}</span>
        <span className="caret">▾</span>
      </button>
      <button className="area-add" onClick={() => setAdding(true)} title="영역 추가"><Icon name="plus" /></button>
      {open && (
        <div className="menu">
          {areas.map((a) => (
            <button key={a.id} className={`item ${a.id === areaId ? "on" : ""}`} onClick={() => { setOpen(false); switchArea(a.id); }}>
              <span>{a.id === areaId ? "✓" : ""}</span><span>{a.name}</span>
            </button>
          ))}
          <div className="sep" />
          <button className="item" onClick={() => { setOpen(false); setAdding(true); }}><Icon name="plus" size={14} />새 영역 추가</button>
          <button className="item" onClick={() => { setOpen(false); useStore.getState().setSettingsTab("subject"); useStore.getState().setPage("settings"); }}><Icon name="gear" size={14} />영역 관리</button>
        </div>
      )}
      {adding && <AreaModal onClose={() => setAdding(false)} />}
    </div>
  );
}

export function AreaModal({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const addArea = useStore((s) => s.addArea);
  const setPage = useStore((s) => s.setPage);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(doc.settings.school.grade);
  const [year, setYear] = useState(doc.settings.school.year);
  const [semester, setSemester] = useState(doc.settings.school.semester);
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await addArea({ name, grade, year, semester, copyRoster: copy });
    setBusy(false); onClose();
    toast({ text: `영역 "${name.trim()}" 추가됨` });
    if (!copy) { setSettingsTab("roster"); setPage("settings"); }
  };
  return (
    <Modal title="새 영역" onClose={onClose} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={!name.trim() || busy} onClick={create}>{busy ? "만드는 중" : "만들기"}</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="field"><label>영역명</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 화학Ⅰ / 과학탐구 동아리 / 행동특성" onKeyDown={(e) => e.key === "Enter" && create()} /></div>
        <div className="grid3">
          <div className="field"><label>학년</label><select className="select" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}</select></div>
          <div className="field"><label>학년도</label><input type="number" className="num" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
          <div className="field"><label>학기</label><select className="select" value={semester} onChange={(e) => setSemester(Number(e.target.value))}><option value={1}>1학기</option><option value={2}>2학기</option></select></div>
        </div>
        <Switch on={copy} onChange={setCopy} label={`현재 영역(${doc.settings.school.subject || "미설정"})의 반·명단 복사 (${doc.students.length}명)`} />
        <div className="muted small">영역마다 명단·기록·초안·시간표가 따로 저장됩니다. 동기화 키, AI 설정, 카테고리·교시 시간은 이어받습니다.</div>
      </div>
    </Modal>
  );
}
