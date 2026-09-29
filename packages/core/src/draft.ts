import type { Category, CategoryDef, DraftHistory, DraftSentence, Level, NugaRecord, Performance } from "./types";
import { countChars, isNominalEnding, josa } from "./text";
import { fmtMD } from "./ids";
import { lessonLabel } from "./timetable";

/** AI/로컬 생성기에 전달되는 익명 기록. 반·번호·이름 없음. */
export interface AnonRecord { id: string; date: string; category: string; lesson: string; text: string }
export interface AnonPerf { id: string; title: string; excerpt: string }

export interface DraftRequest {
  level: Level;
  targetLength: number;
  lengthMode: "withSpaces" | "withoutSpaces";
  subject: string;
  records: AnonRecord[];
  performance: AnonPerf[];
  draft?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  instruction?: string;
}

export interface DraftResponse { text: string; sentences: DraftSentence[] }

export function anonymizeRecords(records: NugaRecord[], categories: CategoryDef[]): AnonRecord[] {
  const label = (c: Category) => categories.find((x) => x.key === c)?.label || String(c);
  return [...records]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ id: r.id, date: fmtMD(r.time), category: label(r.category), lesson: lessonLabel(r.lesson), text: (r.note || r.memo || r.voiceMemo?.transcript || "").trim() }));
}

export function anonymizePerformances(perfs: Performance[]): AnonPerf[] {
  return perfs.map((p) => ({ id: p.id, title: p.title, excerpt: p.excerpt || p.ocrText.slice(0, 200) }));
}

export function buildDraftRequest(args: {
  level: Level; targetLength: number; lengthMode: "withSpaces" | "withoutSpaces"; subject: string;
  records: NugaRecord[]; performances: Performance[]; categories: CategoryDef[];
  draft?: string; history?: DraftHistory[]; instruction?: string;
}): DraftRequest {
  return {
    level: args.level, targetLength: args.targetLength, lengthMode: args.lengthMode, subject: args.subject,
    records: anonymizeRecords(args.records, args.categories),
    performance: anonymizePerformances(args.performances),
    draft: args.draft || undefined,
    history: args.history?.map((h) => ({ role: h.role, text: h.text })),
    instruction: args.instruction,
  };
}

export const LEVEL_GUIDE: Record<Level, string> = {
  A: "주도성·심화·확장을 드러내는 서술 (예: 비판적으로 성찰하는 역량을 드러냄)",
  B: "이해·적용·성실한 참여 중심 (예: 개념을 적용하여 설명함)",
  C: "참여 사실과 성장 가능성 중심 (예: 실험 결과를 정리하여 발표함)",
};

export function systemPrompt(): string {
  return [
    "당신은 고등학교 교과 교사의 생활기록부 '세부능력 및 특기사항' 초안 작성을 돕는 도우미다.",
    "규칙:",
    "1. 어체: 모든 문장은 명사형 종결(~함, ~임, ~보임, ~드러냄, ~됨)로 끝낸다. 주어와 학생 이름을 쓰지 않는다. 존칭·감탄·느낌표를 쓰지 않는다.",
    "2. 근거: 전달된 기록(records)과 수행평가(performance) 내용만 사용한다. 기록에 없는 활동·성취·수상은 절대 만들지 않는다. 각 문장마다 근거가 된 기록 id 배열(evidence)을 반환한다. 여러 기록을 종합한 총평 문장은 종합한 기록 id를 모두 넣는다.",
    "3. 수준 반영: A = " + LEVEL_GUIDE.A + " / B = " + LEVEL_GUIDE.B + " / C = " + LEVEL_GUIDE.C,
    "4. 글자수: 목표 N자일 때 N-20 ~ N-1자 (공백 " + "포함 기준은 요청의 lengthMode 를 따른다). 목표를 초과하지 않는다. 기록이 부족하면 미달을 허용하되 내용을 지어내지 않는다.",
    "5. 기재 금지: 교외 활동·수상, 대학명, 부모 정보, 특정 기관명은 쓰지 않는다.",
    "6. 수정 요청(draft + history + instruction)이 있으면 요청을 반영해 전체 초안을 다시 작성하여 반환한다.",
    "7. 출력은 JSON 하나만: {\"text\": 전체 초안, \"sentences\": [{\"text\": 문장, \"evidence\": [id...]}]}. text는 sentences의 text를 공백 한 칸으로 이어 붙인 것과 같아야 한다.",
  ].join("\n");
}

