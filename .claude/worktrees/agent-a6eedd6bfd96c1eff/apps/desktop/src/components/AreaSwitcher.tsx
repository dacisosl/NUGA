import React, { useState } from "react";
import { useStore } from "../store";
import { Icon, Modal, Switch } from "./ui";

/**
 * 상단 영역 목록: 영역명을 나란히 나열하고 눌러서 전환, 끝의 + 버튼으로 추가.
 * 누른 영역은 불러오는 동안에도 바로 켜진 모습으로 보인다 (lit). ←/→ 로 영역 사이를 옮겨 다닌다
 */
export function AreaSwitcher() {
  const doc = useStore((s) => s.doc);
  const areas = useStore((s) => s.areas);
  const areaId = useStore((s) => s.areaId);
  const switchArea = useStore((s) => s.switchArea);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const curName = doc.settings.school.subject.trim();
  const lit = pending ?? areaId;
  const pick = (id: string) => {
    if (id === areaId || pending) return;
    setPending(id);
    switchArea(id).finally(() => setPending(null));
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus();
  };
  return (
    <div className="area-list" role="tablist" aria-label="영역" onKeyDown={onKey}>
      {areas.map((a) => {
        const on = a.id === areaId;
        return (
          <button key={a.id} role="tab" aria-selected={on} className={`area-pill ${a.id === lit ? "on" : ""} ${pending === a.id ? "pending" : ""}`} onClick={() => pick(a.id)} title={on ? "현재 영역" : `${a.name}(으)로 전환`}>
            {on ? curName || a.name : a.name}
          </button>
        );
      })}
      <button className="area-add" onClick={() => setAdding(true)} title="영역 추가" aria-label="영역 추가"><Icon name="plus" /></button>
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
  const { grade, year, semester } = doc.settings.school;
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
        <Switch on={copy} onChange={setCopy} label={`현재 영역(${doc.settings.school.subject || "미설정"})의 반·명단 복사 (${doc.students.length}명)`} />
        <div className="muted small">영역마다 명단·기록·초안·시간표가 따로 저장됩니다. 동기화 키, AI 설정, 카테고리·교시 시간은 이어받습니다.</div>
      </div>
    </Modal>
  );
}
