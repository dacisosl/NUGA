/** 글자수: 공백 포함 / 공백 제외 / NEIS 바이트(한글 등 3바이트, 영문·숫자·공백 1바이트, 줄바꿈 2바이트) */
export interface CharCount { withSpaces: number; withoutSpaces: number; neisBytes: number }

export function countChars(text: string): CharCount {
  const chars = Array.from(text.replace(/\r\n?/g, "\n"));
  let bytes = 0;
  for (const ch of chars) bytes += ch === "\n" ? 2 : ch.charCodeAt(0) < 128 ? 1 : 3;
  return { withSpaces: chars.length, withoutSpaces: chars.filter((c) => !/\s/.test(c)).length, neisBytes: bytes };
}

/** 문장 분리: 마침표·물음표·느낌표·줄바꿈 기준. 소수점(3.5)은 유지. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  const chars = Array.from(text.replace(/\r\n?/g, "\n"));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]; buf += c;
    if (c === "." || c === "!" || c === "?" || c === "\n") {
      const next = chars[i + 1];
      const prev = chars[i - 1];
      const isDecimal = c === "." && /\d/.test(prev || "") && /\d/.test(next || "");
      if (!isDecimal && (next === undefined || /\s/.test(next))) { if (buf.trim()) out.push(buf.trim()); buf = ""; }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const HANGUL_BASE = 0xac00;
export function jongOf(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > 0xd7a3) return -1;
  return (code - HANGUL_BASE) % 28;
}
export function hasJong(ch: string): boolean {
  const j = jongOf(ch);
  if (j >= 0) return j !== 0;
  if (/[0-9]/.test(ch)) return /[013678]/.test(ch);
  return /[lmnrLMNR]/.test(ch);
}

const TRAIL = /[)\]'"”’]+$/;

/** 조사 선택: josa("개념", "을/를") → 개념을 */
export function josa(word: string, pair: "을/를" | "이/가" | "은/는" | "과/와" | "으로/로"): string {
  const last = Array.from(word.replace(TRAIL, "")).pop() || "";
  const [a, b] = pair.split("/");
  if (pair === "으로/로") { const j = jongOf(last); return word + (j > 0 && j !== 8 ? a : b); }
  return word + (hasJong(last) ? a : b);
}

