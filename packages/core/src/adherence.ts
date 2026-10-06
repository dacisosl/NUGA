import type { AdherenceReport, AdherenceRule, DraftSentence, LengthMode, TeacherGuide } from "./types";
import { hasExplicitSubject, hasHonorific, isNominalEnding, lengthFloor, lengthIn, lengthWindow, similarity, splitSentences } from "./text";
import { FORBIDDEN_TERMS } from "./review";
import { GRADE_STYLE, gradeOf } from "./achievement";
import { draftSpans, spanRatio } from "./highlight";

/**
 * 프롬프트 반영도 점검 (v3 17.4). 초안이 생성 규칙과 교사 지침을 얼마나 지켰는지 규칙별로 확인한다.
 * 반영도 = 통과한 규칙 ÷ 점검할 수 있는 규칙. 자유 문장 지침은 "자동 점검 불가"로 따로 표시한다.
 */
export interface AdherenceInput {
  text: string;
  sentences: DraftSentence[] | null;
  /** 근거로 쓸 수 있었던 기록·PDF기록 (id → 내용) */
  evidence: Record<string, string>;
  /** 근거 id → 카테고리 라벨 (PDF기록은 "PDF기록") */
  evidenceCategory: Record<string, string>;
  lengthMode: LengthMode;
  limit: number;
  band?: [number, number];
  achievement: number | null;
  guide?: TeacherGuide;
  extraForbidden?: string[];
  studentName?: string;
  now?: string;
}

/** 근거 밖 핵심어를 셀 때 빼는 낱말: 생기부 서술어·연결어·자주 쓰는 일반어 */
const COMMON = new Set([
  "수업", "활동", "과정", "내용", "개념", "결과", "자료", "정리", "발표", "질문", "설명", "참여", "탐구", "이해", "적용", "분석", "비교", "모둠", "친구", "자신", "생각", "문제", "해결",
  "역량", "태도", "모습", "능력", "보임", "드러냄", "나타냄", "통해", "바탕", "관련", "대한", "위해", "함께", "적극적", "적극적으로", "스스로", "구체적", "구체적으로", "근거", "사례", "원리",
  "학습", "수행", "실험", "보고서", "제출", "작성", "주제", "확인", "제시", "도출", "연결", "확장", "심화", "의미", "중심", "부분", "방법", "관계", "차이", "변화", "원인", "이유", "특히", "또한",
]);

