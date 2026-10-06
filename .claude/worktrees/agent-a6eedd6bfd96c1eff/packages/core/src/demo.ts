import lesson from "../demo/lesson-equilibrium.json";

/** 합성 모의 수업 대본 (음성 합성용 대본이자 미리 처리한 스크립트). 실제 수업·학생 음성이 아니다. */
export interface DemoLesson { title: string; note: string; class: string; period: number; durationSec: number; segments: { start: string; end: string; speaker: string; text: string }[] }
export const DEMO_LESSON = lesson as DemoLesson;