/** 명사형 종결(~함·~임·~보임·~드러냄·~됨·~음 …) 여부: 마지막 글자 받침이 ㅁ */
export function isNominalEnding(sentence: string): boolean {
  const core = sentence.trim().replace(/[.!?…\s'"”’)\]]+$/g, "");
  const last = Array.from(core).pop();
  if (!last) return true;
  return jongOf(last) === 16;
}

const HONORIFIC = /(습니다|입니다|합니다|였습니다|겠습니다|세요|십시오|해요|예요|이에요|군요|네요)/;
export function hasHonorific(sentence: string): boolean { return HONORIFIC.test(sentence) || /!/.test(sentence); }

const SUBJECT = /(^|\s)(이 학생은|이 학생이|학생은|학생이|본인은|본인이|그는|그녀는|자신은)\s/;
export function hasExplicitSubject(sentence: string): boolean { return SUBJECT.test(" " + sentence); }

const ENDING_MAP: [RegExp, string][] = [
  [/하였습니다$|했습니다$|합니다$|하였다$|했다$|한다$|하다$|하였음$/, "함"],
  [/보였습니다$|보였다$|보인다$|보이다$/, "보임"],
  [/드러냈습니다$|드러냈다$|드러낸다$|드러내다$/, "드러냄"],
  [/나타냈습니다$|나타냈다$|나타낸다$|나타내다$/, "나타냄"],
  [/입니다$|이었다$|이다$|였다$/, "임"],
  [/되었습니다$|되었다$|됐다$|된다$|되다$/, "됨"],
  [/있습니다$|있었다$|있다$/, "있음"],
  [/없습니다$|없었다$|없다$/, "없음"],
  [/졌습니다$|졌다$|진다$|지다$/, "짐"],
  [/주었습니다$|주었다$|줬다$|준다$|주다$/, "줌"],
  [/노력했습니다$|노력하였다$|노력했다$/, "노력함"],
];

/** 서술형 → 명사형 종결 자동 고침 제안. 못 고치면 null */
export function suggestNominal(sentence: string): string | null {
  const m = sentence.trim().match(/^([\s\S]*?)([.!?…]*)$/);
  if (!m) return null;
  const body = m[1].trim();
  for (const [re, rep] of ENDING_MAP) {
    if (re.test(body)) return body.replace(re, rep) + ".";
  }
  return null;
}

/** 문자 bigram Jaccard 유사도 (공백·구두점 제거) */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => Array.from(s.replace(/[\s.,!?…'"()\[\]·]/g, ""));
  const grams = (cs: string[]) => { const set = new Set<string>(); for (let i = 0; i < cs.length - 1; i++) set.add(cs[i] + cs[i + 1]); return set; };
  const A = grams(norm(a)); const B = grams(norm(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export function truncate(s: string, n: number): string { const cs = Array.from(s); return cs.length > n ? cs.slice(0, n - 1).join("") + "…" : s; }

/** 단위에 맞는 길이 (bytes = NEIS 바이트) */
export function lengthIn(text: string, mode: "withSpaces" | "withoutSpaces" | "bytes"): number {
  const c = countChars(text);
  return mode === "bytes" ? c.neisBytes : mode === "withSpaces" ? c.withSpaces : c.withoutSpaces;
}

/** 목표 구간: 한도 × band (기본 96~100%). 한도 초과는 금지. */
export function lengthWindow(limit: number, band: [number, number] = [0.96, 1.0]): { min: number; max: number } {
  const max = Math.floor(limit * Math.min(1, band[1]));
  return { min: Math.min(max, Math.ceil(limit * band[0])), max };
}

/**
 * 허용 폭 (30바이트 · 10자): 목표에서 이만큼 안쪽이면 모자라도 넘어도 맞은 것으로 본다.
 * 생성은 여전히 목표 구간 안을 겨냥하고, 결과가 허용 폭 안이면 다시 묻거나 자르지 않는다
 */
export const LENGTH_SLACK: Record<"withSpaces" | "withoutSpaces" | "bytes", number> = { bytes: 30, withSpaces: 10, withoutSpaces: 10 };
/** 이 한도에서의 허용 폭: 30바이트(10자)와 한도의 10% 가운데 작은 쪽 (아주 작은 한도에서 폭이 너무 크지 않게) */
export function lengthSlack(limit: number, mode: "withSpaces" | "withoutSpaces" | "bytes"): number {
  return Math.min(LENGTH_SLACK[mode], Math.round(limit * 0.1));
}
/** 충분히 가까운 아래 끝 = 목표 구간 아래 끝과 '한도 − 허용 폭' 가운데 낮은 쪽 (목표가 작아도 30바이트쯤 모자란 것은 괜찮게) */
export function lengthFloor(limit: number, mode: "withSpaces" | "withoutSpaces" | "bytes", band?: [number, number]): number {
  const { min, max } = lengthWindow(limit, band);
  return Math.max(0, Math.min(min, max - lengthSlack(limit, mode)));
}
/** 받아들이는 위 끝 = 한도 + 허용 폭 (30바이트쯤 넘는 것은 괜찮게) */
export function lengthCeil(limit: number, mode: "withSpaces" | "withoutSpaces" | "bytes", band?: [number, number]): number {
  return lengthWindow(limit, band).max + lengthSlack(limit, mode);
}

export function unitLabel(mode: "withSpaces" | "withoutSpaces" | "bytes"): string {
  return mode === "bytes" ? "B" : "자";
}

export function modeLabel(mode: "withSpaces" | "withoutSpaces" | "bytes"): string {
  return mode === "bytes" ? "NEIS 바이트" : mode === "withSpaces" ? "공백 포함" : "공백 제외";
}

/** 표시용: "1,452 / 1,500 B · 약 484자" (바이트) 또는 "484 / 500자" */
export function formatLength(text: string, limit: number, mode: "withSpaces" | "withoutSpaces" | "bytes"): string {
  const n = (x: number) => x.toLocaleString("ko-KR");
  if (mode === "bytes") return `${n(lengthIn(text, "bytes"))} / ${n(limit)} B · 약 ${n(countChars(text).withSpaces)}자`;
  return `${n(lengthIn(text, mode))} / ${n(limit)}자`;
}

/** 바이트 한도를 대략 글자수로 (한글 위주 문장 기준) */
export function approxCharsForBytes(bytes: number): number { return Math.round(bytes / 2.75); }