export function userPrompt(req: DraftRequest): string {
  const lines: string[] = [];
  lines.push(`과목: ${req.subject || "(미지정)"} · 수준: ${req.level} · 목표 글자수: ${req.targetLength} (${req.lengthMode === "withSpaces" ? "공백 포함" : "공백 제외"})`);
  lines.push("");
  lines.push("[누가기록]");
  if (!req.records.length) lines.push("(없음)");
  for (const r of req.records) lines.push(`- id=${r.id} | ${r.date} | ${r.category} | ${r.lesson || "-"} | ${r.text || "(내용 없음)"}`);
  lines.push("");
  lines.push("[수행평가]");
  if (!req.performance.length) lines.push("(없음)");
  for (const p of req.performance) lines.push(`- id=${p.id} | ${p.title} | ${p.excerpt}`);
  if (req.draft) { lines.push(""); lines.push("[현재 초안]"); lines.push(req.draft); }
  if (req.history?.length) { lines.push(""); lines.push("[대화 내역]"); for (const h of req.history) lines.push(`${h.role === "user" ? "교사" : "도우미"}: ${h.text}`); }
  lines.push("");
  lines.push(`[요청] ${req.instruction || "위 기록을 근거로 세특 초안을 작성해줘."}`);
  return lines.join("\n");
}

/* ---------------- 로컬 규칙 기반 생성기 (AI 없이 동작) ---------------- */

