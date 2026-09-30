import React, { useState } from "react";
import type { Level, Student } from "@nuga/core";
import { useStore } from "../store";
import { Modal } from "./ui";

/** 학생 번호·이름·수준 수정. 번호를 바꾸면 기록·초안·PDF기록도 함께 옮겨진다. */
export function StudentEditModal({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved?: (s: Student, oldNo: number) => void }) {
  const editStudent = useStore((s) => s.editStudent);
  const toast = useStore((s) => s.toast);
  const [no, setNo] = useState(String(student.no));
  const [name, setName] = useState(student.name);
  const [level, setLevel] = useState<Level>(student.level);
  const [err, setErr] = useState("");
  const save = () => {
    const r = editStudent(student.class, student.no, { no: Number(no), name, level });
    if (!r.ok) { setErr(r.message || "저장 실패"); return; }
    toast({ text: `${student.class} · ${r.student!.no}번 ${r.student!.name} 수정됨` });
    onSaved?.(r.student!, student.no); onClose();
  };
  return (
    <Modal title={`학생 수정 · ${student.class}`} onClose={onClose} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" onClick={save}>저장</button></>}>
      <div className="col" style={{ gap: 12 }} onKeyDown={(e) => { if (e.key === "Enter") save(); }}>
        <div className="grid2" style={{ gridTemplateColumns: "100px 1fr" }}>
          <div className="field"><label>번호</label><input type="number" className="num" min={1} value={no} onChange={(e) => { setNo(e.target.value); setErr(""); }} /></div>
          <div className="field"><label>이름</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <div className="field"><label>수준</label><span className="seg">{(["A", "B", "C"] as Level[]).map((l) => <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>{l}</button>)}</span></div>
        {err && <div className="small" style={{ color: "var(--warn)" }}>{err}</div>}
        <div className="muted small">번호를 바꾸면 이 학생의 누가기록·초안·PDF기록도 새 번호로 함께 옮겨집니다.</div>
      </div>
    </Modal>
  );
}
