import type { Category, CategoryDef, Transcript, TranscriptSegment } from "./types";
import { teacherOf, formatClock } from "./transcript";

/**
 * 추천 카드 (v3 7.3, 11.7): 스크립트에서 "기록할 만한 발언"을 골라 교사에게 보여 준다.
 * 1차 = 규칙(이 파일), 2차 = LLM 판별(SUGGEST_* 프롬프트). 학생 지정은 교사가 한다.
 */
export type SuggestionStatus = "new" | "recorded" | "dismissed" | "later";

export interface Suggestion {
  id: string;
  transcriptId: string;
  segmentIds: string[];
  reason: string;
  /** 추천 기준 (개념 연결·깊이 있는 질문·근거 제시·오개념 수정·자기 성찰·다른 의견 확장·협력·배려 발언) */
  criteria: string;
  standards: string[];
  category: Category;
  score: number;
  source: "rule" | "llm";
  status: SuggestionStatus;
  recordId: string | null;
  createdAt: string;
}

export const SUGGEST_CRITERIA = ["개념 연결", "깊이 있는 질문", "근거 제시", "오개념 수정·자기 성찰", "다른 의견 확장", "협력·배려 발언"] as const;

interface Rule { criteria: (typeof SUGGEST_CRITERIA)[number]; re: RegExp; weight: number; reason: string }

const RULES: Rule[] = [
  { criteria: "깊이 있는 질문", re: /(왜|어떻게|만약|그러면|그럼).{0,40}(\?|까요|나요|가요|ㄴ가요|는지|을까|를까)|예외|조건이|항상 같은/, weight: 0.5, reason: "원리·조건·예외를 묻는 질문" },
  { criteria: "근거 제시", re: /(니까|때문에|근거|결과를 보면|비교|보니까|봤을 때|실험에서|그래프에서|데이터)/, weight: 0.45, reason: "자료·결과를 근거로 설명" },
  { criteria: "개념 연결", re: /(지난번|지난 시간|이전에|전에 배운|비슷하|연결|생활|일상|예를 들면|관련 있)/, weight: 0.45, reason: "이전 개념·생활 현상과 연결" },
  { criteria: "오개념 수정·자기 성찰", re: /(잘못 생각|다시 보니|틀렸|고쳐|아니라|헷갈렸|착각|생각이 바뀌)/, weight: 0.5, reason: "자기 생각을 스스로 고침" },
  { criteria: "다른 의견 확장", re: /(그럼 .*(거네|거지|겠네)|거기에 더해|덧붙이|친구 말|말한 것처럼|에 이어서|그것도)/, weight: 0.35, reason: "친구 발언을 이어받아 발전" },
  { criteria: "협력·배려 발언", re: /(같이 보자|같이 하자|도와|알려 줄게|설명해 줄게|따라가 봐|역할|나눠서|우리 모둠|괜찮아)/, weight: 0.4, reason: "모둠에서 설명을 돕거나 역할 조정" },
];

const len = (s: string) => Array.from(s).length;

/** 카테고리 고르기: 기준 → 카테고리 라벨 이름으로 찾고, 없으면 마지막 카테고리 */
export function categoryFor(criteria: string, text: string, categories: CategoryDef[]): Category {
  const find = (re: RegExp) => categories.find((c) => re.test(c.label))?.key;
  const last = (categories[categories.length - 1]?.key ?? 4) as Category;
  if (criteria === "깊이 있는 질문") return find(/질문/) ?? 1;
  if (criteria === "협력·배려 발언") return find(/협동|협력|관계/) ?? 3;
  if (criteria === "개념 연결" || criteria === "근거 제시" || criteria === "오개념 수정·자기 성찰") return find(/탐구/) ?? (len(text) >= 30 ? find(/발표/) ?? last : last);
  return find(/발표/) ?? last;
}

/** 규칙 추천의 최소 점수 */
export const MIN_SCORE = 0.58;

export interface RuleOptions { categories: CategoryDef[]; topicKeywords?: string[]; max?: number; now?: string }