/** 낱말 뽑기: 한글 2자 이상, 흔한 조사·어미를 떼어 낸다 */
export function keywordsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^가-힣A-Za-z0-9]+/)) {
    let w = raw.replace(/(으로|에서|에게|까지|부터|처럼|보다|이며|이고|하여|하고|함|했|하는|하며|적인|적으로|에|의|을|를|이|가|은|는|과|와|도|로|만)$/, "");
    if (Array.from(w).length < 2 || /^\d+$/.test(w)) continue;
    w = w.replace(/(하기|했던|되는|되어|된|한)$/, "");
    if (Array.from(w).length >= 2) out.push(w);
  }
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function checkAdherence(inp: AdherenceInput): AdherenceReport {
  const text = inp.text.trim();
  const sents = splitSentences(text);
  const rules: AdherenceRule[] = [];
  const add = (key: string, label: string, pass: boolean, detail: string, sentences?: number[], checkable = true) => rules.push({ key, label, pass, detail, sentences, checkable });
  const evidenceIds = Object.keys(inp.evidence);
  const allEvidence = Object.values(inp.evidence).join(" ");

  // 1. 어체·존칭·주어
  const notNominal = sents.map((s, i) => (isNominalEnding(s) ? -1 : i)).filter((i) => i >= 0);
  add("style", "명사형 종결", notNominal.length === 0, notNominal.length ? `${notNominal.length}문장이 명사형으로 끝나지 않음` : "모든 문장", notNominal);
  const honor = sents.map((s, i) => (hasHonorific(s) ? i : -1)).filter((i) => i >= 0);
  add("honorific", "존칭·감탄 없음", honor.length === 0, honor.length ? `${honor.length}문장` : "없음", honor);
  const subj = sents.map((s, i) => (hasExplicitSubject(s) ? i : -1)).filter((i) => i >= 0);
  add("subject", "주어(학생) 생략", subj.length === 0, subj.length ? `${subj.length}문장에 주어` : "생략함", subj);

  // 2. 금지어·이름
  const terms = [...FORBIDDEN_TERMS.flatMap((g) => g.terms), ...(inp.extraForbidden || [])];
  const forb = sents.map((s, i) => (terms.some((t) => s.includes(t)) ? i : -1)).filter((i) => i >= 0);
  const hit = terms.filter((t) => text.includes(t));
  add("forbidden", "기재 금지어 없음", forb.length === 0, hit.length ? `"${hit.slice(0, 3).join('", "')}"` : "없음", forb);
  if (inp.studentName && Array.from(inp.studentName).length >= 2) {
    const nm = sents.map((s, i) => (s.includes(inp.studentName!) ? i : -1)).filter((i) => i >= 0);
    add("name", "학생 이름 없음", nm.length === 0, nm.length ? "이름이 들어감" : "없음", nm);
  }

  // 3. 분량
  const len = lengthIn(text, inp.lengthMode);
  const { max } = lengthWindow(inp.limit, inp.band);
  const min = lengthFloor(inp.limit, inp.lengthMode, inp.band); // 30바이트쯤 모자란 것은 괜찮다
  const u = inp.lengthMode === "bytes" ? "B" : "자";
  add("limit", "한도 이하", len <= max, `${len.toLocaleString("ko-KR")}/${inp.limit.toLocaleString("ko-KR")}${u}`);
  // 기록이 적으면(근거 4건 미만) 미달을 허용한다 (v3 18 예외)
  const fewEvidence = Object.keys(inp.evidence).length < 4;
  const inBand = len >= min && len <= max;
  add("band", "목표 구간", inBand || (len < min && fewEvidence), `${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")}${u} 중 ${len.toLocaleString("ko-KR")}${u}${!inBand && len < min && fewEvidence ? " (기록이 적어 미달 허용)" : ""}`);

  // 4. 근거 연결·일치도
  const mapped = inp.sentences && inp.sentences.length ? inp.sentences : null;
  const support: number[] = sents.map((s, i) => {
    const ev = mapped?.[i]?.evidence?.map((id) => inp.evidence[id]).filter(Boolean) || [];
    if (!ev.length) return 0;
    return Math.max(...ev.map((e) => similarity(s, e)));
  });
  if (mapped) {
    const noEv = sents.map((_, i) => (mapped[i]?.evidence?.length ? -1 : i)).filter((i) => i >= 0);
    add("evidence", "모든 문장에 근거", noEv.length === 0, noEv.length ? `${noEv.length}문장 근거 없음` : `${sents.length}문장`, noEv);
    const weak = support.map((v, i) => (mapped[i]?.evidence?.length && v < 0.08 ? i : -1)).filter((i) => i >= 0);
    add("support", "근거와 내용 일치", weak.length === 0, weak.length ? `${weak.length}문장이 근거와 겹치는 말이 적음` : `평균 ${pct(avg(support))}`, weak);
  }

  // 5. 근거 밖 핵심어 (기록에 없는 말)
  if (evidenceIds.length) {
    const evWords = new Set(keywordsOf(allEvidence));
    const evRaw = allEvidence.replace(/\s/g, "");
    const style = gradeOf(inp.achievement) ? GRADE_STYLE[gradeOf(inp.achievement)!] : GRADE_STYLE.none;
    const styleWords = new Set(keywordsOf([...style.vocab, ...style.avoid].join(" ")));
    const outside: { w: string; i: number }[] = [];
    sents.forEach((s, i) => {
      for (const w of keywordsOf(s)) {
        if (COMMON.has(w) || styleWords.has(w) || evWords.has(w) || evRaw.includes(w)) continue;
        if (!outside.some((o) => o.w === w)) outside.push({ w, i });
      }
    });
    add("outside", "근거 밖 핵심어 적음", outside.length <= 2, outside.length ? `기록에 없는 말: ${outside.slice(0, 5).map((o) => o.w).join(", ")}${outside.length > 5 ? " …" : ""}` : "없음", [...new Set(outside.map((o) => o.i))]);
  }

  // 6. 도달 정도 표현 방향
  const g = gradeOf(inp.achievement);
  const st = GRADE_STYLE[g ?? "none"];
  // "탁월함" → "탁월" 처럼 어간으로 찾되, 흔한 말(참여 등)은 원형 그대로만 찾는다
  const avoidKeys = st.avoid.map((w) => { const stem = w.replace(/(함|하여|적)$/, ""); return Array.from(stem).length >= 2 && !COMMON.has(stem) ? stem : w; });
  const strong = st.avoid.filter((_, k) => text.includes(avoidKeys[k]));
  add("direction", "도달 정도에 맞는 표현", strong.length === 0, strong.length ? `피할 표현 사용: ${strong.join(", ")}` : "맞음", sents.map((s, i) => (avoidKeys.some((w) => s.includes(w)) ? i : -1)).filter((i) => i >= 0));

  // 7. 평가 비중
  if (Array.from(text.replace(/\s/g, "")).length >= 40) {
    const r = spanRatio(draftSpans(text, mapped));
    const ev = r.evaluation / Math.max(1, r.total); const act = r.activity / Math.max(1, r.total);
    add("evalHeavy", "학생활동 중심 (평가 비중 낮음)", !(ev >= 0.3 && act < 0.4), `활동 ${pct(act)} · 평가 ${pct(ev)}`);
  }

  // 8. 카테고리 균형
  const usedIds = [...new Set((mapped || []).flatMap((s) => s.evidence))].filter((id) => inp.evidence[id] !== undefined);
  const availCats = new Set(evidenceIds.map((id) => inp.evidenceCategory[id]).filter(Boolean));
  if (usedIds.length >= 3 && availCats.size >= 2) {
    const cnt = new Map<string, number>();
    for (const id of usedIds) { const c = inp.evidenceCategory[id] || "기타"; cnt.set(c, (cnt.get(c) || 0) + 1); }
    const [topCat, top] = [...cnt].sort((a, b) => b[1] - a[1])[0];
    add("balance", "카테고리 고르게", top / usedIds.length <= 0.8, `${topCat} ${pct(top / usedIds.length)}`);
  }

  // 9. 교사 지침 (선택형 항목만 자동 점검)
  const gd = inp.guide;
  if (gd) {
    for (const w of gd.mustInclude || []) if (w.trim()) add(`must:${w}`, `지침: "${w}" 포함`, text.includes(w.trim()), text.includes(w.trim()) ? "포함" : "빠짐");
    for (const w of gd.avoid || []) if (w.trim()) {
      const idx = sents.map((s, i) => (s.includes(w.trim()) ? i : -1)).filter((i) => i >= 0);
      add(`avoid:${w}`, `지침: "${w}" 쓰지 않기`, idx.length === 0, idx.length ? "사용함" : "지킴", idx);
    }
    if (gd.sentenceLength && sents.length) {
      const avgLen = avg(sents.map((s) => Array.from(s).length));
      add("sentenceLength", `지침: 한 문장 ${gd.sentenceLength}자 안팎`, Math.abs(avgLen - gd.sentenceLength) <= gd.sentenceLength * 0.35, `평균 ${Math.round(avgLen)}자`);
    }
    for (const c of gd.emphasize || []) {
      const hasAvail = evidenceIds.some((id) => inp.evidenceCategory[id] === c);
      if (!hasAvail) continue;
      const used = usedIds.some((id) => inp.evidenceCategory[id] === c);
      add(`emph:${c}`, `지침: ${c} 강조`, used, used ? "근거로 씀" : "이 카테고리 기록을 쓰지 않음");
    }
    if (gd.note?.trim()) add("note", "자유 지침", true, "자동 점검 불가 — 교사가 확인", undefined, false);
  }

  const checkable = rules.filter((r) => r.checkable);
  const passed = checkable.filter((r) => r.pass).length;
  const score = checkable.length ? passed / checkable.length : 1;
  const linkRate = mapped && sents.length ? sents.filter((_, i) => mapped[i]?.evidence?.length).length / sents.length : 0;
  const useRate = evidenceIds.length ? usedIds.length / evidenceIds.length : 0;
  return {
    score, passed, total: checkable.length, rules,
    metrics: { linkRate, useRate, support: avg(support), adherence: score },
    sentenceSupport: support, at: inp.now || new Date().toISOString(),
  };
}

function avg(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

/** 반영도 기준(기본 95%)에 못 미치면 다시 쓰기 요청 문장을 만든다 */
export function regenerationInstruction(rep: AdherenceReport, sentences: string[]): string | null {
  const bad = rep.rules.filter((r) => r.checkable && !r.pass);
  if (!bad.length) return null;
  const idx = [...new Set(bad.flatMap((r) => r.sentences || []))].sort((a, b) => a - b);
  const lines = bad.map((r) => `- ${r.label}: ${r.detail}`);
  const target = idx.length ? `다음 문장만 고쳐 다시 써줘(나머지 문장은 그대로 둠):\n${idx.map((i) => `  ${i + 1}) ${sentences[i] || ""}`).join("\n")}` : "아래 점검 결과에 맞게 고쳐 줘.";
  return `${target}\n점검 결과:\n${lines.join("\n")}\n기록에 없는 내용은 더하지 말고, 분량 한도를 넘기지 말 것.`;
}
