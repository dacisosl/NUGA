import { create } from "zustand";
import { isSchoolRoster, makeSampleDoc, nowIso, studentsFromRows, type NugaDoc, type NugaRecord, type Settings } from "@nuga/core";
import { arrivalModeOf, classList, studentsOf, useStore, writeAreaDoc } from "../store";
import { getPersist } from "./persist";
import { closeSidePreview } from "./windows";
import { useTranscripts } from "./transcripts";
import { addDemoTranscript } from "./demo";

/**
 * 웨일 모드: [웨일 연계]를 누르면 누가가 웨일 스페이스 · 웨일 클래스 · 팀보드 · 웨일 브라우저와 어떻게 이어지는지 서비스별로 데모 데이터에서 둘러본다.
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

export type Feedback = "idle" | "pasted" | "watch";
interface WhaleState {
  on: boolean; busy: boolean; step: number; min: boolean;
  /** 탭 안 단계 (클래스: 들어옴 · 나감, 브라우저: 수업 중 · 학기 말) */
  sub: number;
  /** 스페이스: 명단 파일을 가져왔나 · 로그인 예시를 눌렀나 */
  roster: boolean; login: boolean;
  /** 클래스 들어옴: 반마다 응답을 보여 줄 번호(그 반을 처음 연 순간 기록이 가장 적은 학생) · '반|번호' → 보낸 기록 id 또는 넘김 */
  quizNos: Record<string, number[]>; quiz: Record<string, string>;
  /** 클래스 나감: 피드백 고리. card = 성적 노트에 붙여 넣은 순간의 카드 (그 뒤 기록이 늘어도 학생이 본 카드는 그대로) */
  fb: Feedback; watchAt: string | null; detailOpen: boolean; card: FeedbackCard | null;
  /** 팀보드: 작성자별로 보기 · '반|번호' → 보낸 기록 id */
  byAuthor: boolean; board: Record<string, string>;
}
const fresh = { step: 0, sub: 0, min: false, roster: false, login: false, quizNos: {}, quiz: {}, fb: "idle" as Feedback, watchAt: null, detailOpen: false, card: null, byAuthor: false, board: {} };
/** 데모 상태의 열쇠: 왼쪽에서 반을 바꿔도 다른 반 학생에게 붙지 않게 '반|번호' */
export const whaleKey = (cls: string, no: number) => `${cls}|${no}`;
/** 클래스 들어옴에서 이 반 학생 가운데 응답을 근거 후보로 보낸 번호 */
export function sentNos(cls: string): number[] {
  return Object.entries(useWhale.getState().quiz).filter(([k, v]) => v !== "no" && k.startsWith(`${cls}|`)).map(([k]) => Number(k.split("|")[1]));
}
/** 클래스 나감 · 브라우저 학기 말의 카드: 붙여 넣었으면 그 카드, 아니면 지금 기록으로 (응답을 보낸 학생이 먼저) */
export function currentCard(doc: NugaDoc, cls: string): FeedbackCard | null { return useWhale.getState().card || feedbackCard(doc, cls, sentNos(cls)); }
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
  closeSidePreview();
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

/* ---------- 데모 반 ---------- */

/** 둘러보기의 기본 반: 기록이 있는 첫 반 (스페이스 탭에서 가져온 새 반은 기록이 없다) */
export function mainClass(doc: NugaDoc): string {
  const all = classList(doc);
  return all.find((c) => doc.records.some((r) => r.class === c)) || all[0] || "";
}
/** 기록(건너뜀 제외)이 가장 적은 학생 n명의 번호 */
export function fewestNos(doc: NugaDoc, cls: string, n: number): number[] {
  const count = (no: number) => doc.records.filter((r) => r.class === cls && r.no === no && r.status !== "skipped").length;
  return studentsOf(doc, cls).map((s) => ({ no: s.no, n: count(s.no) })).sort((a, b) => a.n - b.n || a.no - b.no).slice(0, n).map((x) => x.no).sort((a, b) => a - b);
}