/** 총평 문장 풀: 수준 × 주요 카테고리 × 변형. 같은 반 안에서 문장이 겹치지 않도록 기록 id 해시로 고른다. */
const OPEN: Record<Level, Record<string, string[]>> = {
  A: {
    질문: ["개념의 예외와 한계를 묻는 질문이 잦아 탐구를 스스로 확장하는 태도가 두드러짐.", "수업 내용에서 출발해 새로운 질문을 만들어 내는 지적 호기심이 돋보임.", "질문을 통해 개념 사이의 연결을 스스로 찾아가는 주도적 학습 태도를 보임."],
    발표: ["자신의 풀이와 근거를 논리적으로 발표하며 급우들의 이해를 이끄는 역량이 두드러짐.", "학습 내용을 구조화하여 설명하는 발표력이 뛰어나고 질의에도 근거를 들어 답함.", "발표에서 개념의 원리를 자신의 언어로 재구성하는 능력이 돋보임."],
    협동: ["모둠 활동에서 역할을 조율하고 결과를 종합하는 리더십이 두드러짐.", "협업 과정에서 동료의 의견을 반영하며 탐구의 방향을 이끄는 태도를 보임.", "모둠의 사고를 확장시키는 질문과 정리로 협력 학습을 주도함."],
    기타: ["수업 전반에서 스스로 탐구 주제를 찾아 확장하는 주도적 태도가 두드러짐.", "배운 내용을 넘어 관련 자료를 찾아 정리하는 심화 학습 습관이 돋보임.", "학습 과정을 스스로 점검하고 보완하는 자기주도적 태도를 보임."],
  },
  B: {
    질문: ["이해가 어려운 부분을 정확히 짚어 질문하며 개념을 다지는 태도를 보임.", "질문을 통해 개념을 확인하고 적용하려는 성실한 학습 태도를 보임.", "수업 중 궁금한 점을 놓치지 않고 질문하며 이해를 넓혀 감."],
    발표: ["학습한 개념을 정리하여 발표하며 적용 사례를 설명하는 능력을 보임.", "발표 과정에서 개념을 정확히 적용하여 설명하는 태도를 보임.", "자료를 정리해 차분히 발표하며 학습 내용을 공유함."],
    협동: ["모둠 활동에서 맡은 역할을 성실히 수행하며 협력하는 태도를 보임.", "협업 과정에서 자료 정리와 기록을 맡아 모둠에 기여함.", "동료와 의견을 나누며 과제를 함께 해결하는 태도를 보임."],
    기타: ["수업에 성실히 참여하며 배운 개념을 상황에 적용하려는 태도를 보임.", "학습 내용을 꾸준히 정리하며 개념을 적용하려고 노력함.", "수업 활동에 꾸준히 참여하며 개념 이해를 넓혀 감."],
  },
  C: {
    질문: ["수업 중 궁금한 점을 질문하며 기본 개념을 익히려고 노력함.", "질문을 통해 이해가 부족한 부분을 채워 가는 모습을 보임.", "기본 개념에 대해 질문하며 수업에 참여하려는 태도를 보임."],
    발표: ["학습 내용을 정리하여 발표하며 수업에 참여함.", "발표 활동에 참여하여 자신의 생각을 표현하려고 노력함.", "간단한 내용부터 발표하며 자신감을 키워 가는 모습을 보임."],
    협동: ["모둠 활동에 참여하며 맡은 역할을 수행하려고 노력함.", "동료와 함께 활동하며 협력하는 태도를 익혀 감.", "모둠 활동에서 기록과 정리를 도우며 참여함."],
    기타: ["수업에 꾸준히 참여하며 기본 개념을 익히려고 노력함.", "수업 활동에 참여하며 학습 습관을 갖추어 가는 모습을 보임.", "기본 개념을 반복해 익히며 성실히 참여함."],
  },
};
const CLOSE: Record<Level, Record<string, string[]>> = {
  A: {
    질문: ["학습 내용을 비판적으로 성찰하고 새로운 문제로 확장하는 역량을 드러냄.", "질문을 탐구로 발전시키는 과정에서 과학적 사고력이 크게 성장함."],
    발표: ["근거를 바탕으로 설명하고 설득하는 의사소통 역량이 뛰어남.", "발표와 토의를 통해 개념을 재구성하는 과정에서 사고의 깊이가 더해짐."],
    협동: ["협업을 이끌며 공동의 결론을 도출하는 역량을 드러냄.", "동료와의 상호작용 속에서 탐구를 확장하는 리더십이 성장함."],
    기타: ["스스로 문제를 발견하고 해결 방향을 설계하는 탐구 역량이 돋보임.", "학습을 주도적으로 확장하는 태도가 학기 내내 일관되게 나타남."],
  },
  B: {
    질문: ["개념을 정확히 이해하고 근거를 들어 설명하는 능력이 향상됨.", "질문과 확인을 반복하며 개념 이해의 정확성이 높아짐."],
    발표: ["학습 내용을 적용하여 설명하는 능력이 향상됨.", "발표를 거듭하며 개념을 구조화하는 능력이 성장함."],
    협동: ["협력 활동을 통해 개념을 적용하고 정리하는 능력이 향상됨.", "모둠 활동에서 책임감 있게 역할을 수행하는 태도가 성장함."],
    기타: ["배운 개념을 상황에 적용하여 설명하는 능력이 향상됨.", "꾸준한 참여를 바탕으로 개념 이해와 적용 능력이 성장함."],
  },
  C: {
    질문: ["질문을 통해 이해를 넓혀 가는 성장 가능성을 보임.", "기본 개념에 대한 이해가 점차 나아지는 모습을 보임."],
    발표: ["발표 활동을 통해 표현력이 점차 향상되는 모습을 보임.", "활동에 참여하며 자신감이 성장하는 모습을 보임."],
    협동: ["모둠 활동 참여를 통해 협력하는 태도가 성장함.", "동료와 함께하는 활동에서 참여도가 점차 높아짐."],
    기타: ["활동에 참여하며 개념 이해가 점차 나아지는 성장 가능성을 보임.", "꾸준한 참여를 통해 학습 태도가 성장하는 모습을 보임."],
  },
};

function hashIds(ids: string[]): number { let h = 2166136261; for (const ch of ids.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function dominantCategories(records: AnonRecord[]): [string, string] {
  const cnt = new Map<string, number>();
  for (const r of records) cnt.set(r.category, (cnt.get(r.category) || 0) + 1);
  const order = ["질문", "발표", "협동", "기타"].sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0));
  const norm = (c: string) => (["질문", "발표", "협동"].includes(c) ? c : "기타");
  return [norm(order[0] || "기타"), norm(order[1] || order[0] || "기타")];
}
function pickSummary(pool: Record<Level, Record<string, string[]>>, level: Level, cat: string, seed: number): string {
  const arr = pool[level][cat] || pool[level]["기타"];
  return arr[seed % arr.length];
}

