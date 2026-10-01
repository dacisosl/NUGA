import React, { useMemo } from "react";
import { draftSpans, spanRatio, SPAN_LABEL, type DraftSentence, type SpanKind } from "@nuga/core";
import { useStore } from "../store";
import { Switch } from "./ui";

/** 상단 스위치: 한 문장씩 보기 · 구별하기 (모든 초안 화면이 함께 따른다) */
export function ViewToggles() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <span className="view-toggles">
      <Switch on={view.split} onChange={(v) => setView({ split: v })} label="한 문장씩" />
      <Switch on={view.highlight} onChange={(v) => setView({ highlight: v })} label="구별하기" />
    </span>
  );
}

export function SpanLegend() {
  return (
    <span className="span-legend">
      {(["activity", "competency", "evaluation"] as SpanKind[]).map((k) => <span key={k} className={`hl hl-${k}`}>{SPAN_LABEL[k]}</span>)}
    </span>
  );
}

/**
 * 초안 읽기 화면. split = 한 문장씩, highlight = 학생활동·역량·교사의 평가 형광펜.
 * 둘 다 꺼져 있으면 그냥 문단을 보여 준다. 누르면(onClick) 편집으로 바뀌게 쓰는 쪽에서 처리한다.
 */
export function DraftView({ text, sentences, split, highlight, className = "", style, onClick, showEvidence }: {
  text: string; sentences?: DraftSentence[] | null; split: boolean; highlight: boolean;
  className?: string; style?: React.CSSProperties; onClick?: () => void; showEvidence?: boolean;
}) {
  const views = useMemo(() => draftSpans(text, sentences), [text, sentences]);
  const render = (v: (typeof views)[number]) => highlight
    ? v.spans.map((p, i) => p.kind === "none" ? <React.Fragment key={i}>{p.text}</React.Fragment> : <span key={i} className={`hl hl-${p.kind}`} title={SPAN_LABEL[p.kind]}>{p.text}</span>)
    : v.text;
  return (
    <div className={`draft-view ${className}`} style={style} onClick={onClick} title={onClick ? "눌러서 고치기" : undefined}>
      {split
        ? <ul className="dv-list">{views.map((v, i) => (
            <li key={i}>
              <span className="dv-text">{render(v)}</span>
              {showEvidence && <span className={`dv-ev ${v.evidence.length ? "" : "none"}`} title={v.evidence.length ? `근거 기록 ${v.evidence.length}건` : "근거 기록 없음"}>{v.evidence.length || "!"}</span>}
              {highlight && v.source === "ai" && <span className="dv-ai" title="AI가 구별한 문장">AI</span>}
            </li>
          ))}</ul>
        : <p className="dv-para">{views.map((v, i) => <React.Fragment key={i}>{render(v)}{i < views.length - 1 ? " " : ""}</React.Fragment>)}</p>}
    </div>
  );
}

/** 학생활동·역량·평가 비율 막대 (공백 제외 글자 기준) */
export function SpanRatioBar({ text, sentences, compact }: { text: string; sentences?: DraftSentence[] | null; compact?: boolean }) {
  const r = useMemo(() => spanRatio(draftSpans(text, sentences)), [text, sentences]);
  if (!r.total) return null;
  const pct = (n: number) => Math.round((n / r.total) * 100);
  const evHeavy = r.evaluation / r.total >= 0.3 && r.activity / r.total < 0.4;
  return (
    <span className={`ratio ${compact ? "compact" : ""}`} title={`학생활동 ${pct(r.activity)}% · 역량 ${pct(r.competency)}% · 교사의 평가 ${pct(r.evaluation)}% · 기타 ${pct(r.none)}%`}>
      <span className="ratio-bar">
        <i className="hl-activity" style={{ width: `${pct(r.activity)}%` }} />
        <i className="hl-competency" style={{ width: `${pct(r.competency)}%` }} />
        <i className="hl-evaluation" style={{ width: `${pct(r.evaluation)}%` }} />
      </span>
      {!compact && <span className="ratio-txt num">활동 {pct(r.activity)} · 역량 {pct(r.competency)} · 평가 {pct(r.evaluation)}</span>}
      {evHeavy && <span className="chip check" title="교사의 평가 표현이 많고 학생활동이 적음">평가 많음</span>}
    </span>
  );
}
