import type { CategoryDef, Category, SchoolLevel, Settings, WriteItem } from "./types";
import length2026 from "../presets/length-2026.json";
import elem from "../presets/school-elem.json";
import middle from "../presets/school-middle.json";
import high from "../presets/school-high.json";
import { DEFAULT_DRAFT_GUIDE, DRAFT_PROMPT_PRESETS } from "./draft";

/**
 * 학교급·글자수 프리셋. 기재요령이 바뀌면 presets/*.json 만 바꾸면 된다.
 * verified=false 인 값은 화면에 "기재요령 확인 필요"를 표시한다.
 */
export interface LengthItem { label: string; limit: number; verified: boolean }
export interface LengthPreset { year: number; source: string; verified: boolean; note: string; unit: "bytes"; band: [number, number]; items: Record<WriteItem, LengthItem> }
export interface SchoolPreset {
  level: SchoolLevel; label: string; verified: boolean;
  userModel: "homeroom" | "subject"; userModelLabel: string;
  timetableMode: "subject" | "class";
  items: WriteItem[]; defaultItem: WriteItem;
  categories: string[];
  suggestWeights: Record<string, number>;
  styleGuide: string;
  forbidden: { group: string; terms: string[] }[];
}

export const LENGTH_PRESET = length2026 as unknown as LengthPreset;
export const SCHOOL_PRESETS: Record<SchoolLevel, SchoolPreset> = {
  elem: elem as unknown as SchoolPreset,
  middle: middle as unknown as SchoolPreset,
  high: high as unknown as SchoolPreset,
};

export const WRITE_ITEM_LABEL: Record<WriteItem, string> = {
  setuk: "과목별 세특", elemSubject: "교과 특기사항(초)", behavior: "행동특성 및 종합의견",
  autonomy: "창체 자율·자치", club: "창체 동아리", career: "창체 진로",
};

/** 작성 항목 → 기본 초안 지침(DRAFT_PROMPT_PRESETS key) */
export const WRITE_ITEM_PROMPT: Record<WriteItem, "setuk" | "club" | "behavior"> = {
  setuk: "setuk", elemSubject: "setuk", behavior: "behavior", autonomy: "club", club: "club", career: "club",
};

/** 기재요령 기본 한도 (항목 단위, 바이트) */
export function presetLimit(item: WriteItem = "setuk"): number { return LENGTH_PRESET.items[item]?.limit ?? 1500; }

/** 현재 단위로 바꾼 기재요령 기본 한도 (글자 단위면 바이트÷3) */
export function presetLimitIn(item: WriteItem, mode: Settings["lengthMode"]): number {
  const b = presetLimit(item);
  return mode === "bytes" ? b : Math.round(b / 3);
}

export function presetCategories(level: SchoolLevel): CategoryDef[] {
  return SCHOOL_PRESETS[level].categories.slice(0, 4).map((label, i) => ({ key: (i + 1) as Category, label }));
}

/**
 * 학교급 프리셋을 설정에 적용한다 (첫 실행 1단계).
 * 카테고리·작성 항목·글자수(바이트)·목표 구간을 바꾸고, 나머지 값은 그대로 둔다.
 */
export function applySchoolPreset(s: Settings, level: SchoolLevel): Settings {
  const p = SCHOOL_PRESETS[level];
  const item = p.defaultItem;
  return {
    ...s,
    schoolLevel: level,
    writeItem: item,
    categories: presetCategories(level),
    lengthMode: "bytes",
    lengthBand: [...LENGTH_PRESET.band] as [number, number],
    lengthCustom: false,
    targetLength: { ...s.targetLength, "세특": presetLimit(item) },
  };
}

/** 학교급 문체 지침과 추가 금지어 */
export function schoolStyle(level: SchoolLevel | undefined): { styleGuide: string; forbidden: { group: string; terms: string[] }[] } {
  if (!level) return { styleGuide: "", forbidden: [] };
  const p = SCHOOL_PRESETS[level];
  return { styleGuide: p.styleGuide, forbidden: p.forbidden };
}

/** 작성 항목에 맞는 기본 초안 지침 (영역 프롬프트를 비워 두면 이것을 쓴다) */
export function defaultGuideFor(item?: WriteItem): string {
  const key = WRITE_ITEM_PROMPT[item || "setuk"];
  return DRAFT_PROMPT_PRESETS.find((p) => p.key === key)?.text || DEFAULT_DRAFT_GUIDE;
}