/** 규칙 1차 선별: 교사 발언 제외, 짧은 발언 제외, 기준 표지어와 오늘 주제어로 점수. 수업당 최대 max 개 */
export function ruleSuggestions(tr: Transcript, opts: RuleOptions): Suggestion[] {
  const teacher = teacherOf(tr);
  const kws = (opts.topicKeywords || []).map((k) => k.trim()).filter((k) => len(k) >= 2);
  const out: Suggestion[] = [];
  for (const seg of tr.segments) {
    if (seg.speaker === teacher) continue;
    const L = len(seg.text);
    if (L < 12) continue;
    let best: Rule | null = null; let score = 0;
    for (const r of RULES) if (r.re.test(seg.text)) { score += r.weight; if (!best || r.weight > best.weight) best = r; }
    if (!best) continue;
    const topic = kws.filter((k) => seg.text.includes(k)).length;
    score += Math.min(0.3, topic * 0.15) + Math.min(0.25, L / 240);
    if (score < MIN_SCORE) continue; // 짧은 감탄·단순 관찰은 빼기
    out.push({
      id: `${tr.id}:${seg.id}`, transcriptId: tr.id, segmentIds: [seg.id], reason: best.reason + (topic ? " · 오늘 주제어 포함" : ""),
      criteria: best.criteria, standards: [], category: categoryFor(best.criteria, seg.text, opts.categories),
      score: Math.min(1, Math.round(score * 100) / 100), source: "rule", status: "new", recordId: null, createdAt: opts.now || new Date().toISOString(),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.max ?? 10).sort((a, b) => segIndex(tr, a) - segIndex(tr, b));
}

function segIndex(tr: Transcript, s: Suggestion): number { return tr.segments.findIndex((x) => x.id === s.segmentIds[0]); }

/** 추천 카드의 발언 원문과 앞뒤 문맥 한 줄씩 */
export function suggestionContext(tr: Transcript, s: Suggestion): { before?: TranscriptSegment; main: TranscriptSegment[]; after?: TranscriptSegment } {
  const idx = s.segmentIds.map((id) => tr.segments.findIndex((x) => x.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return { main: [] };
  return { before: tr.segments[idx[0] - 1], main: idx.map((i) => tr.segments[i]), after: tr.segments[idx[idx.length - 1] + 1] };
}

/* ---------------- LLM 2차 판별 ---------------- */

export const SUGGEST_SYSTEM_PROMPT = [
  "너는 교사의 수업 관찰 기록을 돕는 보조자다. 수업 스크립트에서 학교생활기록부에 남길 만한 학생 발언을 고른다.",
  "- 기준: 개념 연결, 깊이 있는 질문, 근거 제시, 오개념 수정·자기 성찰, 다른 의견 확장, 협력·배려 발언.",
  "- 교사(표시된 화자)의 설명 발언은 고르지 않는다. 단순 대답·잡담·짧은 맞장구는 고르지 않는다.",
  "- 화자가 누구인지 추정하지 않는다. 이름이 나와도 ○○○로 가려져 있으며 그대로 둔다.",
  "- 오늘 수업 주제와 관련된 발언에 가중치를 둔다.",
  "- reason 은 교사가 기록할 때 참고할 수 있게, 학생이 한 행동을 한 줄(30자 안팎, 명사형 종결)로 적는다. 평가 표현을 쓰지 않는다.",
  "- segmentIds 는 스크립트의 id 를 그대로 쓴다. 연속된 한 학생의 발언이면 여러 개를 묶어도 된다.",
  "- 최대 개수를 넘기지 않는다. 고를 것이 없으면 빈 배열.",
].join("\n");

export const SUGGEST_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentIds: { type: "array", items: { type: "string" } },
          criteria: { type: "string", enum: [...SUGGEST_CRITERIA] },
          reason: { type: "string" },
          category: { type: "string" },
          score: { type: "number" },
        },
        required: ["segmentIds", "criteria", "reason", "category", "score"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** LLM 에 보내는 user 프롬프트. 반·번호·이름 없음 (이름은 미리 ○○○로 가린 스크립트를 넣는다) */
export function suggestUserPrompt(tr: Transcript, opts: { topic?: string; categories: CategoryDef[]; max: number }): string {
  const teacher = teacherOf(tr);
  const lines = [
    "[수업 정보]",
    `- 오늘 수업 주제: ${opts.topic || "(미등록)"}`,
    `- 교사로 추정한 화자: ${teacher || "(없음)"}`,
    `- 고를 수 있는 카테고리: ${opts.categories.map((c) => c.label).join(", ")}`,
    `- 최대 ${opts.max}개`,
    "",
    "[스크립트] (id | 시각 | 화자 | 발언)",
    ...tr.segments.map((s) => `${s.id} | ${formatClock(s.t0)} | ${s.speaker}${s.speaker === teacher ? "(교사)" : ""} | ${s.text}`),
  ];
  return lines.join("\n");
}

/** LLM 응답 → 추천 카드. 없는 id·교사 발언은 버린다. */
export function parseSuggestResponse(raw: string, tr: Transcript, categories: CategoryDef[], max: number, now?: string): Suggestion[] {
  let data: { items?: { segmentIds?: unknown; criteria?: unknown; reason?: unknown; category?: unknown; score?: unknown }[] };
  try { data = JSON.parse(raw); } catch { throw new Error("추천 응답을 읽을 수 없음"); }
  const ids = new Set(tr.segments.map((s) => s.id));
  const teacher = teacherOf(tr);
  const out: Suggestion[] = [];
  for (const it of data.items || []) {
    const segIds = (Array.isArray(it.segmentIds) ? it.segmentIds : []).map(String).filter((id) => ids.has(id) && tr.segments.find((s) => s.id === id)!.speaker !== teacher);
    if (!segIds.length) continue;
    const criteria = SUGGEST_CRITERIA.includes(String(it.criteria) as never) ? String(it.criteria) : "근거 제시";
    const label = String(it.category || "");
    const cat = (categories.find((c) => c.label === label)?.key ?? categoryFor(criteria, "", categories)) as Category;
    out.push({
      id: `${tr.id}:${segIds.join("+")}`, transcriptId: tr.id, segmentIds: segIds, reason: String(it.reason || "").slice(0, 80), criteria, standards: [],
      category: cat, score: Math.max(0, Math.min(1, Number(it.score) || 0.5)), source: "llm", status: "new", recordId: null, createdAt: now || new Date().toISOString(),
    });
  }
  return out.slice(0, max);
}

/** 새 추천과 기존 카드 합치기: 교사가 이미 처리한 카드(recorded·dismissed·later)는 그대로 둔다 */
export function mergeSuggestions(prev: Suggestion[], next: Suggestion[]): Suggestion[] {
  const kept = prev.filter((p) => p.status !== "new");
  const keptSegs = new Set(kept.flatMap((p) => p.segmentIds));
  return [...kept, ...next.filter((n) => !n.segmentIds.some((id) => keptSegs.has(id)))];
}

/** 오늘 진도 제목에서 주제어 뽑기 (2글자 이상 낱말) */
export function topicKeywords(title: string): string[] {
  return [...new Set(title.split(/[\s,·()\-–—/]+/).map((w) => w.replace(/[의과와을를이가은는에서도]$/, "")).filter((w) => Array.from(w).length >= 2))];
}
