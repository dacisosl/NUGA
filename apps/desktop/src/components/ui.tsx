import React, { useEffect, useRef } from "react";
import type { Category, Level, ReviewResult } from "@nuga/core";
import { RESULT_LABEL } from "@nuga/core";
import { useStore } from "../store";

export function Chip({ cat, label, className = "", onClick, selected }: { cat?: Category | "perf"; label: React.ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  const c = cat === "perf" ? "perf" : cat ? `c${cat}` : "";
  return <span className={`chip ${c} ${className} ${onClick ? "clickable" : ""} ${selected ? "selected" : ""}`} onClick={onClick}>{label}</span>;
}

export function CatChip({ cat }: { cat: Category }) {
  const doc = useStore((s) => s.doc);
  const label = doc.settings.categories.find((c) => c.key === cat)?.label || cat;
  return <Chip cat={cat} label={label} />;
}

const NEXT_LEVEL: Record<Level, Level> = { B: "C", C: "A", A: "B" };
/** 수준 배지. student 를 주면 클릭할 때마다 B → C → A 순으로 바뀐다. */
export function LevelBadge({ level, student }: { level: Level; student?: { class: string; no: number } }) {
  const upsert = useStore((s) => s.upsertStudent);
  const doc = useStore((s) => s.doc);
  if (!student) return <span className={`lvl ${level}`}>{level}</span>;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const cur = doc.students.find((x) => x.class === student.class && x.no === student.no);
    if (cur) upsert({ ...cur, level: NEXT_LEVEL[cur.level] });
  };
  return <span role="button" tabIndex={0} className={`lvl ${level} clickable`} onClick={onClick} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(e as unknown as React.MouseEvent); }} title="클릭: 수준 변경 (B → C → A)">{level}</span>;
}

/**
 * 학생 이름표: 바탕색이 수준을 나타낸다 (A 검정 · B 흰색 · C 회색).
 * 오른쪽 위 작은 배지에 A·B·C 를 표시하고, 배지를 누르면 B → C → A 순으로 바뀐다.
 */
export function StudentTag({ student, size = "md", onNameClick, title }: {
  student: { class: string; no: number; name: string; level: Level };
  size?: "sm" | "md" | "lg"; onNameClick?: () => void; title?: string;
}) {
  const upsert = useStore((s) => s.upsertStudent);
  const doc = useStore((s) => s.doc);
  const cycle = (e: React.SyntheticEvent) => {
    e.stopPropagation(); e.preventDefault();
    const cur = doc.students.find((x) => x.class === student.class && x.no === student.no);
    if (cur) upsert({ ...cur, level: NEXT_LEVEL[cur.level] });
  };
  const name = student.name || `${student.no}번`;
  return (
    <span className={`stag ${student.level} ${size}`} title={title}>
      {onNameClick
        ? <button type="button" className="stag-name" onClick={(e) => { e.stopPropagation(); onNameClick(); }}>{name}</button>
        : <span className="stag-name">{name}</span>}
      <span role="button" tabIndex={0} className="stag-lv" aria-label={`수준 ${student.level}, 눌러서 변경`} title="수준 변경 (B → C → A)"
        onClick={cycle} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") cycle(e); }}>{student.level}</span>
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

export function Modal({ title, children, footer, onClose, width, header }: { title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; width?: "wide" | "narrow" | "xl"; header?: React.ReactNode }) {
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

export function LenBar({ len, target, mode }: { len: number; target: number; mode?: "withSpaces" | "withoutSpaces" }) {
  const min = target - 20; const max = target - 1;
  const pct = Math.min(100, (len / target) * 100);
  const cls = len > max ? "over" : len < min ? "low" : "";
  return (
    <span className="flex" title={`허용 ${min}~${max}자 (${mode === "withoutSpaces" ? "공백 제외" : "공백 포함"})`}>
      <span className="lenbar"><i className={cls} style={{ width: pct + "%" }} /></span>
      <span className={`num small ${len > max ? "" : "muted"}`} style={{ color: len > max ? "var(--warn)" : undefined }}>{len}/{target}</span>
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

export function Icon({ name, size = 16 }: { name: "list" | "pen" | "check" | "gear" | "sync" | "excel" | "json" | "plus" | "left" | "right" | "trash" | "mic" | "qr" | "watch" | "phone" | "warn" | "info"; size?: number }) {
  const p: Record<string, React.ReactNode> = {
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
