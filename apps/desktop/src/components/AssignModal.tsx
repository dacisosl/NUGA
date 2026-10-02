import React, { useState } from "react";
import { lessonFor, nowIso, segmentDate, type Category, type Transcript, type TranscriptSegment } from "@nuga/core";
import { studentsOf, useStore } from "../store";
import { Chip, Modal, StudentTag } from "./ui";

/**
 * 학생 지정: 번호(이름)를 고르면 누가기록으로 저장한다. 출처 "추천".
 * 발언 원문은 메모로, 추천 이유는 관찰 내용 초안으로 넣는다 (보완에서 고칠 수 있음).
 * 화자 라벨과 학생 번호의 연결은 저장하지 않는다.
 */
export function AssignModal({ tr, segs, category, reason, onClose, onDone }: { tr: Transcript; segs: TranscriptSegment[]; category: Category; reason: string; onClose: () => void; onDone?: (recordId: string) => void }) {
  const doc = useStore((s) => s.doc);
  const addRecord = useStore((s) => s.addRecord);
  const toast = useStore((s) => s.toast);
  const openSupplement = useStore((s) => s.openSupplement);
  const [cat, setCat] = useState<Category>(category);
  const [note, setNote] = useState(reason);
  const students = studentsOf(doc, tr.class);
  const at = segmentDate(tr, segs[0]);
  const save = (no: number) => {
    const supp = doc.settings.supplementEnabled;
    const rec = addRecord({
      class: tr.class, no, category: cat, time: nowIso(at), lesson: lessonFor(doc.settings.progress, tr.class, nowIso(at)),
      memo: `“${segs.map((x) => x.text).join(" ")}”`, voiceMemo: null, note: note.trim(), status: supp ? "pending" : "confirmed", source: "suggestion",
    });
    onDone?.(rec.id);
    const name = students.find((x) => x.no === no)?.name || `${no}번`;
    toast({ text: `${tr.class} ${name} 누가기록 저장 (추천)`, kind: "notice", action: { label: "보완하기", onClick: () => openSupplement([rec.id]) } });
    onClose();
  };
  return (
    <Modal title={`학생 지정 · ${tr.class}`} onClose={onClose} width="wide">
      <div className="col" style={{ gap: 10 }}>
        <div className="sg-text">“{segs.map((x) => x.text).join(" ")}”</div>
        <div className="flex wrap">{doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={c.label} selected={cat === c.key} onClick={() => setCat(c.key)} />)}</div>
        <div className="field"><label>관찰 내용 (누가기록 보완 문구)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="muted small">누구의 발언인지 떠올려 학생을 고르세요. 화자 라벨과 학생은 연결해 저장하지 않습니다.{doc.settings.recording ? " 폰에서 이 구간을 다시 들을 수 있습니다(음성 보존 기간 안)." : ""}</div>
        {students.length === 0 ? <div className="muted">이 반의 명단이 없습니다.</div> : (
          <div className="assign-grid">
            {students.map((st) => (
              <button key={st.no} className="assign-cell" onClick={() => save(st.no)}><span className="num muted small">{st.no}</span><StudentTag student={st} size="sm" /></button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
