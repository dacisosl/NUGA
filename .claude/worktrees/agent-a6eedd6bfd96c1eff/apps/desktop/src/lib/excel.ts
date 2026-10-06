import * as XLSX from "xlsx";
import { saveFile, readFileAsArrayBuffer } from "./platform";

export type Row = Record<string, string | number>;

/** 시트 여러 개(반별)를 한 파일로 저장 */
export async function exportSheets(fileName: string, sheets: { name: string; rows: Row[]; widths?: number[] }[]): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    if (s.widths) ws["!cols"] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return saveFile(fileName, new Uint8Array(out), [{ name: "Excel", extensions: ["xlsx"] }]);
}

/** 첫 시트(또는 모든 시트)를 헤더 기반 객체 배열로 읽기 */
export async function readSheetRows(file: File, allSheets = false): Promise<Record<string, unknown>[]> {
  const buf = await readFileAsArrayBuffer(file);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const names = allSheets ? wb.SheetNames : wb.SheetNames.slice(0, 1);
  const rows: Record<string, unknown>[] = [];
  for (const n of names) rows.push(...(XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" }) as Record<string, unknown>[]));
  return rows;
}

export function templateStudents(): Row[] {
  return [{ 반: "2-3", 번호: 1, 이름: "홍길동", 수준: "B" }, { 반: "2-3", 번호: 2, 이름: "김철수", 수준: "A" }];
}
export function templateProgress(): Row[] {
  return [{ 날짜: "2026-03-04", 반: "2-3", 단원: "1단원", 차시: 1, 제목: "화학의 유용성" }];
}
