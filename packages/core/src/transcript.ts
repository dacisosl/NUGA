import type { NugaRecord, Transcript, TranscriptPart, TranscriptSegment } from "./types";

/**
 * 수업 녹음 스크립트 처리 (v3 7.3~7.4).
 * - 화자는 "화자1, 화자2…" 라벨만 쓴다. 누구인지 추정하지 않고, 학생 번호와 연결해 저장하지 않는다.
 * - 음성 변환 프롬프트·스키마는 폰(Kotlin)과 같아야 한다 (docs/PROTOCOL.md §3.6).
 */

export const TRANSCRIBE_PROMPT = [
  "이 음성은 한국 학교의 수업 녹음이다. 받아쓰기와 화자 구분만 한다.",
  "- 말한 내용을 들리는 그대로 한국어로 받아 적는다. 요약하거나 고치지 않는다. 알아들을 수 없는 부분은 (불명확)으로 적는다.",
  "- 화자는 목소리로만 구분하여 '화자1', '화자2'처럼 번호를 붙인다. 이름·성별·나이·학생 여부 등 누구인지는 추정하지 않는다.",
  "- 발언 중 사람 이름이 나오면 들리는 대로 적되, 화자 라벨에 이름을 쓰지 않는다.",
  "- 한 화자의 말이 길면 문장 단위로 나누되, 한 구간은 30초를 넘지 않게 한다.",
  "- start·end 는 녹음 시작부터의 시각을 'MM:SS' (1시간 이상이면 'H:MM:SS')로 적는다.",
  "- 침묵, 잡음, 음악 구간은 적지 않는다.",
].join("\n");

export const TRANSCRIBE_JSON_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { start: { type: "string" }, end: { type: "string" }, speaker: { type: "string" }, text: { type: "string" } },
        required: ["start", "end", "speaker", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
} as const;

/** "MM:SS", "H:MM:SS", "75.5", 숫자 → 초 */
export function parseClock(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 화자 라벨 정리: "Speaker 2", "S2", "화자 2" → "화자2" */
export function normalizeSpeaker(s: string): string {
  const m = String(s || "").match(/(\d+)/);
  return m ? `화자${Number(m[1])}` : (String(s || "").trim() || "화자?");
}

/** 발화량(글자 수)이 가장 많은 화자 = 교사 추정 (역할 구분일 뿐 개인 식별이 아님) */
export function guessTeacherSpeaker(segments: TranscriptSegment[]): string | null {
  const total = new Map<string, number>();
  for (const s of segments) total.set(s.speaker, (total.get(s.speaker) || 0) + Array.from(s.text).length);
  let best: string | null = null; let max = 0;
  for (const [k, v] of total) if (v > max) { best = k; max = v; }
  return best;
}

export interface TranscriptMeta { id: string; class: string; period: number; startedAt: string; endedAt: string; provider: string; model: string; createdAt?: string }

/** 음성 API 의 JSON 응답 → 스크립트. 시각이 거꾸로이거나 빈 구간은 버린다. */
export function parseTranscription(raw: string, meta: TranscriptMeta, offsetSec = 0): Transcript {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("스크립트 응답을 읽을 수 없음"); }
  const list = Array.isArray(data) ? data : (data as { segments?: unknown[] })?.segments;
  if (!Array.isArray(list)) throw new Error("스크립트 응답에 segments 가 없음");
  const segs: TranscriptSegment[] = [];
  for (const it of list as Record<string, unknown>[]) {
    const text = String(it.text ?? "").trim();
    const t0 = parseClock(it.start ?? it.t0); const t1 = parseClock(it.end ?? it.t1);
    if (!text || t0 === null) continue;
    segs.push({ id: "", t0: t0 + offsetSec, t1: Math.max(t0, t1 ?? t0) + offsetSec, speaker: normalizeSpeaker(String(it.speaker ?? "")), text });
  }
  segs.sort((a, b) => a.t0 - b.t0);
  segs.forEach((s, i) => { s.id = `s${i + 1}`; });
  return {
    id: meta.id, class: meta.class, period: meta.period, startedAt: meta.startedAt, endedAt: meta.endedAt, segments: segs,
    teacherSpeaker: { auto: guessTeacherSpeaker(segs), confirmed: null },
    engine: { provider: meta.provider, model: meta.model }, createdAt: meta.createdAt || new Date().toISOString(),
  };
}

/** 구간의 절대 시각 */
export function segmentDate(tr: Pick<Transcript, "startedAt">, seg: Pick<TranscriptSegment, "t0">): Date {
  return new Date(new Date(tr.startedAt).getTime() + seg.t0 * 1000);
}

export function teacherOf(tr: Transcript): string | null { return tr.teacherSpeaker.confirmed ?? tr.teacherSpeaker.auto; }

