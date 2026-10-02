import React, { useEffect, useMemo, useState } from "react";
import { DEMO_LESSON, formatClock, parseClock, type Category } from "@nuga/core";
import { catLabel, studentsOf, useStore } from "../store";
import { demoInfo, endDemo, simulateRecord, type DemoInfo } from "../lib/demo";
import { Icon } from "./ui";

/**
 * 기록 시뮬레이터 (데모 모드, v3 13.4): 폰 위젯과 같은 UI로 1차 기록을 만들어
 * "1차 기록 → 도착 → 2차 보완 팝업(스크립트 후보 포함)" 흐름을 폰 없이 보여 준다.
 * 시간 막대는 합성 모의 수업의 진행 시각이다.
 */
export function DemoSimulator({ onEnd }: { onEnd: () => void }) {
  const [info, setInfo] = useState<DemoInfo | null>(demoInfo());
  const doc = useStore((s) => s.doc);
  const toast = useStore((s) => s.toast);
  const openSupplement = useStore((s) => s.openSupplement);
  const [t, setT] = useState(300);
  const [cat, setCat] = useState<Category | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => { setInfo(demoInfo()); }, []);
  const marks = useMemo(() => DEMO_LESSON.segments.map((s) => ({ t: parseClock(s.start) || 0, speaker: s.speaker, text: s.text })), []);
  if (!info) return null;
  const students = studentsOf(doc, info.class);
  const near = marks.filter((m) => m.t <= t + 15 && m.t >= t - 60 && m.speaker !== "화자1").slice(-2);
  const pick = (no: number) => {
    if (!cat) return;
    const rec = simulateRecord(info, no, cat, t);
    setCat(null);
    toast({ text: `1건 도착 — ${info.class} · ${no}번 (${catLabel(doc, cat)})`, kind: "notice", ttl: 8000, action: { label: "보완하기", onClick: () => openSupplement([rec.id]) } });
    openSupplement([rec.id]);
  };
  return (
    <div className={`demo-sim ${open ? "" : "folded"}`}>
      <div className="flex between ds-head">
        <b>기록 시뮬레이터</b>
        <span className="flex" style={{ gap: 4 }}>
          <button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? "접기" : "펼치기"}</button>
          <button className="btn ghost sm" onClick={async () => { await endDemo(); onEnd(); }} title="데모 스크립트를 지우고 시뮬레이터를 닫습니다">데모 끝내기</button>
        </span>
      </div>
      {open && <>
        <div className="muted small">폰 위젯과 같은 화면입니다. 합성 모의 수업의 시각을 고르고 카테고리 → 번호를 누르세요.</div>
        <div className="ds-widget">
          <div className="flex between"><b>{info.class} · {info.period}교시</b><span className="small muted">수업 {formatClock(t)}</span></div>
          <input type="range" min={0} max={info.durationSec} step={1} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="모의 수업 시각" />
          <div className="ds-marks">{marks.map((m, i) => <i key={i} className={m.speaker === "화자1" ? "t" : ""} style={{ left: `${(m.t / info.durationSec) * 100}%` }} title={`${formatClock(m.t)} ${m.speaker}`} onClick={() => setT(Math.min(info.durationSec, Math.round(m.t) + 5))} />)}</div>
          {near.length > 0 && <div className="ds-near">{near.map((m, i) => <div key={i}><span className="muted">{formatClock(m.t)} {m.speaker}</span> {m.text}</div>)}</div>}
          <div className="ds-cats">{doc.settings.categories.map((c) => <button key={c.key} className={`chip c${c.key} clickable ${cat === c.key ? "selected" : ""}`} onClick={() => setCat(c.key)}>{c.label}</button>)}</div>
          {cat && (
            <div className="ds-nums">
              {students.map((s) => <button key={s.no} onClick={() => pick(s.no)}>{s.no}</button>)}
            </div>
          )}
        </div>
        <div className="muted small"><Icon name="info" size={12} /> 모든 데이터는 합성입니다. 실제 학생 정보·실제 수업 음성이 없습니다.</div>
      </>}
    </div>
  );
}
