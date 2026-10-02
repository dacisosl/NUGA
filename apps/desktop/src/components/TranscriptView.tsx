import React, { useEffect, useMemo, useState } from "react";
import { formatClock, segmentDate, teacherOf, type Transcript, type TranscriptSegment } from "@nuga/core";
import { useTranscripts } from "../lib/transcripts";
import { Modal } from "./ui";

const SPEAKER_COLORS = ["#2448C9", "#0D6660", "#6C33A3", "#B4470B", "#4A4E5A", "#1F7A3A", "#8A2B5B", "#5B6B00"];
export function speakerColor(tr: Transcript, speaker: string): string {
  const list = [...new Set(tr.segments.map((s) => s.speaker))].sort();
  return SPEAKER_COLORS[Math.max(0, list.indexOf(speaker)) % SPEAKER_COLORS.length];
}

/** 스크립트 한 줄: 시각 · 화자 라벨 · 발언 */
export function SegmentLine({ tr, seg, highlight, action }: { tr: Transcript; seg: TranscriptSegment; highlight?: boolean; action?: React.ReactNode }) {
  const at = segmentDate(tr, seg);
  const teacher = teacherOf(tr) === seg.speaker;
  return (
    <div className={`seg-line ${highlight ? "hl" : ""} ${teacher ? "teacher" : ""}`}>
      <span className="seg-time num">{String(at.getHours()).padStart(2, "0")}:{String(at.getMinutes()).padStart(2, "0")}:{String(at.getSeconds()).padStart(2, "0")}</span>
      <span className="seg-spk" style={{ color: speakerColor(tr, seg.speaker) }}>{seg.speaker}{teacher ? " (교사 추정)" : ""}</span>
      <span className="seg-text">{seg.text}</span>
      {action}
    </div>
  );
}

/** 스크립트 보기 창: 화자별 색, 교사 추정 화자 확인·변경, 교사 발언 숨기기 */
export function TranscriptModal({ id, onClose, focusSegment }: { id: string; onClose: () => void; focusSegment?: string }) {
  const getT = useTranscripts((s) => s.get);
  const setTeacher = useTranscripts((s) => s.setTeacher);
  const meta = useTranscripts((s) => s.index.find((m) => m.id === id));
  const [tr, setTr] = useState<Transcript | null>(null);
  const [hideTeacher, setHideTeacher] = useState(false);
  useEffect(() => { getT(id).then(setTr); }, [id, meta?.teacher]);
  const speakers = useMemo(() => {
    if (!tr) return [];
    const m = new Map<string, number>();
    for (const s of tr.segments) m.set(s.speaker, (m.get(s.speaker) || 0) + Array.from(s.text).length);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [tr]);
  useEffect(() => { if (focusSegment) setTimeout(() => document.getElementById(`seg-${focusSegment}`)?.scrollIntoView({ block: "center" }), 50); }, [tr, focusSegment]);
  if (!tr) return <Modal title="스크립트" onClose={onClose} width="wide"><div className="muted">불러오는 중…</div></Modal>;
  const teacher = teacherOf(tr);
  const start = new Date(tr.startedAt);
  return (
    <Modal onClose={onClose} width="xl" header={
      <div className="flex wrap" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>{tr.class}{tr.period ? ` · ${tr.period}교시` : ""}</h2>
        <span className="muted small">{start.getMonth() + 1}/{start.getDate()} {String(start.getHours()).padStart(2, "0")}:{String(start.getMinutes()).padStart(2, "0")} · {formatClock((new Date(tr.endedAt).getTime() - start.getTime()) / 1000)} · 발언 {tr.segments.length}개 · {tr.engine.provider} {tr.engine.model}</span>
      </div>
    }>
      <div className="flex wrap" style={{ gap: 8, marginBottom: 10 }}>
        <span className="small muted">교사 추정 화자</span>
        <select className="select" value={teacher || ""} onChange={(e) => setTeacher(id, e.target.value || null).then(() => getT(id).then(setTr))}>
          {speakers.map(([s, n]) => <option key={s} value={s}>{s} · {n.toLocaleString("ko-KR")}자{s === tr.teacherSpeaker.auto ? " (자동)" : ""}</option>)}
        </select>
        <label className="flex small" style={{ gap: 6 }}><input type="checkbox" checked={hideTeacher} onChange={(e) => setHideTeacher(e.target.checked)} />교사 발언 숨기기</label>
        <span className="grow" />
        <span className="muted small">화자 라벨은 이 수업 안에서만 의미가 있고, 학생과 연결해 저장하지 않습니다.</span>
      </div>
      <div className="seg-list">
        {tr.segments.filter((s) => !(hideTeacher && s.speaker === teacher)).map((s) => <div key={s.id} id={`seg-${s.id}`}><SegmentLine tr={tr} seg={s} highlight={s.id === focusSegment} /></div>)}
        {!tr.segments.length && <div className="muted">받아쓴 발언이 없습니다.</div>}
      </div>
    </Modal>
  );
}
