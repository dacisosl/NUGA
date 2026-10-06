import { DEFAULT_RECORDING, lessonFor, type NugaDoc } from "@nuga/core";
import { readAreaDoc, useStore } from "../store";
import { suggestFromTranscript } from "./ai";
import { useTranscripts } from "./transcripts";

/** 스크립트가 속한 영역 문서 (현재 영역이면 메모리의 것) */
async function areaDocOf(areaId: string): Promise<NugaDoc> {
  const st = useStore.getState();
  if (areaId === st.areaId) return st.doc;
  return (await readAreaDoc(areaId)) || st.doc;
}

/**
 * 스크립트 하나에 대해 추천 카드를 만든다 (도착 직후 자동, 또는 [다시 추천]).
 * AI 가 켜져 있으면 LLM 판별(이름 가림), 아니면 규칙. 교사가 이미 처리한 카드는 유지한다.
 */
export async function runSuggestions(transcriptId: string): Promise<{ count: number; by: string; error?: string }> {
  const ts = useTranscripts.getState();
  if (!ts.loaded) await ts.load();
  const tr = await ts.get(transcriptId);
  const meta = useTranscripts.getState().index.find((m) => m.id === transcriptId);
  if (!tr || !meta) return { count: 0, by: "", error: "스크립트 없음" };
  const doc = await areaDocOf(meta.areaId);
  const st = useStore.getState();
  const names = [...new Set([...doc.students, ...st.doc.students].map((s) => s.name).filter(Boolean))];
  const topic = lessonFor(doc.settings.progress, tr.class, tr.startedAt)?.title || "";
  const max = (st.doc.settings.recording || DEFAULT_RECORDING).maxSuggestions || 10;
  const res = await suggestFromTranscript(tr, { ai: st.doc.settings.ai, categories: doc.settings.categories, topic, names, max });
  await useTranscripts.getState().putSuggestions(transcriptId, res.items, res.by);
  return { count: res.items.length, by: res.by, error: res.error };
}
