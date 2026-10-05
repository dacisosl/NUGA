import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NugaDoc, Student } from "@nuga/core";
import { useStore } from "../store";
import { StairsView, sliverRuns, stairModel, textW, useFontTick, type StairBuckets, type StairModel } from "./StairsView";
import { Icon } from "./ui";
import "./stairs-brief.css";

/**
 * 현황판 맨 위 '기록 계단' 자리: 종이 위 머리 줄(기록 계단 · 반 · 인원 · [접기 | 간략히 | 자세히]) + 고른 보기.
 *  · 접기   — 머리 줄에 숫자만 한 줄 (평균 · 출발선 · 이번 주 · 기록 부족). 학생 카드가 바로 올라온다
 *  · 간략히 — 기본. 낮은 밤의 무대: 왼쪽 숫자 다섯, 오른쪽 이름 없는 작은 계단(칸마다 유리 디딤판 + 학생 수만큼 점).
 *             반이 어디에 모였는지·누가 아직 출발선에 있는지를 1초 안에 읽게 한다. 칸이나 [자세히 보기]를 누르면 자세히
 *  · 자세히 — 기존 기록 계단(StairsView) 그대로
 * 고른 보기는 localStorage 'nuga.board.stairs' 에 기억한다.
 * 숫자·칸은 기록 계단과 같은 셈 하나(StairsView 의 stairModel: 칸 · 기록 부족 · 정상 · KPI)에 월요일 0시(이번 주) · 건너뜀 제외.
 */

export type StairsMode = "none" | "brief" | "full";
const MODE_KEY = "nuga.board.stairs";
const VIEWS: { v: StairsMode; label: string; tip: string }[] = [
  { v: "none", label: "접기", tip: "계단을 접고 숫자만 한 줄로" },
  { v: "brief", label: "간략히", tip: "숫자와 이름 없는 작은 계단" },
  { v: "full", label: "자세히", tip: "이름표까지 모두 세운 기록 계단" },
];
/**
 * 높이 옮김이 끝나면(몸의 height transitionend) 접힌 무대를 내리고 넘침 자르기를 푼다.
 * transitionend 가 오지 않을 때(그림이 늦게 그려지는 창 등)를 위한 대비 시간 — stairs-brief.css 의 --sp-dur(.26s)보다 넉넉히.
 * 움직임 줄이기면 높이가 바로 바뀌므로 옮김 단계를 아예 거치지 않는다 (choose)
 */
const MOVE_FALLBACK_MS = 700;
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

function loadMode(): StairsMode {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    if (v === "none" || v === "brief" || v === "full") return v;
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return "brief";
}
function saveMode(v: StairsMode) {
  try { window.localStorage.setItem(MODE_KEY, v); } catch { /* 기억은 못 해도 이번 화면에서는 바뀐다 */ }
}

/* ---------- 숫자: 기록 계단(StairsView)과 같은 셈 (stairModel) ---------- */

interface Kid { no: number; name: string; n: number; week: number }
type StairStats = StairModel<Kid>;

/** 이번 주 시작(월요일 0시) — 기록 계단·학생 카드와 같은 기준 */
function mondayMs(): number { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }
const keyOf = (cls: string, no: number) => `${cls}|${no}`;
const pad2 = (n: number) => String(n).padStart(2, "0");

function stairStats(doc: NugaDoc, students: Student[]): StairStats {
  const weekStart = mondayMs();
  // 기록을 한 번만 훑는다 (건너뜀 제외)
  const acc = new Map<string, { n: number; week: number }>();
  for (const s of students) acc.set(keyOf(s.class, s.no), { n: 0, week: 0 });
  for (const r of doc.records) {
    if (r.status === "skipped") continue;
    const a = acc.get(keyOf(r.class, r.no));
    if (!a) continue;
    a.n++;
    if (new Date(r.time).getTime() >= weekStart) a.week++;
  }
  const kids: Kid[] = students.map((s) => {
    const a = acc.get(keyOf(s.class, s.no)) || { n: 0, week: 0 };
    return { no: s.no, name: s.name || `${s.no}번`, n: a.n, week: a.week };
  });
  return stairModel(kids, doc.settings, (k) => k.no);
}

/* ---------- 자리: 머리 줄 + 고른 보기 ---------- */

