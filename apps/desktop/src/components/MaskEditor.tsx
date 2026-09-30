import React, { useEffect, useRef, useState } from "react";
import type { DocPage, Rect } from "../lib/docOcr";
import { hasTextLayer } from "../lib/docOcr";
import { Icon } from "./ui";

/**
 * 전산화 전 가리기 화면. 쪽 이미지 위를 끌어서 검은 상자를 만든다.
 * 확인을 누르기 전에는 어떤 글자도 뽑지 않는다.
 */
export function MaskEditor({ title, pages, initial, autoCount, onCancel, onConfirm }: {
  title: string; pages: DocPage[]; initial: Rect[][]; autoCount: number;
  onCancel: () => void; onConfirm: (masks: Rect[][]) => void;
}) {
  const [masks, setMasks] = useState<Rect[][]>(() => pages.map((_, i) => initial[i] ? initial[i].map((r) => ({ ...r })) : []));
  const [pi, setPi] = useState(0);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [hideAuto, setHideAuto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const page = pages[pi];
  const total = masks.reduce((n, m) => n + m.length, 0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "ArrowRight" || e.key === "PageDown") setPi((i) => Math.min(pages.length - 1, i + 1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPi((i) => Math.max(0, i - 1));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); setMasks((m) => m.map((x, i) => (i === pi ? x.slice(0, -1) : x))); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [pi, pages.length, onCancel]);

  const toPage = (e: React.MouseEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.width, y: ((e.clientY - r.top) / r.height) * page.height };
  };
  const onDown = (e: React.MouseEvent) => { if (e.button !== 0) return; e.preventDefault(); start.current = toPage(e); setDraft({ ...start.current, w: 0, h: 0 }); };
  const onMove = (e: React.MouseEvent) => {
    if (!start.current) return;
    const p = toPage(e); const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => {
    if (draft && draft.w > 6 && draft.h > 6) setMasks((m) => m.map((x, i) => (i === pi ? [...x, draft] : x)));
    start.current = null; setDraft(null);
  };
  const remove = (k: number) => setMasks((m) => m.map((x, i) => (i === pi ? x.filter((_, j) => j !== k) : x)));
  const pct = (r: Rect) => ({ left: `${(r.x / page.width) * 100}%`, top: `${(r.y / page.height) * 100}%`, width: `${(r.w / page.width) * 100}%`, height: `${(r.h / page.height) * 100}%` });

  return (
    <div className="overlay mask-overlay" onMouseUp={onUp}>
      <div className="mask-modal" role="dialog" aria-modal aria-label="개인정보 가리기">
        <div className="mask-head">
          <div>
            <h2 style={{ margin: 0 }}>전산화 전 가리기 · {title}</h2>
            <div className="muted small">이름·학번·사진·서명 등 글자로 남기면 안 되는 곳을 끌어서 가리세요. 가린 부분은 검게 칠해진 뒤 글자를 뽑고, 원본 파일은 저장하지 않습니다.</div>
          </div>
          <button className="x" onClick={onCancel} aria-label="닫기">×</button>
        </div>
        <div className="mask-body">
          <div className="mask-thumbs">
            {pages.map((p, i) => (
              <button key={i} className={`mask-thumb ${i === pi ? "on" : ""}`} onClick={() => setPi(i)}>
                <img src={p.dataUrl} alt="" />
                <span>{i + 1}쪽 · 가림 {masks[i].length}</span>
              </button>
            ))}
          </div>
          <div className="mask-stage">
            <div className="mask-page" ref={boxRef} onMouseDown={onDown} onMouseMove={onMove} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              <img src={page.dataUrl} alt={`${pi + 1}쪽`} draggable={false} />
              {!hideAuto && masks[pi].map((r, k) => (
                <div key={k} className="mask-rect" style={pct(r)} onMouseDown={(e) => e.stopPropagation()}>
                  <button onClick={() => remove(k)} title="이 가리기 지우기" aria-label="가리기 지우기">×</button>
                </div>
              ))}
              {draft && <div className="mask-rect drawing" style={pct(draft)} />}
            </div>
          </div>
        </div>
        <div className="mask-foot">
          <span className="flex small muted">
            <span className="chip outline">{hasTextLayer(page) ? "글자층 있는 PDF · 가린 글자는 제외" : "이미지 · 검게 칠한 뒤 OCR"}</span>
            {autoCount > 0 && <span>이름·학번 자동 찾기 {autoCount}곳</span>}
            <span><span className="kbd">Ctrl</span>+<span className="kbd">Z</span> 되돌리기 · <span className="kbd">←</span><span className="kbd">→</span> 쪽 이동</span>
          </span>
          <span className="grow" />
          <label className="flex small muted" style={{ gap: 4 }}><input type="checkbox" className="checkbox" checked={hideAuto} onChange={(e) => setHideAuto(e.target.checked)} />가린 모습 숨기기</label>
          <button className="btn sm" onClick={() => setMasks((m) => m.map((x, i) => (i === pi ? [] : x)))} disabled={!masks[pi].length}>이 쪽 가리기 지우기</button>
          <button className="btn" onClick={onCancel}>취소</button>
          <button className="btn primary" onClick={() => onConfirm(masks)}><Icon name="check" size={14} />가리기 완료 · 글자 뽑기 ({total}곳)</button>
        </div>
      </div>
    </div>
  );
}
