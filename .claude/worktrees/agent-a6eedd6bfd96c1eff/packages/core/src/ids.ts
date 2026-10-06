export function uuid(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (c.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ISO-8601 with local offset, e.g. 2026-05-08T10:12:00+09:00 */
export function nowIso(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function dateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtMD(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtHM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 반 정렬 키. "2-3" 꼴은 학년·반 순, 숫자로 시작하면 그 숫자, 그 외 자유 이름은 뒤로. */
export function classSortKey(c: string): number {
  const m = c.match(/^(\d+)\s*-\s*(\d+)/);
  if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  const n = parseInt(c, 10);
  return isNaN(n) ? 1_000_000 : n * 100;
}
