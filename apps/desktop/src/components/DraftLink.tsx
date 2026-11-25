// 초안 문장 ↔ 근거 기록 연결 (생기부 생성 · 개별의 2분할 화면)
// 왼쪽 초안의 문장을 누르면 그 문장을 쓴 기록이 오른쪽에서 칠해지고 선으로 이어진다. 기록을 누르면 그 기록이 쓰인 문장이 이어진다.
// 아무것도 고르지 않았을 때는 문장 두세 개만 골라 이어 보인다('한눈에'). 방금 남긴 기록은 빨강, 그 밖은 노랑.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SPAN_LABEL, draftSpans, type DraftSentence } from "@nuga/core";
import "./draft-link.css";

type View = ReturnType<typeof draftSpans>[number];
export type LinkSel = { kind: "all" } | { kind: "s"; i: number } | { kind: "r"; id: string } | null;
interface Path { d: string; mine: boolean; len: number }

interface Ctx {
  views: View[];
  sel: LinkSel;
  setSel(s: LinkSel): void;
  /** 지금 이어 보이는 문장 번호 · 기록 id */
  onS: Set<number>;
  onR: Set<string>;
  /** 방금 남긴 기록 (빨강으로 보인다) */
  freshId?: string;
  /** 기록 id → 그 기록을 쓴 문장 수 */
  usedBy: Map<string, number[]>;
  /** 타자 치듯 드러내는 중이면 지금까지 드러난 글자 수, 아니면 null */
  reveal: number | null;
  /** 초안의 줄바꿈이 달라졌을 때(한 문장씩 · 형광펜) 선을 다시 맞춘다 */
  redraw(): void;
}
const LinkCtx = createContext<Ctx | null>(null);
export function useLink(): Ctx {
  const c = useContext(LinkCtx);
  if (!c) throw new Error("LinkScope 밖에서 useLink 를 썼습니다");
  return c;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 아무것도 고르지 않았을 때 함께 보여 줄 연결: 방금 기록의 문장 + 서로 떨어진 문장 한두 개 (기록은 모두 4건까지) */
export function overviewLinks(views: View[], ids: string[], freshId?: string): [number, string][] {
  const has = new Set(ids);
  const ev = (k: number) => views[k].evidence.filter((e) => has.has(e));
  const ks: number[] = [], rs: string[] = [], pairs: [number, string][] = [];
  if (freshId && has.has(freshId)) {
    const cand = views.map((_, k) => k).filter((k) => views[k].evidence.includes(freshId));
    // 방금 기록만으로 쓴 문장이 먼저 (여러 기록을 묶은 마무리 문장보다)
    const k = cand.sort((a, b) => ev(a).length - ev(b).length)[0];
    if (k !== undefined) { ks.push(k); rs.push(freshId); pairs.push([k, freshId]); }
  }
  for (let k = 0; k < views.length && ks.length < 3 && rs.length < 4; k++) {
    const e = ev(k);
    // 긴 초안에서는 붙어 있는 문장을 피해 드문드문, 짧은 초안에서는 붙어 있어도 고른다
    if (ks.includes(k) || e.length < 1 || e.length > 2 || (views.length >= 7 && ks.some((x) => Math.abs(x - k) < 2))) continue;
    const add = e.filter((x) => !rs.includes(x));
    if (!add.length || rs.length + add.length > 4) continue;
    ks.push(k); rs.push(...add); e.forEach((x) => pairs.push([k, x]));
  }
  if (!pairs.length) {
    const k = views.findIndex((_, i) => ev(i).length > 0);
    if (k >= 0) ev(k).slice(0, 4).forEach((x) => pairs.push([k, x]));
  }
  return pairs;
}

/**
 * 연결 범위: 초안 칸(data-ld-box)과 기록 목록(data-ld-list)을 함께 감싼다. 연결선은 이 칸 위에 겹쳐 그린다.
 * @param ids 화면에 있는 근거(기록 · PDF기록) id
 * @param resetKey 학생이 바뀌면 고른 것을 처음으로
 * @param typeKey 새 초안이 만들어질 때마다 올리면 타자 치듯 드러낸다
 */
export function LinkScope({ text, sentences, ids, freshId, resetKey, typeKey = 0, off, className = "", children }: {
  text: string; sentences?: DraftSentence[] | null; ids: string[]; freshId?: string; resetKey: string; typeKey?: number; off?: boolean; className?: string; children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const views = useMemo(() => draftSpans(text, sentences), [text, sentences]);
  const [sel, setSel] = useState<LinkSel>({ kind: "all" });
  const [reveal, setReveal] = useState<number | null>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const [anim, setAnim] = useState(0);     // 고른 것이 바뀔 때만 선을 다시 그어 보인다 (스크롤 때는 그대로)
  const idKey = ids.join("|");

  useEffect(() => { setSel({ kind: "all" }); setReveal(null); }, [resetKey]);
  // 고친 뒤 문장 수가 줄어 고른 문장이 없어졌으면 처음으로
  useEffect(() => { if (sel?.kind === "s" && sel.i >= views.length) setSel({ kind: "all" }); }, [views.length, sel]);

  // 새 초안: 타자 치듯 채우고, 다 채우면 연결을 보인다
  const total = useMemo(() => views.reduce((n, v) => n + v.text.length + 1, 0), [views]);
  const typed = useRef(typeKey);
  // 그리기 전에 시작한다: 다 쓴 초안이 한 번 번쩍 보였다가 처음부터 다시 써지지 않게
  useLayoutEffect(() => {
    if (typed.current === typeKey) return;
    typed.current = typeKey;
    setSel({ kind: "all" });
    if (reduced() || !total) { setReveal(null); return; }
    const ms = Math.max(900, Math.min(2400, total * 5));
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const n = Math.floor(((t - t0) / ms) * total);
      if (n >= total) { setReveal(null); return; }
      setReveal(n); raf = requestAnimationFrame(step);
    };
    setReveal(0); raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [typeKey, total]);

  const usedBy = useMemo(() => {
    const m = new Map<string, number[]>();
    views.forEach((v, k) => v.evidence.forEach((e) => { const a = m.get(e) || []; a.push(k); m.set(e, a); }));
    return m;
  }, [views]);

  const pairs = useMemo<[number, string][]>(() => {
    if (off || reveal !== null || !sel || !views.length) return [];
    const has = new Set(ids);
    if (sel.kind === "s") return (views[sel.i]?.evidence || []).filter((e) => has.has(e)).map((e) => [sel.i, e]);
    if (sel.kind === "r") return (usedBy.get(sel.id) || []).map((k) => [k, sel.id]);
    return overviewLinks(views, ids, freshId);
  }, [off, reveal, sel, views, idKey, usedBy, freshId]);
  const onS = useMemo(() => new Set(pairs.map((p) => p[0]).concat(sel?.kind === "s" ? [sel.i] : [])), [pairs, sel]);
  const onR = useMemo(() => new Set(pairs.map((p) => p[1]).concat(sel?.kind === "r" ? [sel.id] : [])), [pairs, sel]);

  const draw = useCallback(() => {
    const w = wrap.current;
    if (!w) return;
    const box = w.querySelector<HTMLElement>("[data-ld-box]"), list = w.querySelector<HTMLElement>("[data-ld-list]");
    if (!box || !list || !pairs.length) { setPaths((p) => (p.length ? [] : p)); return; }
    const W = w.getBoundingClientRect(), B = box.getBoundingClientRect(), L = list.getBoundingClientRect();
    // 좁은 화면에서 초안과 기록이 위아래로 쌓이면 선은 긋지 않는다 (칠한 것만으로 짝을 알린다)
    if (L.left < B.right) { setPaths((p) => (p.length ? [] : p)); return; }
    const mid = (r: DOMRect, lo: number, hi: number) => Math.max(lo + 10, Math.min(hi - 10, (r.top + r.bottom) / 2));
    const out: Path[] = [];
    for (const [k, id] of pairs) {
      const s = w.querySelector<HTMLElement>(`[data-ld-s="${k}"]`), r = w.querySelector<HTMLElement>(`[data-ld-r="${CSS.escape(id)}"]`);
      if (!s || !r) continue;
      const R = r.getBoundingClientRect();
      const x1 = B.right - W.left, y1 = mid(s.getBoundingClientRect(), B.top, B.bottom) - W.top;
      const x2 = R.left - W.left, y2 = mid(R, L.top, L.bottom) - W.top;
      const g = Math.max(12, (x2 - x1) * 0.55);
      out.push({ d: `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + g).toFixed(1)} ${y1.toFixed(1)},${(x2 - g).toFixed(1)} ${y2.toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}`, mine: id === freshId, len: Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5) });
    }
    setPaths((p) => (p.length === out.length && p.every((x, i) => x.d === out[i].d && x.mine === out[i].mine) ? p : out));
  }, [pairs, freshId]);

  // 고른 것이 바뀌면: 짝이 보이게 스크롤하고 선을 다시 긋는다
  useLayoutEffect(() => {
    const w = wrap.current;
    if (w && sel && sel.kind !== "all" && pairs.length) {
      const [k, id] = pairs[0];
      const el = sel.kind === "s" ? w.querySelector(`[data-ld-r="${CSS.escape(id)}"]`) : w.querySelector(`[data-ld-s="${k}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
    setAnim((n) => n + 1);
    draw();
  }, [pairs]);
  // 스크롤 · 크기 변화 · 글이 바뀔 때: 선만 다시 맞춘다
  useLayoutEffect(() => { draw(); }, [draw, text]);
  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    let raf = 0;
    const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    w.addEventListener("scroll", again, { capture: true, passive: true });
    window.addEventListener("resize", again);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    ro?.observe(w);
    return () => { cancelAnimationFrame(raf); w.removeEventListener("scroll", again, { capture: true }); window.removeEventListener("resize", again); ro?.disconnect(); };
  }, [draw]);

  // 타자 치는 동안은 쓰는 자리가 보이게 아래로, 끝나면 처음으로
  const wasTyping = useRef(false);
  useLayoutEffect(() => {
    const box = wrap.current?.querySelector<HTMLElement>("[data-ld-box]");
    if (!box) return;
    if (reveal !== null) { box.scrollTop = box.scrollHeight; wasTyping.current = true; }
    else if (wasTyping.current) { box.scrollTop = 0; wasTyping.current = false; }
  }, [reveal]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const redraw = useCallback(() => drawRef.current(), []);
  const ctx = useMemo<Ctx>(() => ({ views, sel, setSel, onS, onR, freshId, usedBy, reveal, redraw }), [views, sel, onS, onR, freshId, usedBy, reveal, redraw]);
  return (
    <LinkCtx.Provider value={ctx}>
      <div ref={wrap} className={`ld-scope ${className}`}>
        {children}
        <svg className="ld-svg" aria-hidden="true">
          {paths.map((p, i) => <path key={`${anim}-${i}`} className={p.mine ? "m" : ""} d={p.d} style={{ "--l": p.len, animationDelay: `${(i * 0.08).toFixed(2)}s` } as React.CSSProperties} />)}
        </svg>
      </div>
    </LinkCtx.Provider>
  );
}

/**
 * 연결되는 초안 읽기 화면. 문장을 누르면 근거 기록과 이어지고, 두 번 누르면(onEdit) 고치기로 바뀐다.
 * split = 한 문장씩, highlight = 학생활동 · 역량 · 교사의 평가 형광펜 (DraftView 와 같은 뜻)
 */
export function LinkedDraft({ split, highlight, className = "", onEdit }: { split: boolean; highlight: boolean; className?: string; onEdit?: () => void }) {
  const { views, sel, setSel, onS, freshId, reveal, redraw } = useLink();
  // 그릴 때마다 선을 맞춘다 (한 문장씩 · 형광펜으로 줄이 바뀌어도 선 끝이 문장에 닿게)
  useLayoutEffect(() => { redraw(); });
  // 드러낼 글자 수를 문장마다 나눈다
  let left = reveal ?? Infinity;
  const cut = views.map((v) => { const n = Math.max(0, Math.min(v.text.length, left)); left -= v.text.length + 1; return n; });
  const body = (v: View, n: number) => {
    if (!highlight) return v.text.slice(0, n);
    let rest = n;
    return v.spans.map((p, i) => {
      const t = p.text.slice(0, Math.max(0, rest)); rest -= p.text.length;
      if (!t) return null;
      return p.kind === "none" ? <React.Fragment key={i}>{t}</React.Fragment> : <span key={i} className={`hl hl-${p.kind}`} title={SPAN_LABEL[p.kind]}>{t}</span>;
    });
  };
  const pick = (k: number) => (e: React.MouseEvent) => { e.stopPropagation(); setSel(sel?.kind === "s" && sel.i === k ? { kind: "all" } : { kind: "s", i: k }); };
  const cls = (v: View, k: number) => `ld-sn${onS.has(k) ? " on" : ""}${onS.has(k) && freshId && v.evidence.includes(freshId) && v.evidence.length <= 3 ? " mine" : ""}${v.evidence.length ? "" : " noev"}`;
  const badge = (v: View, n: number) => n >= v.text.length && reveal === null
    ? <span className={`dv-ev ${v.evidence.length ? "" : "none"}`} title={v.evidence.length ? `근거 기록 ${v.evidence.length}건 · 누르면 이어 보기` : "근거 기록 없음"}>{v.evidence.length || "!"}</span> : null;
  return (
    <div className={`draft-view ld-draft ${className}`} data-ld-box onClick={() => setSel({ kind: "all" })} onDoubleClick={onEdit} title={onEdit ? "문장을 누르면 근거 기록이 이어집니다 · 두 번 누르면 고치기" : undefined}>
      {split
        ? <ul className="dv-list">{views.map((v, k) => cut[k] > 0 && (
            <li key={k}><span className={`dv-text ${cls(v, k)}`} data-ld-s={k} onClick={pick(k)}>{body(v, cut[k])}</span>{badge(v, cut[k])}</li>
          ))}</ul>
        : <p className="dv-para">{views.map((v, k) => cut[k] > 0 && (
            <React.Fragment key={k}><span className={cls(v, k)} data-ld-s={k} onClick={pick(k)}>{body(v, cut[k])}</span>{badge(v, cut[k])}{k < views.length - 1 ? " " : ""}</React.Fragment>
          ))}</p>}
    </div>
  );
}

/** 기록 줄 하나의 연결 상태: 칠할지(on) · 방금 기록인지(fresh) · 쓴 문장 수(used) · 눌렀을 때 */
export function useLinkRow(id: string) {
  const { sel, setSel, onR, freshId, usedBy } = useLink();
  return {
    on: onR.has(id), fresh: id === freshId, used: usedBy.get(id)?.length || 0,
    pick: () => setSel(sel?.kind === "r" && sel.id === id ? { kind: "all" } : { kind: "r", id }),
  };
}
