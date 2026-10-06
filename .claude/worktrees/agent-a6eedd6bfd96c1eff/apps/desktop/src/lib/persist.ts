import type { NugaDoc } from "@nuga/core";
import { isTauri } from "./platform";

export interface Persist {
  load(): Promise<NugaDoc | null>;
  save(doc: NugaDoc): Promise<void>;
  loadAux<T>(key: string): Promise<T | null>;
  saveAux<T>(key: string, v: T): Promise<void>;
  location(): string;
}

const FILE = "nuga-data.json";

/** 파일명에 쓸 수 없는 문자(Windows의 콜론 등)를 안전한 문자로 바꾼다. */
export function safeAuxName(key: string): string {
  return `aux-${key.replace(/[\\/:*?"<>|]/g, "_")}.json`;
}

async function tauriPersist(): Promise<Persist> {
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await import("@tauri-apps/api/path");
  const dir = await path.appDataDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const p = (name: string) => `${dir}${dir.endsWith("\\") || dir.endsWith("/") ? "" : "\\"}${name}`;
  const readJson = async <T,>(name: string): Promise<T | null> => {
    try { if (!(await fs.exists(p(name)))) return null; return JSON.parse(await fs.readTextFile(p(name))) as T; } catch { return null; }
  };
  const writeJson = async (name: string, v: unknown) => {
    const tmp = p(name + ".tmp");
    await fs.writeTextFile(tmp, JSON.stringify(v));
    await fs.rename(tmp, p(name));
  };
  return {
    load: () => readJson<NugaDoc>(FILE),
    save: (doc) => writeJson(FILE, doc),
    loadAux: async <T,>(k: string) => {
      const name = safeAuxName(k);
      const v = await readJson<T>(name);
      if (v !== null || name === `aux-${k}.json`) return v;
      // 0.2.0 이하: "aux-doc:<id>.json" 으로 저장했던 파일(Windows에서는 대체 데이터 스트림)을 옮긴다
      const old = await readJson<T>(`aux-${k}.json`);
      if (old !== null) { try { await writeJson(name, old); } catch { /* 다음 저장 때 다시 씀 */ } }
      return old;
    },
    saveAux: (k, v) => writeJson(safeAuxName(k), v),
    location: () => p(FILE),
  };
}

async function webPersist(): Promise<Persist> {
  const { get, set } = await import("idb-keyval");
  return {
    load: async () => (await get<NugaDoc>("doc")) ?? null,
    save: (doc) => set("doc", doc),
    loadAux: async (k) => (await get(`aux-${k}`)) ?? null,
    saveAux: (k, v) => set(`aux-${k}`, v),
    location: () => "브라우저 저장소(IndexedDB)",
  };
}

let cached: Promise<Persist> | null = null;
export function getPersist(): Promise<Persist> {
  if (!cached) cached = isTauri ? tauriPersist() : webPersist();
  return cached;
}
