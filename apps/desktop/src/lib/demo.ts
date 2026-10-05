import { nowIso, parseTranscription, resolveNow, slotsForWeekday, uuid, weekdayOf, type Transcript } from "@nuga/core";
import { DEMO_LESSON as demoLesson } from "@nuga/core";
import { arrivalModeOf, useStore } from "../store";
import { useTranscripts } from "./transcripts";
import { runSuggestions } from "./suggestFlow";

/**
 * 데모 모드 (v3 13.4): 모의 학급 2개 + 한 학기 합성 기록 + 합성 모의 수업 스크립트 + 추천 카드.
 * 모든 데이터는 합성이며 실제 학생 정보나 실제 수업 음성은 없다. API 키 없이도 규칙으로 추천을 보여 준다.
 */
const DEMO_FLAG = "nuga.demo";

export interface DemoInfo { transcriptId: string; class: string; period: number; startedAt: string; durationSec: number }

export function demoInfo(): DemoInfo | null {
  try { const v = localStorage.getItem(DEMO_FLAG); return v ? (JSON.parse(v) as DemoInfo) : null; } catch { return null; }
}
function setDemoInfo(v: DemoInfo | null) { try { if (v) localStorage.setItem(DEMO_FLAG, JSON.stringify(v)); else localStorage.removeItem(DEMO_FLAG); } catch { /* 저장 불가 */ } }

/** 2-3 반의 오늘 수업(없으면 가장 최근 수업일)의 시작 시각 */
function demoSlot(): { start: Date; period: number } {
  const doc = useStore.getState().doc;
  const cls = "2-3";
  const now = new Date();
  for (let back = 0; back < 14; back++) {
    const d = new Date(now); d.setDate(d.getDate() - back);
    const slot = slotsForWeekday(doc.settings, weekdayOf(d)).find((s) => s.class === cls);
    if (!slot) continue;
    const [h, m] = slot.start.split(":").map(Number);
    d.setHours(h, m + 1, 0, 0);
    if (d.getTime() > now.getTime() && back === 0) { // 오늘 수업이 아직이면 지난 수업일로
      continue;
    }
    return { start: d, period: slot.period };
  }
  const d = new Date(now.getTime() - 15 * 60_000);
  return { start: d, period: resolveNow(doc.settings, now).current?.period || 0 };
}

export async function startDemo(): Promise<DemoInfo> {
  const st = useStore.getState();
  // 데모는 "수동 기록 → 쉬는 시간 보완" 흐름을 보여 주므로 보완 대기를 켠다 (공통 설정에 남는다)
  if (arrivalModeOf(st.doc.settings) === "direct") st.update((d) => { d.settings.arrivalMode = "popup"; d.settings.supplementEnabled = true; });
  useStore.getState().loadSample();
  useStore.getState().setPage("today");
  const { start, period } = demoSlot();
  const dur = demoLesson.durationSec;
  const id = uuid();
  const tr: Transcript = parseTranscription(JSON.stringify({ segments: demoLesson.segments }), {
    id, class: demoLesson.class, period, startedAt: nowIso(start), endedAt: nowIso(new Date(start.getTime() + dur * 1000)),
    provider: "demo", model: "합성 모의 수업", createdAt: nowIso(),
  });
  const ts = useTranscripts.getState();
  if (!ts.loaded) await ts.load();
  // 이전 데모 스크립트 정리
  const prev = demoInfo();
  if (prev) await ts.remove(prev.transcriptId).catch(() => {});
  await ts.save(tr, useStore.getState().areaId);
  await runSuggestions(id);
  const info = { transcriptId: id, class: tr.class, period, startedAt: tr.startedAt, durationSec: dur };
  setDemoInfo(info);
  return info;
}

/**
 * 모바일 확인(폰 미리보기)의 녹음: 녹음을 멈추면 폰이 음성을 변환해 스크립트를 보낸 것처럼
 * 합성 모의 수업 스크립트를 그 반·시각으로 저장하고 추천 카드를 만든다. 실제 음성은 쓰지 않는다.
 */
export async function simulateLessonTranscript(cls: string, period: number, start: Date): Promise<{ id: string; count: number }> {
  const id = uuid();
  const tr: Transcript = parseTranscription(JSON.stringify({ segments: demoLesson.segments }), {
    id, class: cls, period, startedAt: nowIso(start), endedAt: nowIso(new Date(start.getTime() + demoLesson.durationSec * 1000)),
    provider: "demo", model: "합성 모의 수업 (폰 미리보기)", createdAt: nowIso(),
  });
  const ts = useTranscripts.getState();
  if (!ts.loaded) await ts.load();
  await ts.save(tr, useStore.getState().areaId);
  const r = await runSuggestions(id);
  return { id, count: r.count };
}

/** 데모 끝내기 (설정 → 데이터): 합성 모의 수업 스크립트를 지운다. 샘플 명단·기록은 그대로 */
export async function endDemo() {
  const prev = demoInfo();
  if (prev) await useTranscripts.getState().remove(prev.transcriptId).catch(() => {});
  setDemoInfo(null);
}
