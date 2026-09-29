import type { NugaDoc, Student, Level } from "./types";
import { emptyDoc } from "./types";

export interface ExportJson { format: "nuga"; version: 1; exportedAt: string; doc: NugaDoc }

export function toExportJson(doc: NugaDoc, exportedAt: string): string {
  const safe: NugaDoc = { ...doc, settings: { ...doc.settings, ai: { ...doc.settings.ai, apiKey: "" } } };
  const out: ExportJson = { format: "nuga", version: 1, exportedAt, doc: safe };
  return JSON.stringify(out, null, 2);
}

export function parseImportJson(text: string): NugaDoc {
  const j = JSON.parse(text) as Partial<ExportJson> | Partial<NugaDoc>;
  const doc = ("format" in j && (j as ExportJson).format === "nuga" ? (j as ExportJson).doc : (j as NugaDoc)) as Partial<NugaDoc>;
  if (!doc || typeof doc !== "object" || !doc.settings) throw new Error("누가 JSON 형식이 아님");
  const base = emptyDoc();
  return {
    version: 1,
    settings: { ...base.settings, ...doc.settings, options: { ...base.settings.options, ...(doc.settings.options || {}) }, ai: { ...base.settings.ai, ...(doc.settings.ai || {}) } },
    students: Array.isArray(doc.students) ? doc.students : [],
    records: Array.isArray(doc.records) ? doc.records : [],
    performances: Array.isArray(doc.performances) ? doc.performances : [],
    drafts: Array.isArray(doc.drafts) ? doc.drafts : [],
    devices: Array.isArray(doc.devices) ? doc.devices : [],
  };
}

/** 엑셀/CSV 행(헤더 자유형)에서 학생 명단 추출. 열 이름: 반/학급, 번호/학번, 이름/성명, 수준 */
export function studentsFromRows(rows: Record<string, unknown>[], fallbackClass?: string): Student[] {
  const norm = (k: string) => k.replace(/\s/g, "").toLowerCase();
  const out: Student[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (...cands: string[]) => { const k = keys.find((x) => cands.includes(norm(x))); return k ? String(row[k] ?? "").trim() : ""; };
    const name = get("이름", "성명", "name", "학생명");
    if (!name) continue;
    let cls = get("반", "학급", "class", "학년반");
    const noRaw = get("번호", "학번", "no", "번");
    let no = parseInt(noRaw, 10);
    if (/^\d{5}$/.test(noRaw)) { // 학번 20315 → 2-3 15번
      cls = cls || `${noRaw[0]}-${parseInt(noRaw.slice(1, 3), 10)}`; no = parseInt(noRaw.slice(3), 10);
    } else if (/^\d{4}$/.test(noRaw)) { cls = cls || `${noRaw[0]}-${parseInt(noRaw[1], 10)}`; no = parseInt(noRaw.slice(2), 10); }
    if (cls && /^\d+$/.test(cls)) cls = (fallbackClass?.split("-")[0] || "2") + "-" + parseInt(cls, 10);
    if (cls && /^\d+-\d+$/.test(cls)) cls = cls.split("-").map((x) => String(parseInt(x, 10))).join("-");
    cls = cls || fallbackClass || "";
    if (!cls || !no) continue;
    const lv = get("수준", "level").toUpperCase();
    out.push({ class: cls, no, name, level: (["A", "B", "C"].includes(lv) ? lv : "B") as Level });
  }
  return out;
}

/** 진도표 행: 날짜 · 반 · 단원 · 차시 · 제목 */
export function progressFromRows(rows: Record<string, unknown>[]): NugaDoc["settings"]["progress"] {
  const norm = (k: string) => k.replace(/\s/g, "").toLowerCase();
  const out: NugaDoc["settings"]["progress"] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (...cands: string[]) => { const k = keys.find((x) => cands.includes(norm(x))); return k ? row[k] : undefined; };
    let date = get("날짜", "일자", "date");
    if (date instanceof Date) date = date.toISOString().slice(0, 10);
    if (typeof date === "number") { const d = new Date(Math.round((date - 25569) * 86400 * 1000)); date = d.toISOString().slice(0, 10); }
    const ds = String(date ?? "").trim().replace(/\./g, "-").replace(/\//g, "-");
    if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(ds)) continue;
    const [y, m, d] = ds.split("-").map((x) => parseInt(x, 10));
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let cls = String(get("반", "학급", "class") ?? "").trim();
    if (/^\d+-\d+$/.test(cls)) cls = cls.split("-").map((x) => String(parseInt(x, 10))).join("-");
    const unit = String(get("단원", "unit") ?? "").trim();
    const lesson = parseInt(String(get("차시", "lesson") ?? "1"), 10) || 1;
    const title = String(get("제목", "주제", "title", "학습주제") ?? "").trim();
    if (!cls || !unit) continue;
    out.push({ date: iso, class: cls, unit, lesson, title });
  }
  return out;
}
