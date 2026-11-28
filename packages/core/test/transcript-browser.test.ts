import { describe, expect, it } from "vitest";
import { BROWSER_ENGINE, browserTranscript, mergeTranscriptParts, ruleSuggestions, splitTranscript, DEFAULT_CATEGORIES } from "../src";

const start = new Date("2026-11-28T10:00:00+09:00");
const at = (sec: number) => start.getTime() + sec * 1000;

describe("웹 모바일 자동녹음 스크립트", () => {
  const tr = browserTranscript(
    [{ text: "  ", at: at(2) }, { text: "지난 시간에 배운 중화 반응이랑 비슷한 것 같아요 산성비 때문에", at: at(6) }, { text: "왜 온도가 높으면 더 빨리 녹나요?", at: at(11) }],
    { id: "t1", class: "2-3", period: 2, startedAt: start, endedAt: new Date(at(12)) },
  );
  it("빈 문장은 버리고 차례대로 화자1 구간을 만든다", () => {
    expect(tr.segments.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(tr.segments[0]).toMatchObject({ t0: 0, t1: 6, speaker: "화자1" });
    expect(tr.segments[1]).toMatchObject({ t0: 6, t1: 11 });
    expect(tr.engine).toEqual(BROWSER_ENGINE);
  });
  it("화자를 가르지 못하니 교사 추정을 하지 않아 모든 발언이 추천 후보", () => {
    expect(tr.teacherSpeaker).toEqual({ auto: null, confirmed: null });
    expect(ruleSuggestions(tr, { categories: DEFAULT_CATEGORIES }).length).toBeGreaterThan(0);
  });
  it("나눠 보냈다 합쳐도 교사 추정을 되살리지 않는다", () => {
    const parts = splitTranscript(tr, 400);
    expect(parts.length).toBeGreaterThan(1);
    expect(mergeTranscriptParts(parts)?.teacherSpeaker.auto).toBeNull();
  });
});
