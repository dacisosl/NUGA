import { create } from "zustand";
import { makeSampleDoc, nowIso, type NugaDoc, type NugaRecord, type Settings } from "@nuga/core";
import { arrivalModeOf, useStore, writeAreaDoc } from "../store";
import { getPersist } from "./persist";
import { useTranscripts } from "./transcripts";
import { addDemoTranscript } from "./demo";

/**
 * 웨일 모드: [웨일 연계]를 누르면 '웨일 스페이스와 함께 쓰는 하루'를 데모 데이터로 둘러본다.
 * 웨일 스페이스와 실제로 연동하지 않는다(연동 승인 전). 데모는 따로 만든 영역(WHALE_AREA)에서 돌아가므로
 * 선생님의 영역·명단·기록은 건드리지 않고, 끝내면 원래 영역으로 돌아가 데모 영역을 지운다.
 */
export const WHALE_AREA = "whale-demo";
const SAVED_KEY = "nuga.whale";

/** 들어올 때 기억해 둔 것: 돌아갈 영역 · 데모 스크립트 · 바꾼 공통 설정(도착 방식) · 들어온 곳 */
interface Saved { prevArea: string; transcriptId: string | null; arrivalMode: Settings["arrivalMode"] | null; from: "landing" | "app" | null }
function readSaved(): Saved | null { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); } catch { return null; } }
function writeSaved(v: Saved | null) { try { if (v) localStorage.setItem(SAVED_KEY, JSON.stringify(v)); else localStorage.removeItem(SAVED_KEY); } catch { /* 저장 불가: 끝낼 때 첫 영역으로 */ } }
export function whaleFrom(): Saved["from"] { return readSaved()?.from ?? null; }

export type Phone = "idle" | "sent" | "accepted";
interface WhaleState {
  on: boolean; busy: boolean; step: number; min: boolean;
  /** 장면 2: 수업관리 칸에서 기록한 번호 → 기록 id */
  picked: Record<number, string>;
  /** 장면 3: 웨일 클래스 응답 → 보낸 기록 id 또는 넘김 */
  quiz: Record<number, string>;
  /** 장면 4: 피드백 고리. card = 보낸 순간의 카드 (그 뒤 기록이 늘어도 학생이 받은 카드는 그대로) */
  phone: Phone; acceptedAt: string | null; detailOpen: boolean; card: FeedbackCard | null;
}
const fresh = { step: 0, min: false, picked: {}, quiz: {}, phone: "idle" as Phone, acceptedAt: null, detailOpen: false, card: null };
/** 장면 4·5의 카드: 보냈으면 보낸 카드, 아니면 지금 기록으로 */
export function currentCard(doc: NugaDoc, cls: string): FeedbackCard | null { return useWhale.getState().card || feedbackCard(doc, cls); }
export const useWhale = create<WhaleState>(() => ({ on: false, busy: false, ...fresh }));

/** 웨일 모드 켜기: 데모 영역(화학Ⅰ 2개 반 합성 기록 + 합성 모의 수업 추천)을 새로 만들어 연다 */
export async function enterWhale(from: Saved["from"] = "app"): Promise<void> {
  const st = useStore.getState();
  if (useWhale.getState().busy) return;
  if (st.areaId === WHALE_AREA) { useWhale.setState({ on: true, min: false }); return; }
  useWhale.setState({ busy: true });
  try {
    await st.flush();
    const saved: Saved = { prevArea: st.areaId, transcriptId: null, arrivalMode: null, from };
    const doc: NugaDoc = makeSampleDoc();
    doc.settings.school.subject = "화학Ⅰ · 웨일 데모";
    await writeAreaDoc(WHALE_AREA, doc);
    const p = await getPersist();
    const areas = [...st.areas.filter((a) => a.id !== WHALE_AREA), { id: WHALE_AREA, name: doc.settings.school.subject, createdAt: nowIso() }];
    await p.saveAux("areas", areas);
    useStore.setState({ areas });
    await useStore.getState().switchArea(WHALE_AREA);
    // 데모는 '수업 중 번호만 → 쉬는 시간 기록' 흐름이라 보완 대기를 켠다. 원래 값은 끝낼 때 되돌린다
    const s = useStore.getState();
    if (arrivalModeOf(s.doc.settings) === "direct") { saved.arrivalMode = "direct"; s.update((d) => { d.settings.arrivalMode = "popup"; d.settings.supplementEnabled = true; }); }
    writeSaved(saved);
    saved.transcriptId = (await addDemoTranscript()).transcriptId;
    writeSaved(saved);
    useStore.setState({ page: "main", selected: null, inbox: null });
    useWhale.setState({ on: true, ...fresh });
  } finally { useWhale.setState({ busy: false }); }
}