/** 교사 메모가 흔히 끝나는 동사성 명사(하다-동사 어근). 이 경우 "~함"만 붙인다. */
const VERB_NOUNS = ["발표", "질문", "설명", "정리", "재정리", "담당", "조율", "주도", "수행", "참여", "공유", "비교", "계산", "확인", "안내", "해결", "제안", "분석", "탐구", "작성", "제작", "기록", "관찰", "측정", "토의", "토론", "연결", "적용", "활용", "완성", "제출", "조사", "검증", "도출", "추론", "예측", "정의", "분류", "구분", "요약", "발견", "시도", "노력", "보완", "수정", "점검", "표현", "구성", "설계", "실험", "협력", "발언", "반박", "정독", "정리함", "제시"];
function endsWithVerbNoun(core: string): boolean {
  const last = core.split(/\s+/).pop() || "";
  return VERB_NOUNS.some((v) => last.endsWith(v));
}

function bodySentence(r: AnonRecord, level: Level, withLesson: boolean): string {
  const core = r.text.replace(/[.\s]+$/, "");
  const prefix = withLesson && r.lesson ? `${r.lesson} 학습에서 ` : "";
  if (!core) {
    const map: Record<string, string> = { 질문: "적극적으로 질문함", 발표: "학습 내용을 발표함", 협동: "모둠 활동에 참여함", 기타: "수업 활동에 참여함" };
    return prefix + (map[r.category] || "수업 활동에 참여함") + ".";
  }
  if (isNominalEnding(core)) return prefix + core + ".";
  if (endsWithVerbNoun(core)) {
    // "…과정을 단계별로 발표" → "…과정을 단계별로 발표함"
    const tail = level === "A" && r.category === "질문" ? "하며 개념을 확장함" : level === "A" && r.category === "발표" ? "하여 급우들의 이해를 도움" : "함";
    return prefix + core + tail + ".";
  }
  const t = (s: string) => prefix + s + ".";
  switch (r.category) {
    case "질문":
      return t(level === "A" ? `${core}에 대해 깊이 있게 질문하며 개념을 확장함` : level === "B" ? `${core}에 대해 질문하며 개념을 정확히 이해하고자 함` : `${core}에 대해 질문함`);
    case "발표":
      return t(level === "A" ? `${josa(core, "을/를")} 근거를 들어 논리적으로 발표함` : level === "B" ? `${josa(core, "을/를")} 정리하여 발표함` : `${josa(core, "을/를")} 발표함`);
    case "협동":
      return t(level === "A" ? `${core} 활동에서 모둠을 이끌며 의견을 조율함` : level === "B" ? `${core} 활동에서 맡은 역할을 성실히 수행함` : `${core} 활동에 참여함`);
    default:
      return t(level === "A" ? `${josa(core, "을/를")} 주도적으로 수행함` : level === "B" ? `${josa(core, "을/를")} 성실히 수행함` : `${josa(core, "을/를")} 수행함`);
  }
}

function perfSentence(p: AnonPerf, level: Level): string {
  const ex = p.excerpt.replace(/[.\s]+$/, "");
  const base = ex ? `수행평가 '${p.title}'에서 ${josa(ex, "을/를")} 다루며` : `수행평가 '${p.title}'에서`;
  return base + (level === "A" ? " 자료를 비판적으로 분석하고 결론을 도출함." : level === "B" ? " 개념을 적용하여 결과를 정리함." : " 과제를 수행하고 결과를 제출함.");
}

function lengthOf(text: string, mode: "withSpaces" | "withoutSpaces"): number {
  const c = countChars(text); return mode === "withSpaces" ? c.withSpaces : c.withoutSpaces;
}

