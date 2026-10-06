/**
 * 일괄 관찰기록: 붙여넣은 글(엑셀 칸 · 한글 문서 · 메모)이나 스캔 PDF 에서 읽은 글 → 기록 후보 줄.
 *
 * 한 줄 = 기록 하나. 줄 앞의 번호(3 · 03번 · 3. · 학번 20303) · 이름(명단에 있는 이름) · 날짜(9/18 · 2026-09-18 · 9월 18일) ·
 * 분류([발표] · 발표:)를 떼어 내고 남은 글이 내용이다. 날짜는 줄 끝 괄호에 있어도 읽는다.
 * 학생을 찾지 못한 줄은
 *  · 글머리표(- • ·)로 시작하면 바로 위 학생의 새 기록,
 *  · 그 밖에는 바로 위 기록에 이어지는 글(스캔에서 한 칸이 여러 줄로 끊긴 경우)로 붙인다.
 * 학생만 있고 내용이 없는 줄은 그 아래 줄들의 머리(학생 묶음), 날짜만 있는 줄은 그 아래 줄들의 날짜가 된다.
 * 번호와 이름이 서로 다르면 이름을 따르고 '확인'으로 둔다. 표 머리 줄(번호 · 이름 · 내용)은 건너뛴다.
 * 스캔 글은 이름 한 글자가 틀리기 쉽다(김민쥰): 명단 이름과 한 글자만 다른 세 글자 이상 낱말은 그 학생으로 읽되 '확인'으로 둔다.
 */

export interface BulkStudent { no: number; name: string }
export interface BulkCategory { key: number; label: string }
/** ok = 학생 찾음 · check = 찾았지만 확인이 필요 · none = 학생 없음 */
export type BulkStatus = "ok" | "check" | "none";
export interface BulkRow {
  /** 학생 번호 (못 찾으면 null) */
  no: number | null;
  /** YYYY-MM-DD */
  date: string;
  /** 줄(또는 위 날짜 줄)에 날짜가 있었나 (없으면 기본 날짜) */
  dated: boolean;
  /** 분류 키 (없으면 0 = 미정) */
  category: number;
  text: string;
  status: BulkStatus;
  /** 확인이 필요한 까닭 */
  hint?: string;
  /** 원래 줄 (이어 붙인 줄 포함) */
  raw: string;
}
export interface BulkOptions {
  students: BulkStudent[];
  categories: BulkCategory[];
  /** 날짜 없는 줄의 날짜 (YYYY-MM-DD) */
  defaultDate: string;
  /** 연도 없는 날짜의 학년도를 정하는 오늘 (기본: 지금) */
  today?: Date;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const BULLET = /^[-–—•·∙*▪◦○●□■▶►※]\s*/;
/** 토막 사이 구분 글자 */
const SEP = /^[\s.,:;|\-–—·，：；)）\]】>]+/;
const HEADER_WORDS = new Set(["번호", "번", "이름", "성명", "학생", "학생명", "학번", "내용", "관찰", "관찰내용", "기록", "누가기록", "기록내용", "날짜", "일자", "분류", "비고", "반"]);
const DATE_FULL = /^[[(（]?\s*(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\.?\s*[\])）]?/;
const DATE_MD = /^[[(（]?\s*(\d{1,2})\s*(?:[./]|월\s*)\s*(\d{1,2})\s*일?(?![\d.])\s*[\])）]?/;
const DATE_TAIL = /[\s([（]*(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*(?:[./]|월\s*)\s*(\d{1,2})\s*일?\.?\s*[\])）]?\s*$/;
/** 학번: 학년(1) · 반(2) · 번호(2) */
const STUDENT_ID = /^([1-3])(\d{2})(\d{2})(?!\d)/;
const NO_BEN = /^(\d{1,2})\s*번(?!째)/;
const NO_SEP = /^(\d{1,2})(?=[\s.,:;|)）\]】\-–—·，：；]|$)/;
const TAG = /^[[(（【<]\s*([^\])）】>]{1,8}?)\s*[\])）】>]/;

