import type { NugaDoc, Student, Level } from "./types";
import { LEGACY_LEVEL_SCORE, clampScore } from "./achievement";
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

const normKey = (k: string) => k.replace(/\s/g, "").toLowerCase();
const ORG_KEYS = ["조직경로", "소속조직", "orgunitpath"];
/** 학생이 아닌 사용자 유형 (웨일 스페이스: 선생님 · 직원 · 학부모) */
const NOT_STUDENT = /선생님|교사|교원|직원|학부모|보호자|^(tea|emp|par)$/i;

/** 학교 전체가 든 명단인가: 웨일 스페이스 관리자 '사용자 다운로드'처럼 조직 경로 열이 있다. 그러면 고른 반만 가져온다 */
export function isSchoolRoster(rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => Object.keys(r).some((k) => ORG_KEYS.includes(normKey(k))));
}

/** 조직 경로의 반: '/학교/2학년/7반' · '/학교/2학년/2학년 7반' · '/학교/2학년 7반' · '/학교/2-7' → 2-7. 반이 없으면(교무실 등) 빈 값 */
export function classFromOrgPath(path: string): string {
  const m = path.match(/(\d+)\s*학년[^\d]*(\d+)\s*반/) || path.match(/(?:^|\/)\s*(\d+)\s*-\s*(\d+)\s*반?\s*$/);
  return m ? `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}` : "";
}

/**
 * 엑셀/CSV 행(헤더 자유형)에서 학생 명단 추출. 열 이름: 반/학급, 번호/학번, 이름/성명, 수준.
 * 웨일 스페이스 명단(조직 경로 열이 있는 학교 전체 명단)도 읽는다: 성 + 이름, 조직 경로 → 반, 고유 번호, 사용자 유형(학생 행만).
 * 이 명단에서 반을 알 수 없는 행은 고른 반(fallbackClass)으로 넣지 않고 버린다 — 다른 반 학생이 섞이지 않게
 */
export function studentsFromRows(rows: Record<string, unknown>[], fallbackClass?: string): Student[] {
  const norm = normKey;
  const out: Student[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (...cands: string[]) => { const k = keys.find((x) => cands.includes(norm(x))); return k ? String(row[k] ?? "").trim() : ""; };
    const school = keys.some((k) => ORG_KEYS.includes(norm(k)));
    if (NOT_STUDENT.test(get("사용자유형", "사용자구분", "usertype", "구분"))) continue;
    // 웨일 스페이스 명단은 성과 이름이 나뉘어 있다. 다른 명단의 '성' 열(성별일 수도 있다)은 읽지 않는다
    const given = get("이름", "성명", "name", "학생명", "givenname");
    const name = given && school ? get("성", "familyname") + given : given;
    if (!name) continue;
    let cls = get("반", "학급", "class", "학년반") || (school ? classFromOrgPath(get(...ORG_KEYS)) : "");
    const noRaw = get("번호", "학번", "no", "번", "고유번호", "number");
    let no = parseInt(noRaw, 10);
    if (/^\d{5}$/.test(noRaw)) { // 학번 20315 → 2-3 15번
      cls = cls || `${noRaw[0]}-${parseInt(noRaw.slice(1, 3), 10)}`; no = parseInt(noRaw.slice(3), 10);
    } else if (/^\d{4}$/.test(noRaw)) { cls = cls || `${noRaw[0]}-${parseInt(noRaw[1], 10)}`; no = parseInt(noRaw.slice(2), 10); }
    if (cls && /^\d+$/.test(cls)) cls = (fallbackClass?.split("-")[0] || "2") + "-" + parseInt(cls, 10);
    if (cls && /^\d+-\d+$/.test(cls)) cls = cls.split("-").map((x) => String(parseInt(x, 10))).join("-");
    cls = cls || (school ? "" : fallbackClass || "");
    if (!cls || !no) continue;
    // 도달 정도: 숫자(0~100) 또는 옛 수준 A·B·C. 비어 있으면 기록으로 자동 추정
    const raw = get("도달정도", "도달", "achievement", "수준", "level").toUpperCase();
    const num = Number(raw);
    const manual = raw && !Number.isNaN(num) ? clampScore(num) : (["A", "B", "C"] as string[]).includes(raw) ? LEGACY_LEVEL_SCORE[raw as Level] : null;
    out.push({ class: cls, no, name, ...(manual !== null ? { achievement: { auto: null, manual, confidence: "ok" as const } } : {}) });
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