/** 규칙 기반 초안. 문장별 근거 id 매핑, 목표 글자수(N-20~N-1) 맞춤. */
export function generateLocalDraft(req: DraftRequest): DraftResponse {
  const allIds = req.records.map((r) => r.id);
  const instr = (req.instruction || "").trim();
  // 간단한 대화형 수정: "짧게/줄여" → 문장 제거, "협동 줄여" 등 카테고리 강조/축소
  const emphasize = new Set<string>(); const reduce = new Set<string>();
  for (const cat of ["질문", "발표", "협동", "기타"]) {
    if (new RegExp(`${cat}[^.]*(강조|늘|더|부각)`).test(instr)) emphasize.add(cat);
    if (new RegExp(`${cat}[^.]*(줄|빼|축소|삭제|제외)`).test(instr)) reduce.add(cat);
  }
  const shorter = /(짧게|줄여|간결)/.test(instr) && emphasize.size === 0 && reduce.size === 0;

  type S = DraftSentence & { prio: number };
  const sents: S[] = [];
  const seed = hashIds(allIds);
  const [cat1, cat2] = dominantCategories(req.records);
  // 총평에 그 학생의 실제 단원 제목을 엮어 같은 반 안에서 문장이 겹치지 않게 한다.
  const titlesOf = (cat: string) => { const ts = req.records.filter((x) => x.category === cat && x.lesson).map((x) => x.lesson.match(/\d+차시\s+(.+)$/)?.[1]?.trim() || "").filter(Boolean); return [...new Set(ts.length ? ts : req.records.map((x) => x.lesson.match(/\d+차시\s+(.+)$/)?.[1]?.trim() || "").filter(Boolean))]; };
  const pickTitle = (cat: string, salt: number) => { const ts = titlesOf(cat); return ts.length ? ts[(seed >>> salt) % ts.length] : ""; };
  const t1 = pickTitle(cat1, 5); const t2 = pickTitle(cat2, 11);
  if (allIds.length >= 2) sents.push({ text: (t1 ? `${t1} 등의 학습에서 ` : "") + pickSummary(OPEN, req.level, cat1, seed), evidence: allIds, prio: 3 });
  let lastLesson = "";
  const ordered = [...req.records].sort((a, b) => a.date.localeCompare(b.date));
  ordered.forEach((r, i) => {
    let prio = 5 + i * 0.01;
    if (emphasize.has(r.category)) prio += 3;
    if (reduce.has(r.category)) prio -= 4;
    const withLesson = r.lesson !== lastLesson; lastLesson = r.lesson;
    sents.push({ text: bodySentence(r, req.level, withLesson), evidence: [r.id], prio });
  });
  req.performance.forEach((p) => sents.push({ text: perfSentence(p, req.level), evidence: [p.id], prio: 6 }));
  if (allIds.length >= 3) sents.push({ text: (t2 && t2 !== t1 ? `특히 ${t2} 학습을 거치며 ` : "") + pickSummary(CLOSE, req.level, cat2, seed >>> 3), evidence: allIds, prio: 2 });

  const max = req.targetLength - 1;
  const join = (xs: S[]) => xs.map((s) => s.text).join(" ");
  let kept = [...sents];
  if (shorter) kept = kept.filter((s) => s.prio >= 5).slice(0, Math.max(2, Math.ceil(kept.length / 2)));
  // 목표 초과 시 우선순위 낮은 문장부터 제거 (총평 → 축소 요청 카테고리 → 오래된 기록 순)
  while (kept.length > 1 && lengthOf(join(kept), req.lengthMode) > max) {
    const minPrio = Math.min(...kept.map((s) => s.prio));
    const idx = kept.findIndex((s) => s.prio === minPrio);
    kept.splice(idx, 1);
  }
  // 그래도 초과하면 마지막 문장을 잘라내되 명사형으로 마무리
  let text = join(kept);
  if (lengthOf(text, req.lengthMode) > max && kept.length === 1) {
    text = Array.from(text).slice(0, max - 4).join("").replace(/[,\s]+$/, "") + " 등을 수행함.";
    kept[0] = { ...kept[0], text };
  }
  return { text, sentences: kept.map(({ text, evidence }) => ({ text, evidence })) };
}

export const DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence: { type: "array", items: { type: "string" } } },
        required: ["text", "evidence"], additionalProperties: false,
      },
    },
  },
  required: ["text", "sentences"], additionalProperties: false,
} as const;

/** 모델 응답 텍스트에서 JSON 추출·검증 */
export function parseDraftResponse(raw: string): DraftResponse {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("응답에 JSON이 없음");
  const obj = JSON.parse(m[0]) as Partial<DraftResponse>;
  if (typeof obj.text !== "string") throw new Error("text 누락");
  const sentences = Array.isArray(obj.sentences) ? obj.sentences.filter((s) => s && typeof s.text === "string").map((s) => ({ text: s.text, evidence: Array.isArray(s.evidence) ? s.evidence.map(String) : [] })) : [];
  return { text: obj.text.trim(), sentences };
}