/** 웨일 모드 끄기: 원래 영역으로 돌아가고 데모 영역 · 데모 스크립트를 지운다 */
export async function exitWhale(): Promise<void> {
  if (useWhale.getState().busy) return;
  useWhale.setState({ busy: true, on: false, ...fresh });
  try {
    const saved = readSaved();
    const st = useStore.getState();
    await st.flush();
    if (saved?.transcriptId) await useTranscripts.getState().remove(saved.transcriptId).catch(() => {});
    const others = useStore.getState().areas.filter((a) => a.id !== WHALE_AREA);
    const back = others.find((a) => a.id === saved?.prevArea)?.id || others[0]?.id;
    if (back && useStore.getState().areaId === WHALE_AREA) await useStore.getState().switchArea(back);
    if (useStore.getState().areas.some((a) => a.id === WHALE_AREA)) await useStore.getState().deleteArea(WHALE_AREA);
    if (saved?.arrivalMode) useStore.getState().update((d) => { d.settings.arrivalMode = saved.arrivalMode!; d.settings.supplementEnabled = saved.arrivalMode !== "direct"; });
    writeSaved(null);
    useStore.setState({ page: "main", selected: null, inbox: null });
  } finally { useWhale.setState({ busy: false }); }
}

/* ---------- 장면 4: 피드백 카드 (기록에서 바로) ---------- */

const hasNote = (r: NugaRecord) => !!(r.note || "").trim();
/** 학생용 문장: "~함" → "~한 점이 좋았어요." */
export function toStudentSentence(note: string): string {
  const t = note.trim().replace(/[.。\s]+$/, ""); if (!t) return "";
  const rules: [RegExp, string][] = [[/찾음$/, "찾아낸"], [/도움$/, "도운"], [/보임$/, "보여 준"], [/냄$/, "낸"], [/줌$/, "준"], [/씀$/, "쓴"], [/맡음$/, "맡은"], [/챙김$/, "챙긴"], [/고침$/, "고친"], [/옴$/, "온"], [/함$/, "한"], [/(질문|설명|발표|담당|조율|주도|정리|공유|수행)$/, "$1한"]];
  for (const [re, rep] of rules) if (re.test(t)) return `${t.replace(re, rep)} 점이 좋았어요.`;
  return `${t} 장면이 좋았어요.`;
}
/** 카테고리 자리(1~4)별 다음 도전 */
const NEXT = ["개념의 조건·예외를 묻는 질문을 해 보기", "근거를 들어 내 풀이를 발표해 보기", "모둠 토의에서 친구 의견을 이어 발전시키기", "실험·자료 결과를 다른 단원 개념과 연결하기"];
export interface FeedbackCard { cls: string; no: number; good: string; next: string; evidence: NugaRecord[] }
/** 반에서 내용 있는 기록이 가장 많은 학생: 카테고리가 다른 최근 2건 → 잘한 장면, 가장 적은 카테고리 → 다음 도전 */
export function feedbackCard(doc: NugaDoc, cls: string): FeedbackCard | null {
  const by = new Map<number, NugaRecord[]>();
  for (const r of doc.records) if (r.class === cls && r.status !== "skipped" && hasNote(r)) by.set(r.no, [...(by.get(r.no) || []), r]);
  const best = [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  if (!best) return null;
  const [no, recs] = best;
  const sorted = [...recs].sort((a, b) => b.time.localeCompare(a.time));
  const picked = [sorted[0]]; const other = sorted.find((r) => r.category !== sorted[0].category); if (other) picked.push(other);
  const cats = doc.settings.categories.map((c) => c.key);
  const counts = cats.map((k) => doc.records.filter((r) => r.class === cls && r.no === no && r.category === k).length);
  const least = counts.indexOf(Math.min(...counts));
  return { cls, no, good: picked.reverse().map((r) => toStudentSentence(r.note)).join(" "), next: NEXT[least] || NEXT[0], evidence: picked };
}
