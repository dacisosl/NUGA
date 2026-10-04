import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import type { Category, LengthMode, ReviewResult, Student } from "@nuga/core";
import { RESULT_LABEL, gradeStep, lengthWindow } from "@nuga/core";
import { achievementOf, useStore } from "../store";

export function Chip({ cat, label, className = "", onClick, selected }: { cat?: Category | "perf"; label: React.ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  const c = cat === "perf" ? "perf" : cat ? `c${cat}` : "";
  return <span className={`chip ${c} ${className} ${onClick ? "clickable" : ""} ${selected ? "selected" : ""}`} onClick={onClick}>{label}</span>;
}

export function CatChip({ cat }: { cat: Category }) {
  const doc = useStore((s) => s.doc);
  const label = doc.settings.categories.find((c) => c.key === cat)?.label || cat;
  return <Chip cat={cat} label={label} />;
}

/** 도달 정도 5단계 바탕색 (낮음 → 높음). 파란 버튼과 겹치지 않게 연한 회청 → 남색 검정(랜딩 페이지 색). 글씨는 앞 3단계 검정, 뒤 2단계 흰색 */
export const ACH_COLORS = ["#EEF3FA", "#D3DEEC", "#A5B6CC", "#4A6385", "#0D1C2E"];
const CONF_LABEL: Record<string, string> = { ok: "근거 충분", low: "근거 부족 · 참고용", none: "추정 불가" };

type TagStudent = Pick<Student, "class" | "no" | "name" | "achievement" | "level">;

/**
 * 도달 정도 조정: 0~100 슬라이더, 자동값 눈금, [자동값으로 되돌리기].
 * 생기부·내보내기에는 나오지 않는 내부 값이며 초안의 표현 방향만 바꾼다.
 */
/**
 * 슬라이더를 끄는 동안의 미리보기 값. 같은 학생의 이름표가 저장 전에도 바로 색·숫자를 바꾼다.
 * 저장(손을 뗄 때)은 한 번만 한다.
 */
const useAchPreview = create<{ key: string | null; value: number | null }>(() => ({ key: null, value: null }));
const achKey = (s: Pick<TagStudent, "class" | "no">) => `${s.class}|${s.no}`;

export function AchievementControl({ student, compact }: { student: TagStudent; compact?: boolean }) {
  const doc = useStore((s) => s.doc);
  const setAchievement = useStore((s) => s.setAchievement);
  const ach = achievementOf(doc, student);
  const [v, setV] = useState<number | null>(ach.value);
  useEffect(() => { setV(ach.value); }, [ach.value]);
  const key = achKey(student);
  const clearPreview = () => { if (useAchPreview.getState().key === key) useAchPreview.setState({ key: null, value: null }); };
  useEffect(() => clearPreview, [key]);
  const commit = () => { if (v !== null && v !== ach.value) setAchievement(student.class, student.no, v); clearPreview(); };
  const step = gradeStep(v);
  const n = doc.records.filter((r) => r.class === student.class && r.no === student.no && r.status !== "skipped").length;
  return (
    <div className={`ach-ctl ${compact ? "compact" : ""}`}>
      <div className="flex" style={{ gap: 8, alignItems: "baseline" }}>
        <b className="ach-num" style={{ color: step >= 0 ? ACH_COLORS[Math.max(3, step)] : "var(--muted)" }}>{v ?? "—"}</b>
        <span className="muted small">{ach.edited ? "교사 조정값" : "자동값"} · {ach.edited ? `자동 ${ach.auto ?? "—"}` : CONF_LABEL[ach.confidence]} · 기록 {n}건</span>
      </div>
      <div className="ach-track">
        <input type="range" min={0} max={100} step={1} value={v ?? 50} aria-label="도달 정도"
          className={v === null ? "unset" : ""}
          onChange={(e) => { const n = Number(e.target.value); setV(n); useAchPreview.setState({ key, value: n }); }}
          onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
        {ach.auto !== null && <i className="ach-auto" style={{ left: `${ach.auto}%` }} title={`자동값 ${ach.auto}`} />}
        <div className="ach-scale">{ACH_COLORS.map((c) => <span key={c} style={{ background: c }} />)}</div>
      </div>
      {student.achievement?.byStandard && Object.keys(student.achievement.byStandard).length > 0 && (
        <div className="small muted" style={{ marginTop: 6 }}>성취기준별(AI 추정): {Object.entries(student.achievement.byStandard).map(([k, v]) => `${k} ${v}`).join(" · ")}</div>
      )}
      <div className="flex" style={{ gap: 6, marginTop: 6 }}>
        {ach.edited && <button className="btn sm" onClick={() => setAchievement(student.class, student.no, null)}>자동값으로 되돌리기</button>}
        {!compact && <span className="muted small">생기부·내보내기에는 나오지 않는 내부 값입니다. 초안의 표현 방향(서술어 강도)만 바꿉니다.</span>}
      </div>
    </div>
  );
}

function AchievementPopover({ student, anchor, onClose }: { student: TagStudent; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("mousedown", down, true); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", down, true); window.removeEventListener("keydown", key, true); };
  }, [onClose]);
  const w = 300;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, anchor.right - w / 2));
  const below = anchor.bottom + 8 + 170 < window.innerHeight;
  const style: React.CSSProperties = { left, width: w, ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }) };
  return createPortal(
    <div ref={ref} className="ach-pop" style={style} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} role="dialog" aria-label="도달 정도 조정">
      <div className="flex" style={{ marginBottom: 4 }}><b>{student.name || `${student.no}번`}</b><span className="muted small">도달 정도</span><span className="grow" /><button className="x" onClick={onClose} aria-label="닫기">×</button></div>
      <AchievementControl student={student} compact />
    </div>,
    document.body,
  );
}