function ymd(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(y, m - 1, d);
  return t.getMonth() === m - 1 ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}
/** 연도 없는 날짜: 오늘이 속한 학년도(3월 ~ 이듬해 2월)로 */
function schoolYearOf(m: number, today: Date): number {
  const start = today.getMonth() >= 2 ? today.getFullYear() : today.getFullYear() - 1;
  return m >= 3 ? start : start + 1;
}
/** 명단 이름과 한 글자만 다른 낱말(세 글자 이상, 성은 같아야) — 스캔 글의 이름 오타 */
function nearName(word: string, names: string[]): string | null {
  const w = Array.from(word);
  if (w.length < 3) return null;
  const hits = names.filter((n) => {
    const a = Array.from(n);
    if (a.length !== w.length || a[0] !== w[0]) return false;
    let diff = 0;
    for (let i = 1; i < a.length; i++) if (a[i] !== w[i]) diff++;
    return diff === 1;
  });
  return hits.length === 1 ? hits[0] : null;
}
const isHeader = (line: string) => {
  const t = line.split(/[\s,|]+/).filter(Boolean);
  return t.length >= 2 && t.every((w) => HEADER_WORDS.has(w));
};

export function parseBulkRecords(input: string, opts: BulkOptions): BulkRow[] {
  const today = opts.today ?? new Date();
  const byNo = new Map(opts.students.map((s) => [s.no, s]));
  const byName = new Map<string, BulkStudent[]>();
  for (const s of opts.students) if (s.name && s.name.length >= 2) byName.set(s.name, [...(byName.get(s.name) || []), s]);
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const catOf = (w: string): number => {
    const t = w.trim();
    return t ? opts.categories.find((c) => t === c.label || t.startsWith(c.label))?.key ?? 0 : 0;
  };
  const labels = opts.categories.map((c) => c.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  const bareTag = labels.length ? new RegExp(`^(${labels.join("|")})\\s*[:：]`) : null;

  const rows: BulkRow[] = [];
  /** 학생 묶음 머리: 아래 글머리표 · 이어지는 줄이 이 학생에게 간다 */
  let head: { no: number | null; status: BulkStatus; hint?: string } | null = null;
  let headOnly = false; // 바로 위 줄이 학생만 있던 머리 줄인가
  let curDate: string | null = null;

  for (const line0 of input.replace(/\r\n?/g, "\n").split("\n")) {
    let line = line0.replace(/ /g, " ").trim();
    if (!line || isHeader(line)) continue;
    let bullet = false;
    if (BULLET.test(line)) { bullet = true; line = line.replace(BULLET, ""); }

    // 줄 앞 토막: 날짜 · 학번 · 번호 · 이름 · 분류 (어느 순서든, 구분 글자를 사이에 두고)
    let no: number | null = null, name: string | null = null, date: string | null = null, category = 0;
    let typo: string | null = null; // 한 글자 다른 이름으로 읽은 낱말
    let rest = line;
    for (let k = 0; k < 8; k++) {
      rest = rest.replace(SEP, "");
      let m: RegExpMatchArray | null;
      if (!date && (m = rest.match(DATE_FULL))) { date = ymd(+m[1], +m[2], +m[3]); rest = rest.slice(m[0].length); continue; }
      if (!date && (m = rest.match(DATE_MD))) { const d = ymd(schoolYearOf(+m[1], today), +m[1], +m[2]); if (d) { date = d; rest = rest.slice(m[0].length); continue; } }
      if (no === null && (m = rest.match(STUDENT_ID))) { no = +m[3]; rest = rest.slice(m[0].length); continue; }
      if (no === null && (m = rest.match(NO_BEN) || rest.match(NO_SEP))) { no = +m[1]; rest = rest.slice(m[0].length); continue; }
      if (no === null && (m = rest.match(/^(\d{1,2})(?=[가-힣])/)) && names.some((n) => rest.slice(m![0].length).startsWith(n))) { no = +m[1]; rest = rest.slice(m[0].length); continue; }
      if (!name) {
        const nm = names.find((n) => rest.startsWith(n));
        if (nm) { name = nm; rest = rest.slice(nm.length).replace(/^\s*학생/, ""); continue; }
        const w = rest.match(/^([가-힣]{3,4})(?=[\s.,:;|)）\]】\-–—·，：；]|$)/);
        const near = w ? nearName(w[1], names) : null;
        if (w && near) { name = near; typo = w[1]; rest = rest.slice(w[0].length).replace(/^\s*학생/, ""); continue; }
      }
      if (!category && (m = rest.match(TAG)) && catOf(m[1])) { category = catOf(m[1]); rest = rest.slice(m[0].length); continue; }
      if (!category && bareTag && (m = rest.match(bareTag))) { category = catOf(m[1]); rest = rest.slice(m[0].length); continue; }
      break;
    }
    if (!date && (no !== null || name)) {
      const m = rest.match(DATE_TAIL);
      if (m) { const d = m[1] ? ymd(+m[1], +m[2], +m[3]) : ymd(schoolYearOf(+m[2], today), +m[2], +m[3]); if (d) { date = d; rest = rest.slice(0, m.index); } }
    }
    const text = rest.replace(SEP, "").replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();

    // 학생 정하기: 이름이 있으면 이름을 따르고, 번호와 다르면 확인
    if (no !== null || name) {
      let st: BulkStudent | null = null, status: BulkStatus = "ok", hint: string | undefined;
      const sNo = no !== null ? byNo.get(no) : undefined;
      const hits = name ? byName.get(name) || [] : [];
      if (hits.length > 1) {
        st = sNo && hits.includes(sNo) ? sNo : hits[0];
        if (!(sNo && hits.includes(sNo))) { status = "check"; hint = `같은 이름이 ${hits.length}명 — 학생을 골라 주세요`; }
      } else if (hits.length === 1) {
        st = hits[0];
        if (no !== null && st.no !== no) { status = "check"; hint = `번호 ${no}번과 이름(${name} · ${st.no}번)이 다릅니다`; }
      } else if (sNo) st = sNo;
      else { status = "none"; hint = `${no}번 학생이 명단에 없습니다`; }
      if (typo && st && status === "ok") { status = "check"; hint = `'${typo}'을(를) ${name}(으)로 읽었습니다`; }
      if (!text) { // 학생만 있는 줄: 아래 줄들의 머리
        head = { no: st?.no ?? null, status, hint }; headOnly = true;
        if (date) curDate = date;
        continue;
      }
      rows.push({ no: st?.no ?? null, date: date ?? curDate ?? opts.defaultDate, dated: !!(date ?? curDate), category, text, status, hint, raw: line0.trim() });
      head = { no: st?.no ?? null, status, hint }; headOnly = false;
      continue;
    }
    // 날짜만 있는 줄: 아래 줄들의 날짜
    if (!text) { if (date) curDate = date; continue; }
    const d = date ?? curDate;
    if (bullet || headOnly || !rows.length) {
      const h = head && (bullet || headOnly) ? head : null;
      rows.push({
        no: h?.no ?? null, date: d ?? opts.defaultDate, dated: !!d, category, text,
        status: h ? h.status : "none", hint: h ? h.hint : "학생 번호나 이름을 찾지 못했습니다", raw: line0.trim(),
      });
      headOnly = false;
      continue;
    }
    // 이어지는 줄: 바로 위 기록에 붙인다
    const last = rows[rows.length - 1];
    last.text = `${last.text} ${text}`.trim();
    last.raw = `${last.raw}\n${line0.trim()}`;
    if (category && !last.category) last.category = category;
  }
  return rows;
}