/* ---------- 웨일 스페이스: 관리자 '사용자 다운로드' 명단 파일 (예시 양식 · 합성) ---------- */

export const ROSTER_CLASS = "2-7";
const SCHOOL = "해밀고등학교";
const FAMILY = "김이박최정강조윤장임한오서신권황안송류홍전고문양손".split("");
const GIVEN = ["서준", "하윤", "도현", "지안", "예준", "수빈", "시원", "나연", "준호", "채윤", "민서", "유찬", "다온", "하람", "지성", "서우", "은찬", "예나", "태오", "소윤", "건호", "라희", "우빈", "가윤", "현서"];
/** 학교 전체가 든 파일: 선생님 · 2학년 7반 25명 · 2학년 8반 (7반에 없는 이름으로) */
export function exampleRoster(): Record<string, string>[] {
  const row = (type: string, [family, given]: string[], org: string, no: string, id: number) => ({ "사용자 유형": type, 성: family, 이름: given, "조직 경로": `/${SCHOOL}/${org}`, "고유 번호": no, 이메일: `user${id}@school.example` });
  return [
    row("선생님", ["한", "결"], "교무실", "", 0),
    ...GIVEN.map((g, i) => row("학생", [FAMILY[i % FAMILY.length], g], "2학년/7반", String(i + 1), i + 1)),
    row("학생", ["문", "가람"], "2학년/8반", "1", 26), row("학생", ["배", "나래"], "2학년/8반", "2", 27),
  ];
}
/** 명단 파일을 설정 → 반·명단의 [엑셀 가져오기]와 같은 규칙으로 읽어 2-7을 만든다: 학생 행만 · 고른 반만 · 이메일은 읽지 않음 */
export function importWhaleRoster(): number {
  const rows = exampleRoster();
  let st = studentsFromRows(rows, ROSTER_CLASS);
  if (isSchoolRoster(rows)) st = st.filter((s) => s.class === ROSTER_CLASS);
  const s = useStore.getState();
  s.setSettings((x) => (x.classes.some((c) => c.class === ROSTER_CLASS) ? x : { ...x, classes: [...x.classes, { class: ROSTER_CLASS, size: st.length }] }));
  s.setStudents([...useStore.getState().doc.students.filter((x) => x.class !== ROSTER_CLASS), ...st]);
  s.setClass(ROSTER_CLASS);
  useWhale.setState({ roster: true });
  return st.length;
}

/* ---------- 웨일 클래스 나감: 피드백 카드 (기록에서 바로) ---------- */

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
/**
 * 쪽지 학생: prefer(웨일 클래스 응답을 보낸 학생) 가운데 선생님 한 줄이 있는 학생, 없으면 반에서 내용 있는 기록이 가장 많은 학생.
 * 카테고리가 다른 최근 2건 → 잘한 장면, 가장 적은 카테고리 → 다음 도전
 */
export function feedbackCard(doc: NugaDoc, cls: string, prefer: number[] = []): FeedbackCard | null {
  const by = new Map<number, NugaRecord[]>();
  for (const r of doc.records) if (r.class === cls && r.status !== "skipped" && hasNote(r)) by.set(r.no, [...(by.get(r.no) || []), r]);
  const first = prefer.find((no) => by.has(no));
  const best = first !== undefined ? [first, by.get(first)!] as const : [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  if (!best) return null;
  const [no, recs] = best;
  const sorted = [...recs].sort((a, b) => b.time.localeCompare(a.time));
  const picked = [sorted[0]]; const other = sorted.find((r) => r.category !== sorted[0].category); if (other) picked.push(other);
  const cats = doc.settings.categories.map((c) => c.key);
  const counts = cats.map((k) => doc.records.filter((r) => r.class === cls && r.no === no && r.category === k).length);
  const least = counts.indexOf(Math.min(...counts));
  return { cls, no, good: picked.reverse().map((r) => toStudentSentence(r.note)).join(" "), next: NEXT[least] || NEXT[0], evidence: picked };
}