/**
 * 오른쪽 클릭(마우스)으로 여는 메뉴. 터치 기기에서는 길게 누르면 브라우저가 같은 contextmenu 를 보낸다.
 */
export function useRightClick(onOpen: (el: HTMLElement) => void) {
  return {
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); onOpen(e.currentTarget); },
  };
}

/** 학생을 오른쪽 클릭하면 도달 정도 슬라이더가 뜬다. bind 를 대상 요소에 펼치고 popover 를 함께 그린다. */
export function useAchievementPress(student: TagStudent | undefined) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const bind = useRightClick((el) => { if (student) setAnchor(el.getBoundingClientRect()); });
  const popover = anchor && student ? <AchievementPopover student={student} anchor={anchor} onClose={() => setAnchor(null)} /> : null;
  return { bind, popover };
}

/** 오른쪽 클릭으로 성취도 조절이 되는 학생 영역 (오늘 기록·알림 모달의 번호·이름) */
export function AchPress({ student, className, children, ...rest }: { student: TagStudent | undefined; className?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const { bind, popover } = useAchievementPress(student);
  const tip = student ? "오른쪽 클릭: 성취도 조절" : undefined;
  if (rest.onClick) return <><button type="button" className={`lp ${className || ""}`} title={tip} {...rest} {...bind}>{children}</button>{popover}</>;
  return <><span className={`lp ${className || ""}`} title={tip} {...bind}>{children}</span>{popover}</>;
}

/**
 * 학생 이름표: 바탕색이 도달 정도(파랑 5단계)를 나타낸다. 값이 없으면 흰 바탕에 회색 빗금.
 * 오른쪽 위 배지에 숫자를 표시하고, 누르면 조정 창이 열린다. 교사가 조정한 값에는 연필, 근거가 부족한 자동값은 점선 테두리.
 */
export function StudentTag({ student, size = "md", onNameClick, title }: {
  student: TagStudent;
  size?: "sm" | "md" | "lg"; onNameClick?: () => void; title?: string;
}) {
  const doc = useStore((s) => s.doc);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closedAt = useRef(0);
  const showBadge = doc.settings.options.showLevelBadge !== false;
  const ach = achievementOf(doc, student);
  const preview = useAchPreview((s) => (s.key === achKey(student) ? s.value : null));
  const shown = preview ?? ach.value;
  const step = gradeStep(shown);
  const open = (e: React.SyntheticEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (Date.now() - closedAt.current < 300) return; // 바깥 클릭으로 막 닫힌 경우 다시 열지 않음
    setAnchor(anchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect());
  };
  const name = student.name || `${student.no}번`;
  const lowConf = !ach.edited && ach.confidence === "low";
  const press = useRightClick((el) => setAnchor(el.getBoundingClientRect()));
  return (
    <span className={`stag lp g${step < 0 ? "x" : step} ${size} ${showBadge ? "" : "nob"} ${lowConf ? "lowconf" : ""}`} title={title ?? "오른쪽 클릭: 성취도 조절"} {...press}>
      {onNameClick
        ? <button type="button" className="stag-name" onClick={(e) => { e.stopPropagation(); onNameClick(); }}>{name}</button>
        : <span className="stag-name">{name}</span>}
      {showBadge && <span role="button" tabIndex={0} className="stag-lv" aria-label={`도달 정도 ${shown ?? "없음"}, 눌러서 조정`} title={`도달 정도 ${shown ?? "—"}${ach.edited ? " (교사 조정)" : lowConf ? " (근거 부족)" : ""} · 눌러서 조정`}
        onClick={open} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e); }}>{shown ?? "—"}{ach.edited && <svg className="pen" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>}</span>}
      {anchor && <AchievementPopover student={student} anchor={anchor} onClose={() => { closedAt.current = Date.now(); setAnchor(null); }} />}
    </span>
  );
}

