import type { NugaDoc } from "./types";
import { migrateStudent } from "./achievement";

/**
 * 옛 데이터를 지금 형식으로 맞춘다 (불러올 때마다 실행, 여러 번 해도 같은 결과).
 * - 0.2.0 수준 A·B·C → 도달 정도 수동값 85·60·35
 * - AI 제공자 "local"(예전 의미: AI 끔) → "anthropic" (로컬 LLM 주소가 없을 때)
 * - 목표 구간 기본값
 */
export function migrateDoc(doc: NugaDoc): NugaDoc {
  const students = doc.students.map(migrateStudent);
  const s = doc.settings;
  const ai = { ...s.ai };
  if (ai.provider === "local" && !ai.localUrl) ai.provider = "anthropic";
  const lengthMode = s.lengthMode === "bytes" || s.lengthMode === "withoutSpaces" ? s.lengthMode : "withSpaces";
  return { ...doc, students, settings: { ...s, ai, lengthMode, lengthBand: s.lengthBand ?? [0.96, 1.0] } };
}
