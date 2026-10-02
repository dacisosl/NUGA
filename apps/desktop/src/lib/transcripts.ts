import { create } from "zustand";
import { mergeTranscriptParts, type Transcript, type TranscriptPart } from "@nuga/core";
import { getPersist } from "./persist";

/**
 * 수업 스크립트 보관 (PC, v3 7.6). 수업마다 별도 파일에 두고, 목록(색인)만 메모리에 올린다.
 * 학생 문서(NugaDoc)와 분리해 저장이 느려지지 않게 한다.
 */
export interface TranscriptMeta {
  id: string;
  class: string;
  period: number;
  startedAt: string;
  endedAt: string;
  segmentCount: number;
  speakers: number;
  teacher: string | null;
  areaId: string;
  receivedAt: string;
  engine: string;
}

interface TState {
  loaded: boolean;
  index: TranscriptMeta[];
  load(): Promise<void>;
  get(id: string): Promise<Transcript | null>;
  /** 조각 하나를 받는다. 다 모이면 저장하고 스크립트를 돌려준다 */
  addPart(part: TranscriptPart, areaId: string): Promise<Transcript | null>;
  save(tr: Transcript, areaId?: string): Promise<void>;
  setTeacher(id: string, speaker: string | null): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX = "transcripts";
const fileKey = (id: string) => `tr-${id}`;
const partKey = (id: string) => `trp-${id}`;
const cache = new Map<string, Transcript>();

function metaOf(tr: Transcript, areaId: string, receivedAt: string): TranscriptMeta {
  return {
    id: tr.id, class: tr.class, period: tr.period, startedAt: tr.startedAt, endedAt: tr.endedAt,
    segmentCount: tr.segments.length, speakers: new Set(tr.segments.map((s) => s.speaker)).size,
    teacher: tr.teacherSpeaker.confirmed ?? tr.teacherSpeaker.auto, areaId, receivedAt, engine: `${tr.engine.provider} · ${tr.engine.model}`,
  };
}

export const useTranscripts = create<TState>((set, get) => ({
  loaded: false,
  index: [],

  async load() {
    const p = await getPersist();
    const index = (await p.loadAux<TranscriptMeta[]>(INDEX)) || [];
    set({ index: index.sort((a, b) => b.startedAt.localeCompare(a.startedAt)), loaded: true });
  },

  async get(id) {
    if (cache.has(id)) return cache.get(id)!;
    const p = await getPersist();
    const tr = await p.loadAux<Transcript>(fileKey(id));
    if (tr) cache.set(id, tr);
    return tr;
  },

  async addPart(part, areaId) {
    const p = await getPersist();
    const id = part.transcript.id;
    if (part.total <= 1) { await get().save(part.transcript, areaId); return part.transcript; }
    const have = ((await p.loadAux<TranscriptPart[]>(partKey(id))) || []).filter((x) => x.part !== part.part);
    const parts = [...have, part];
    const merged = mergeTranscriptParts(parts);
    if (!merged) { await p.saveAux(partKey(id), parts); return null; }
    await p.saveAux(partKey(id), null);
    await get().save(merged, areaId);
    return merged;
  },

  async save(tr, areaId) {
    if (!get().loaded) await get().load();
    const p = await getPersist();
    await p.saveAux(fileKey(tr.id), tr);
    cache.set(tr.id, tr);
    const prev = get().index.find((m) => m.id === tr.id);
    const meta = metaOf(tr, areaId ?? prev?.areaId ?? "default", prev?.receivedAt ?? new Date().toISOString());
    const index = [meta, ...get().index.filter((m) => m.id !== tr.id)].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    await p.saveAux(INDEX, index);
    set({ index });
  },

  async setTeacher(id, speaker) {
    const tr = await get().get(id);
    if (!tr) return;
    await get().save({ ...tr, teacherSpeaker: { ...tr.teacherSpeaker, confirmed: speaker } });
  },

  async remove(id) {
    const p = await getPersist();
    await p.saveAux(fileKey(id), null);
    cache.delete(id);
    const index = get().index.filter((m) => m.id !== id);
    await p.saveAux(INDEX, index);
    set({ index });
  },
}));
