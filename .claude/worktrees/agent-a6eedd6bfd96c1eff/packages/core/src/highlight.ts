/**
 * 초안 문장을 학생활동·역량·교사의 평가로 나눠 형광펜을 칠하기 위한 구분.
 *
 * - AI 로 만든 초안은 문장마다 AI 가 준 구간(spans)을 쓴다.
 * - 그 밖의 문장(직접 고친 문장, 규칙 기반 초안)은 아래 규칙으로 즉시 나눈다.
 * 규칙은 표현 사전에 기대므로 경계가 애매한 표현은 틀릴 수 있다.
 */
import type { DraftSentence, DraftSpan, SpanKind } from "./types";
import { splitSentences } from "./text";

/** 역량을 가리키는 말 (예: 자기관리 역량, 문제 해결 능력, 비판적 사고력) */
const COMPETENCY = new RegExp(
  "(?:[가-힣]+\\s?)?(?:역량|능력|사고력|탐구력|해결력|창의력|표현력|이해력|분석력|추론력|판단력|소통력|응용력|사고 ?능력|리더십|주도성|창의성|자기주도성|공동체 ?의식|탐구심|호기심)",
  "g",
);

/** 교사의 판단·평가 표현 (예: 매우 뛰어난 학생임, 성실한 언어 학습자, 돋보임) */
const EVALUATION = new RegExp(
  [
    // 앞에 꾸밈말이 붙은 학생상: "꾸준히 발전하고자 노력하는 성실한 언어 학습자"
    "(?:(?:꾸준히|스스로|늘|항상|누구보다)\\s)?(?:[가-힣]+(?:하는|하고자|한)\\s){0,3}(?:성실한|열정적인|적극적인|주도적인|모범적인|우수한|뛰어난|훌륭한|책임감 있는)\\s?(?:[가-힣]+\\s)?(?:학생|학습자|인재)",
    // 정도 부사 + 평가 형용사(+ 학생): "매우 뛰어난 학생", "탁월함", "돋보임"
    "(?:(?:매우|아주|특히|무척|남달리|대단히|누구보다|월등히)\\s?)?(?:뛰어[나난남]|돋보[이인임였]|우수[하한함]|탁월[하한함]|훌륭[하한함]|두드러[지진짐]|인상적[이인임]|모범적[이인임]|남다[른름])[가-힣]*(?:\\s(?:[가-힣]+\\s)?(?:학생|학습자))?",
    // "~이 매우 높음", "~이 깊음"
    "(?:매우|아주|무척)\\s?(?:높[음은]|깊[음은]|크[다게]|좋[음은])",
  ].join("|"),
  "g",
);

/** 이음말: 형광펜을 칠하지 않는 연결 부분 */
const CONNECTOR = /(하였고|하였으며|했으며|했고|하고|하며|하여|해서|함으로써|으로써|로써|하는|하였음|하였다|으며|이며|함|임|,|\.|·)/g;

/** 학생이 실제로 한 행동을 나타내는 말 */
const ACTION = /(질문|작성|발표|정리|활용|강조|조사|설명|참여|수행|해결|탐구|분석|비교|실험|관찰|측정|토의|토론|제시|제작|설계|보충|학습|읽|찾아|적용|계산|기록|담당|공유|조율|바로잡|만들|그려|풀이|예측|검증|도출|수정|보완|제출|표현|전달|구성|소개|요약|시연|체험|참가|기획|운영|지도|집중|공감|개선|노력|이해|고민|탐색|발견|협력|도움|도와|이끌|맡아|맡은)/;

function mark(kinds: (SpanKind | null)[], chars: string[], re: RegExp, kind: SpanKind, onlyEmpty: boolean) {
  const text = chars.join("");
  for (const m of text.matchAll(re)) {
    if (!m[0].trim()) continue;
    const start = Array.from(text.slice(0, m.index)).length;
    const len = Array.from(m[0]).length;
    for (let i = start; i < start + len; i++) if (!onlyEmpty || kinds[i] === null) kinds[i] = kind;
  }
}

/** 규칙으로 한 문장을 구간으로 나눈다 */
export function classifySentence(sentence: string): DraftSpan[] {
  const chars = Array.from(sentence);
  const kinds: (SpanKind | null)[] = chars.map(() => null);
  mark(kinds, chars, COMPETENCY, "competency", false);
  mark(kinds, chars, EVALUATION, "evaluation", true);

  // 활동: 이음말 사이 조각 중 행동이 들어 있고 아직 칠하지 않은 부분
  const text = chars.join("");
  const cuts: { start: number; end: number }[] = [];
  let last = 0;
  for (const m of text.matchAll(CONNECTOR)) {
    const s = Array.from(text.slice(0, m.index)).length;
    cuts.push({ start: last, end: s });
    last = s + Array.from(m[0]).length;
  }
  cuts.push({ start: last, end: chars.length });
  for (const { start, end } of cuts) {
    const seg = chars.slice(start, end).join("");
    const hangul = (seg.match(/[가-힣]/g) || []).length;
    if (hangul < 2 || (hangul < 4 && !ACTION.test(seg))) continue;
    const free = kinds.slice(start, end).filter((k) => k === null).length;
    if (free / Math.max(1, end - start) < 0.6) continue;
    if (!ACTION.test(seg) && !/[을를]\s|에서|에 대해|에 관한/.test(seg)) continue;
    let a = start; let b = end;
    while (a < b && /\s/.test(chars[a])) a++;
    while (b > a && /\s/.test(chars[b - 1])) b--;
    for (let i = a; i < b; i++) if (kinds[i] === null) kinds[i] = "activity";
  }

  const out: DraftSpan[] = [];
  chars.forEach((c, i) => {
    const k = kinds[i] ?? "none";
    const lastSpan = out[out.length - 1];
    if (lastSpan && lastSpan.kind === k) lastSpan.text += c; else out.push({ text: c, kind: k });
  });
  return out;
}

export interface SentenceView { text: string; spans: DraftSpan[]; evidence: string[]; source: "ai" | "rule" }

/** 초안 전체를 문장별 구간으로. AI 구간이 있고 문장이 그대로면 그것을, 아니면 규칙을 쓴다. */
export function draftSpans(text: string, sentences?: DraftSentence[] | null): SentenceView[] {
  return splitSentences(text).map((s) => {
    const ds = sentences?.find((x) => x.text.trim() === s.trim());
    const ai = ds?.spans && ds.spans.map((p) => p.text).join("").trim() === s.trim() ? ds.spans : null;
    return { text: s, spans: ai ?? classifySentence(s), evidence: ds?.evidence ?? [], source: ai ? "ai" : "rule" };
  });
}

export interface SpanRatio { activity: number; competency: number; evaluation: number; none: number; total: number }

/** 글자 수 기준 비율 (공백 제외) */
export function spanRatio(views: SentenceView[]): SpanRatio {
  const r = { activity: 0, competency: 0, evaluation: 0, none: 0, total: 0 };
  for (const v of views) for (const sp of v.spans) {
    const n = sp.text.replace(/\s/g, "").length;
    r[sp.kind] += n; r.total += n;
  }
  return r;
}

export const SPAN_LABEL: Record<SpanKind, string> = { activity: "학생활동", competency: "역량", evaluation: "교사의 평가", none: "" };