export function StairsPanel({ doc, students, cls, onOpen }: { doc: NugaDoc; students: Student[]; cls: string; onOpen: (s: Student) => void }) {
  const [mode, setMode] = useState<StairsMode>(loadMode);
  // 높이를 옮기는 동안만 몸을 잘라(넘침 숨김) 무대가 아래 카드 위로 비치지 않게. 쉬는 동안은 무대 그림자가 잘리지 않게 푼다
  const [moving, setMoving] = useState(false);
  // 접는 동안에는 보던 무대를 그대로 둔 채 높이만 줄이고, 다 접힌 뒤에 내린다 (펼칠 때는 새 무대를 바로 세운다)
  const [last, setLast] = useState<Exclude<StairsMode, "none">>(() => (mode === "none" ? "brief" : mode));
  if (mode !== "none" && mode !== last) setLast(mode);
  const shown: StairsMode = mode !== "none" ? mode : moving ? last : "none";
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moving) return;
    const el = bodyRef.current;
    // 무대 안(이름표·KPI)의 transitionend 도 올라오므로 몸 자신의 height 만 본다. 중간에 보기를 또 바꾸면 이 효과가 다시 걸린다
    const end = (e: TransitionEvent) => { if (e.target === el && e.propertyName === "height") setMoving(false); };
    el?.addEventListener("transitionend", end);
    // 대비: 옮김이 아직 돌고 있으면(그림이 늦게 그려지는 창) 기다렸다가 다시 본다
    let t = 0;
    const check = () => { if (el?.getAnimations().some((a) => a.playState === "running")) t = window.setTimeout(check, 200); else setMoving(false); };
    t = window.setTimeout(check, MOVE_FALLBACK_MS);
    return () => { el?.removeEventListener("transitionend", end); window.clearTimeout(t); };
  }, [moving, mode]);

  const choose = (v: StairsMode) => {
    if (v === mode) return;
    saveMode(v);
    // 같은 그림에서 높이와 함께 바뀌어야 첫 장면부터 잘린다. 움직임 줄이기면 높이가 바로 바뀌므로 자르기·남겨 두기 없이 곧장
    if (!reducedMotion()) setMoving(true);
    setMode(v);
  };

  // 접힌 몸 안으로 Tab 이 들어가지 않게 (접는 동안 남아 있는 무대 포함)
  useLayoutEffect(() => { bodyRef.current?.toggleAttribute("inert", mode === "none"); }, [mode]);

  // [접기 | 간략히 | 자세히] = 라디오 묶음: 고른 칸만 Tab 으로 들어오고, 화살표·Home·End 로 옮기면 바로 바뀐다
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const onSegKey = (e: React.KeyboardEvent) => {
    const i = VIEWS.findIndex((o) => o.v === mode);
    const n = VIEWS.length;
    const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i + n - 1) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    choose(VIEWS[j].v);
    radios.current[j]?.focus();
  };
  // 간략히 → 자세히: 누른 단추가 사라지므로, 초점이 무대 안에 있었다면 사라지기 전에 머리 줄의 [자세히] 로 옮겨 둔다
  const openFull = () => {
    if (bodyRef.current?.contains(document.activeElement)) radios.current[VIEWS.findIndex((o) => o.v === "full")]?.focus({ preventScroll: true });
    choose("full");
  };

  const s = useMemo(() => stairStats(doc, students), [doc, students]);
  const hasRoster = students.length > 0;
  const label = students[0]?.class || cls;

  // 랜드마크는 하나만: 자세히의 기록 계단(StairsView)이 스스로 '기록 계단' 구역이므로 이 자리는 제목(h2)만 단 묶음이다
  return (
    <div className="stairs-panel" data-view={mode} data-moving={moving ? "" : undefined}>
      <div className="sp-head">
        <h2 className="eyebrow sp-title">기록 계단</h2>
        <span className="sp-meta">{label ? `${label} · ` : ""}{s.total}명</span>
        {mode === "none" && (hasRoster ? (
          <p className="sp-sum">
            <span>평균 <b>{s.avg.toFixed(1)}</b>건</span>
            <span className={s.zero ? "hot" : undefined}>출발선 <b>{s.zero}</b>명</span>
            <span title="이번 주(월요일부터) 기록이 있는 학생">이번 주 <b>{s.weekOn}</b>/{s.total}</span>
            {s.lowOn && <span className={s.lowN ? "hot" : undefined} title={s.rule.tip}>기록 부족 <b>{s.lowN}</b>명</span>}
          </p>
        ) : <p className="sp-sum"><span>명단 없음</span></p>)}
        <span className="sp-fill" />
        <div className="seg sp-seg" role="radiogroup" aria-label="기록 계단 보기" onKeyDown={onSegKey}>
          {VIEWS.map((o, i) => (
            <button key={o.v} ref={(el) => { radios.current[i] = el; }} type="button" role="radio" aria-checked={mode === o.v}
              tabIndex={mode === o.v ? 0 : -1} className={mode === o.v ? "active" : undefined} title={o.tip} onClick={() => choose(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={bodyRef} className="sp-body" aria-hidden={mode === "none" || undefined}>
        {shown === "brief" && <StairsBrief key={cls} s={s} hasRoster={hasRoster} onMore={openFull} />}
        {shown === "full" && (
          <div className="board-stairs">
            <StairsView key={cls} doc={doc} students={students} onOpen={onOpen} q="" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 간략히: 낮은 밤의 무대 + 이름 없는 작은 계단 ---------- */

/** 점(학생 하나): 6px + 3px 틈. stairs-brief.css .sb-pile 과 같아야 한다 */
const DOT = 6, DGAP = 3, PITCH = DOT + DGAP;
/** 칸마다 그리는 점 수 상한 (정확한 수는 디딤판의 'N명') · 한 줄 점 수 범위 · 무리 좌우 여백 · 디딤판과 첫 점 줄 사이 */
const DOT_CAP = 40, PER_MIN = 3, PER_MAX = 12, PILE_SIDE = 8, PILE_GAP = 6;
/** 칸 너비 상한: 넓은 화면에서 칸이 적으면 납작한 판이 되지 않게, 계단을 오른쪽(빛이 드는 쪽)에 모은다 */
const COL_MAX = 200;
/** 첫 디딤판 최소 높이 (기록 계단 BASE 와 같은 34) */
const STEP1 = 34;
/**
 * 디딤판 글자: 위 여백 · 한 줄 높이 (stairs.css .stair-step padding-top 7 · .stair-range 12px×1.1 + 틈 1, 빈 칸 6 · 11px×1.1).
 * 디딤판 아래 12px 는 바닥에 비치므로(-webkit-box-reflect) 글자는 그 위에서 끝나야 한다 — 줄 수만큼 디딤판을 높인다
 */
const TXT_TOP = 7, TXT_LINE = 13.5, VAC_TOP = 6, VAC_LINE = 12.5, REFLECT = 12;
/** 단 높이 범위 · 맨 위 여유 (빈 반은 맨 윗 디딤판 위에 안내문 한 줄이 들어갈 만큼) */
const RISE_MIN = 6, RISE_MAX = 56, TOP_ROOM = 6, NOTE_ROOM = 26;
/** 가는 디딤판 너비 (어느 칸이 가늘어지는지는 기록 계단과 같은 sliverRuns) · 빈 칸 너비 비율 */
const SLIVER_W = 10, VACANT_FR = 0.5;

interface BriefLay { t: number[]; sliver: boolean[]; per: number; template: string; narrow: boolean }

/**
 * 작은 계단 배치. 칸 너비: 사람 있는 칸·출발선 1, 빈 칸 .5, 이어진 빈 칸의 가운데는 가는 디딤판.
 * 디딤판 높이는 칸 순서대로 늘 오른다(1칸 = step1, 그다음 rise 씩, 가는 디딤판은 절반) — 점 무리까지 무대에 들어가는 가장 큰 rise.
 * step1 은 디딤판 글자 줄 수로 정한다: 어느 칸이든 rise 가 가장 작아도(RISE_MIN) 글자가 비침 띠 위에서 끝나게.
 */
function briefLayout(counts: number[], W: number, H: number, b: StairBuckets, family: string): BriefLay {
  const S = counts.length;
  const sliver = sliverRuns(counts);
  const fr = counts.map((n, i): number => (sliver[i] ? 0 : n || i === 0 ? 1 : VACANT_FR));
  const slivers = sliver.filter(Boolean).length;
  const unit = Math.min(COL_MAX, Math.max(0, W - slivers * SLIVER_W) / Math.max(VACANT_FR, fr.reduce((a, x) => a + x, 0)));
  const per = Math.max(PER_MIN, Math.min(PER_MAX, Math.floor((unit - 2 * PILE_SIDE + DGAP) / PITCH)));
  // 디딤판 글자 줄 수 (글자는 한 단계 굵게 재어 넉넉히). 사람 있는 칸: '11건 이상 8명' 한 줄 → 이름·인원 두 줄 → 이름까지 접혀 세 줄
  // (디딤판 좌우 여백 8+8 + 1). 빈 칸: '11건 이상' 한 줄 → '11건 / 이상' 두 줄 (여백 2+2)
  const rangeW = (i: number, px: number) => textW(String(b.lo(i)), px, 700, family) + textW(`건 ${i === 1 ? "이하" : "이상"}`, px === 12 ? 10.5 : px, 600, family);
  let occLines = 1, vacLines = 1;
  for (let i = 1; i < S; i++) {
    if (sliver[i]) continue;
    if (counts[i]) {
      const r = rangeW(i, 12) + 18, nW = textW(`${counts[i]}명`, 11, 600, family); // 18 = small 왼쪽 1 + 여백 16 + 1
      occLines = Math.max(occLines, unit >= r + 6 + nW ? 1 : unit >= r ? 2 : 3); // 6 = 이름과 인원 사이
    } else if (unit * VACANT_FR < rangeW(i, 11) + 5) vacLines = 2;
  }
  const narrow = occLines === 3;
  const textNeed = (i: number) => (sliver[i] ? 0 : counts[i] ? TXT_TOP + occLines * TXT_LINE + REFLECT : VAC_TOP + vacLines * VAC_LINE + REFLECT);
  const pileH = (n: number) => (n ? Math.ceil(Math.min(n, DOT_CAP) / per) * PITCH - DGAP + PILE_GAP : 0);
  const e = counts.map(() => 0); // 1칸에서 몇 단 올랐나
  for (let i = 2; i < S; i++) e[i] = e[i - 1] + (sliver[i] ? 0.5 : 1);
  let step1 = STEP1;
  for (let i = 1; i < S; i++) step1 = Math.max(step1, Math.ceil(textNeed(i) - e[i] * RISE_MIN));
  const room = counts.every((n, i) => i === 0 || !n) ? NOTE_ROOM : TOP_ROOM; // 모두 출발선 = 기록 0건 반 → 안내문 자리
  let rise = RISE_MAX;
  for (let i = 2; i < S; i++) rise = Math.min(rise, (H - room - step1 - pileH(counts[i])) / e[i]);
  rise = Math.max(RISE_MIN, Math.floor(rise));
  return {
    t: counts.map((_, i) => (i ? Math.round(step1 + e[i] * rise) : 0)),
    sliver, per, narrow,
    // 칸 너비는 px 로 (합이 칸 너비를 넘지 않게 내림). 남는 너비는 왼쪽에 — 격자는 오른쪽에 붙는다 (.sb-stairs justify-content: end)
    template: fr.map((x, i) => `${sliver[i] ? SLIVER_W : Math.floor(x * unit)}px`).join(" "),
  };
}

/** 칸 위 카드(title): 칸 이름 · 인원 · 이번 주 · 누가 있는지 (12명까지) */
function colTip(name: string, col: Kid[], wk: number, low: string): string {
  const head = `${name} · ${col.length}명${col.length ? ` · 이번 주 기록 ${wk}명` : ""}${low ? ` · 기록 부족 (${low})` : ""}`;
  const who = col.length ? col.slice(0, 12).map((k) => `${pad2(k.no)} ${k.name}`).join(", ") + (col.length > 12 ? ` 외 ${col.length - 12}명` : "") : "";
  return [head, who, "누르면 자세히 보기"].filter(Boolean).join("\n");
}

function StairsBrief({ s, hasRoster, onMore }: { s: StairStats; hasRoster: boolean; onMore: () => void }) {
  const setPage = useStore((x) => x.setPage);
  const setSettingsTab = useStore((x) => x.setSettingsTab);

  // 잰 크기로 배치: 계단 칸 하나만 본다(1px 미만 변화는 무시). 격자는 칸 안에 절대 위치라 내용이 칸 크기를 바꾸지 못한다
  const fieldRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = fieldRef.current; if (!el) return;
    const put = (w: number, h: number) => setBox((o) => (Math.abs(o.w - w) < 1 && Math.abs(o.h - h) < 1 ? o : { w, h }));
    put(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => put(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRoster]);
  const countSig = s.cols.map((c) => c.length).join(",");
  // 디딤판 글자 줄 수는 글자 너비로 정하므로, 웹 글꼴이 늦게 들어오면(칸 크기가 그대로여도) 다시 잰다 — 기록 계단과 같은 useFontTick
  const fontTick = useFontTick();
  const lay = useMemo(() => {
    if (box.w <= 0 || box.h <= 0) return null;
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    return briefLayout(countSig.split(",").map(Number), box.w, box.h, s.b, family);
  }, [countSig, box.w, box.h, s.b.size, fontTick]); // s.b 는 칸 수(countSig 의 길이)와 size 로만 정해진다

  const { b } = s;
  return (
    <div className="sb-wrap">
      {/* data-many: 칸이 많으면(9칸 이상) 조금 좁은 무대에서도 숫자를 세 칸 격자로 접어 계단에 너비를 준다 (칸 수로만 정해 측정과 맞물리지 않는다) */}
      <div className="stairs-stage sb-stage" data-many={b.steps >= 9 ? "" : undefined}>
        {hasRoster ? (
          <>
            <div className="sb-left">
              {/* 숫자 이름이 곧 범례: 하늘빛 점 = 이번 주 기록, 호박빛 점선 = 기록 부족 구간 */}
              <div className="kpis">
                <div className="kpi"><span className="k">평균</span><b>{s.avg.toFixed(1)}<small>건</small></b></div>
                <div className={`kpi ${s.zero ? "warn" : ""}`}><span className="k">출발선</span><b>{s.zero}<small>명</small></b></div>
                <div className="kpi" title="이번 주(월요일부터) 기록이 있는 학생 — 계단의 하늘빛 점">
                  <span className="k"><i className="sb-key" aria-hidden="true" />이번 주 기록</span><b>{s.weekOn}<small>/{s.total}명</small></b>
                  <i className="meter" style={{ "--v": s.total ? s.weekOn / s.total : 0 } as React.CSSProperties}><i /></i>
                </div>
                {s.lowOn && (
                  <div className={`kpi ${s.lowN ? "warn" : ""}`} title={`${s.rule.tip}\n계단의 호박빛 점선까지가 기록 부족 구간`}>
                    <span className="k"><i className="sb-lowk" aria-hidden="true" />기록 부족</span><b>{s.lowN}<small>명</small></b>
                  </div>
                )}
                <div className="kpi"><span className="k">가장 높이</span><b>{s.max}<small>건</small></b></div>
              </div>
              <button type="button" className="btn ghost sm sb-more" onClick={onMore} title="이름표까지 모두 세운 기록 계단으로">
                자세히 보기<Icon name="right" size={13} />
              </button>
            </div>
            <div className="sb-field" ref={fieldRef}>
              {s.max === 0 && <p className="sb-note">첫 기록이 쌓이면 계단에 불이 켜집니다</p>}
              {lay && (
                <div className={`stairs-grid sb-stairs${lay.narrow ? " narrow" : ""}`} role="list" aria-label="칸별 학생 수"
                  style={{ gridTemplateColumns: lay.template }}>
                  {s.cols.map((col, i) => {
                    const low = s.isLow(i);
                    const wk = col.filter((k) => k.week > 0).length;
                    const name = i ? b.name(i) : "출발선 0건";
                    const cn = ["stair-col", i === 0 && "start", i === b.steps - 1 && "top", i === s.peak && "peak", !col.length && "vacant",
                      lay.sliver[i] && "sliver", low && "low", i === s.lowEdge && "low-edge"].filter(Boolean).join(" ");
                    // 이번 주 기록이 있는 학생(하늘빛)부터 디딤판에 앉힌다 — 같은 칸 안에서 빛이 한데 모여 보이게
                    const dots = col.length ? [...col].sort((x, y) => Number(y.week > 0) - Number(x.week > 0) || x.no - y.no).slice(0, DOT_CAP) : [];
                    return (
                      <div key={i} role="listitem" className={cn} onClick={onMore}
                        title={colTip(name, col, wk, low ? s.rule.short : "")}
                        style={{ "--i": i, "--t": `${lay.t[i]}px`, "--per": lay.per } as React.CSSProperties}>
                        <span className="stairs-sr">{`${name}, ${col.length}명${col.length ? `, 이번 주 기록 ${wk}명` : ""}${low ? ", 기록 부족 구간" : ""}`}</span>
                        {dots.length > 0 && (
                          <div className="sb-pile" aria-hidden="true">
                            {dots.map((k) => <i key={k.no} className={k.week > 0 ? "on" : undefined} />)}
                          </div>
                        )}
                        {i === 0 ? (
                          <div className="stair-start" aria-hidden="true">
                            <span className="sb-startlab"><span className="stair-range">출발선</span><span className="stair-n">{col.length}명</span></span>
                          </div>
                        ) : (
                          <div className="stair-step" data-tier={Math.round((i / Math.max(1, b.steps - 1)) * 3)} aria-hidden="true">
                            <span className="stair-range">{b.lo(i)}<small>건 {i === 1 ? "이하" : "이상"}</small></span>
                            {col.length > 0 && <span className="stair-n">{col.length}명</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="stairs-empty sb-empty">
            <b>명단이 없습니다</b>
            <p>설정 → 반·명단에서 학생을 등록하면 계단이 채워집니다</p>
            <button type="button" className="btn sm" onClick={() => { setSettingsTab("roster"); setPage("settings"); }}>설정 열기</button>
          </div>
        )}
        <div className="stairs-horizon" aria-hidden="true" />
      </div>
    </div>
  );
}