/* ---------------- 나눠 보내기 ---------------- */

const enc = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/** JSON 이 maxBytes 를 넘지 않게 segments 를 나눈다 (릴레이 본문 256KB, 암호화·base64 여유) */
export function splitTranscript(tr: Transcript, maxBytes = 120_000): TranscriptPart[] {
  if (enc(tr) <= maxBytes) return [{ transcript: tr, part: 1, total: 1 }];
  const chunks: TranscriptSegment[][] = [];
  let cur: TranscriptSegment[] = []; let size = enc({ ...tr, segments: [] });
  const base = size;
  for (const s of tr.segments) {
    const sz = enc(s) + 1;
    if (cur.length && size + sz > maxBytes) { chunks.push(cur); cur = []; size = base; }
    cur.push(s); size += sz;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((c, i) => ({ transcript: { ...tr, segments: c }, part: i + 1, total: chunks.length }));
}

/** 받은 조각을 모은다. 다 모이면 합친 스크립트, 아니면 null */
export function mergeTranscriptParts(parts: TranscriptPart[]): Transcript | null {
  if (!parts.length) return null;
  const total = parts[0].total;
  const byPart = new Map(parts.map((p) => [p.part, p]));
  if (byPart.size < total) return null;
  const ordered = [...byPart.values()].sort((a, b) => a.part - b.part);
  const segments = ordered.flatMap((p) => p.transcript.segments).sort((a, b) => a.t0 - b.t0);
  const first = ordered[0].transcript;
  return { ...first, segments, teacherSpeaker: { auto: guessTeacherSpeaker(segments), confirmed: first.teacherSpeaker.confirmed } };
}

/* ---------------- 이름 가리기 (외부 LLM 으로 보내기 전) ---------------- */

/** 명단 이름(2자 이상)과 성을 뺀 이름을 ○○○로 가린다 */
export function scrubTranscriptNames(tr: Transcript, names: string[]): Transcript {
  const list = [...new Set(names.filter((n) => n && n.length >= 2).flatMap((n) => (n.length >= 3 ? [n, n.slice(1)] : [n])))].sort((a, b) => b.length - a.length);
  if (!list.length) return tr;
  const re = new RegExp(list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return { ...tr, segments: tr.segments.map((s) => ({ ...s, text: s.text.replace(re, "○○○") })) };
}

/* ---------------- 1차 기록과 시간 정렬 (v3 7.4) ---------------- */

export interface AlignCandidate { transcriptId: string; segment: TranscriptSegment; at: Date; score: number; reason: string }

const QUESTION = /(\?|까요|나요|가요|을까|를까|는지|은지|왜|어떻게|무엇|뭐가|뭘|언제|어디)/;

/**
 * 1차 기록 시각 앞 60초~뒤 15초(기본) 발언 중 보완 문구 후보를 고른다.
 * 교사 추정 화자는 빼고, 카테고리가 "질문"이면 의문형을, 길고 내용 있는 발언을 우선한다.
 */
export function alignCandidates(rec: Pick<NugaRecord, "class" | "time">, transcripts: Transcript[], categoryLabel: string, window: [number, number] = [-60, 15], limit = 3): AlignCandidate[] {
  const t = new Date(rec.time).getTime();
  if (Number.isNaN(t)) return [];
  const out: AlignCandidate[] = [];
  for (const tr of transcripts) {
    if (tr.class !== rec.class) continue;
    const start = new Date(tr.startedAt).getTime(); const end = new Date(tr.endedAt).getTime();
    if (t < start + window[0] * 1000 || t > end + 60_000) continue;
    const teacher = teacherOf(tr);
    for (const seg of tr.segments) {
      if (seg.speaker === teacher) continue;
      const at = segmentDate(tr, seg).getTime();
      const endAt = start + seg.t1 * 1000;
      const d = (at - t) / 1000;
      if (d > window[1] || (endAt - t) / 1000 < window[0]) continue;
      const len = Array.from(seg.text).length;
      if (len < 6) continue;
      let score = 1 - Math.min(1, Math.abs(Math.min(0, d)) / Math.abs(window[0] || 60)) * 0.5;
      const reasons: string[] = [];
      if (/질문/.test(categoryLabel) && QUESTION.test(seg.text)) { score += 0.5; reasons.push("의문형"); }
      if (/발표/.test(categoryLabel) && len >= 25) { score += 0.3; reasons.push("긴 발언"); }
      if (len >= 15) score += Math.min(0.3, len / 200);
      reasons.push(`기록 ${d <= 0 ? `${Math.round(-d)}초 전` : `${Math.round(d)}초 뒤`}`);
      out.push({ transcriptId: tr.id, segment: seg, at: new Date(at), score, reason: reasons.join(" · ") });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
