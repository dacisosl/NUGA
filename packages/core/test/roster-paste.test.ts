import { describe, expect, it } from "vitest";
import { parseRosterLines } from "../src";

describe("명단 붙여넣기", () => {
  it("이름만 → 1번부터 차례로", () => {
    expect(parseRosterLines("김민준\n이서연\n\n박지우", "2-3").map((s) => [s.no, s.name])).toEqual([[1, "김민준"], [2, "이서연"], [3, "박지우"]]);
  });
  it("번호·학번·도달 정도·엑셀 탭 칸, 머리글 줄은 버림", () => {
    const r = parseRosterLines("번호\t이름\n12 최하은 72\n20315 정도윤\n7\t한예서", "2-3");
    expect(r.map((s) => [s.no, s.name])).toEqual([[12, "최하은"], [15, "정도윤"], [7, "한예서"]]);
    expect(r[0].achievement?.manual).toBe(72);
  });
  it("이미 쓰는 번호는 건너뛴다", () => {
    expect(parseRosterLines("가나\n다라", "1", { used: [1, 2], start: 1 }).map((s) => s.no)).toEqual([3, 4]);
  });
});