export function StatusChip({ result }: { result: ReviewResult }) {
  const icon = result === "pass" ? "✓" : result === "check" ? "!" : result === "fix" ? "✕" : "–";
  return <span className={`chip ${result}`}><span aria-hidden>{icon}</span>{RESULT_LABEL[result]}</span>;
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex" style={{ cursor: "pointer" }}>
      <button type="button" className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Modal({ title, children, footer, onClose, width, header }: { title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; width?: "wide" | "narrow" | "xl" | "inbox"; header?: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${width || ""}`} role="dialog" aria-modal>
        <div className="modal-h">{header || <h2>{title}</h2>}<button className="x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, body, okLabel = "확인", danger, onOk, onClose }: { title: string; body?: React.ReactNode; okLabel?: string; danger?: boolean; onOk: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className={`btn ${danger ? "warn" : "primary"}`} onClick={() => { onOk(); onClose(); }}>{okLabel}</button></>}>
      {body && <div className="muted">{body}</div>}
    </Modal>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ""}`} onClick={() => { t.onClick?.(); if (t.onClick) dismiss(t.id); }}>
          <span className="grow">{t.text}</span>
          {t.action && <button className="act" onClick={(e) => { e.stopPropagation(); t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="act" style={{ opacity: .6 }} onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}>×</button>
        </div>
      ))}
    </div>
  );
}

/** 분량 막대. 바이트 단위면 "1,452 / 1,500 B · 약 484자" 로 표시한다. 목표 구간은 한도의 96~100%. */
export function LenBar({ len, target, mode, chars, band }: { len: number; target: number; mode?: LengthMode; chars?: number; band?: [number, number] }) {
  const { min, max } = lengthWindow(target, band);
  const pct = Math.min(100, (len / Math.max(1, target)) * 100);
  const cls = len > max ? "over" : len < min ? "low" : "";
  const bytes = mode === "bytes";
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const unit = bytes ? "B" : "자";
  const modeText = bytes ? "NEIS 바이트" : mode === "withoutSpaces" ? "공백 제외" : "공백 포함";
  return (
    <span className="flex" title={`목표 ${fmt(min)}~${fmt(max)}${unit} (${modeText}) · 한도 초과 금지`}>
      <span className="lenbar"><i className={cls} style={{ width: pct + "%" }} /><b style={{ left: `${(min / Math.max(1, target)) * 100}%` }} /></span>
      <span className={`num small ${len > max ? "" : "muted"}`} style={{ color: len > max ? "var(--warn)" : undefined }}>{fmt(len)}/{fmt(target)}{bytes ? " B" : ""}{bytes && chars !== undefined ? ` · 약 ${fmt(chars)}자` : ""}</span>
    </span>
  );
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return <div className="empty"><b>{title}</b>{desc && <div>{desc}</div>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <span className="search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "이름·번호"} />
    </span>
  );
}

/** 클릭하면 입력으로 바뀌는 셀 */
export function EditableCell({ value, onSave, type = "text", options, placeholder }: { value: string; onSave: (v: string) => void; type?: "text" | "select"; options?: string[]; placeholder?: string }) {
  const [editing, setEditing] = React.useState(false);
  const [v, setV] = React.useState(value);
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);
  useEffect(() => { setV(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (!editing) return <span className="ellipsis" style={{ display: "block", cursor: "text", minHeight: 20 }} onClick={() => setEditing(true)}>{value || <span className="muted">{placeholder || "—"}</span>}</span>;
  const commit = () => { setEditing(false); if (v !== value) onSave(v); };
  if (type === "select") return <select ref={ref as React.RefObject<HTMLSelectElement>} className="cell-edit" value={v} onChange={(e) => { setV(e.target.value); onSave(e.target.value); setEditing(false); }} onBlur={() => setEditing(false)}>{options?.map((o) => <option key={o}>{o}</option>)}</select>;
  return <input ref={ref as React.RefObject<HTMLInputElement>} className="cell-edit" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setV(value); setEditing(false); } }} />;
}

export function Icon({ name, size = 16 }: { name: "list" | "pen" | "check" | "gear" | "sync" | "excel" | "json" | "plus" | "left" | "right" | "trash" | "mic" | "qr" | "watch" | "phone" | "warn" | "info" | "sun" | "spark"; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
    pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    sync: <><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M3 21v-5h5M21 3v5h-5" /></>,
    excel: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
    json: <><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    left: <><path d="m15 18-6-6 6-6" /></>,
    right: <><path d="m9 18 6-6-6-6" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v3M17 20h3M14 20h1" /></>,
    watch: <><rect x="6" y="7" width="12" height="10" rx="3" /><path d="M9 7V3h6v4M9 17v4h6v-4" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
    warn: <><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[name]}</svg>;
}
