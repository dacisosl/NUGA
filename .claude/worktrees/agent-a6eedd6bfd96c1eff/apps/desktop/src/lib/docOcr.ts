/**
 * PDF·이미지 → 쪽 이미지 → (교사가 가리기) → 글자 추출.
 *
 * 순서가 중요하다: 가리기가 끝나기 전에는 어떤 글자도 저장하거나 밖으로 보내지 않는다.
 * - 글자층이 있는 PDF: 가린 영역과 겹치는 글자 조각은 버리고 나머지만 이어 붙인다.
 * - 스캔 PDF·사진: 가린 영역을 검게 칠한 이미지로 OCR 한다.
 * 저장하는 파일은 원본이 아니라 가린 첫 쪽의 축소 이미지다.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Rect { x: number; y: number; w: number; h: number }
export interface TextItem extends Rect { str: string }
export interface DocPage { dataUrl: string; width: number; height: number; items: TextItem[] }

const MAX_PAGES = 10;
const TARGET_W = 1400;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** 파일을 쪽 이미지(+ PDF 글자층 좌표)로 펼친다. 글자층은 메모리에만 두고 저장하지 않는다. */
export async function loadDocument(file: File): Promise<{ pages: DocPage[]; truncated: boolean }> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = Math.min(pdf.numPages, MAX_PAGES);
    const pages: DocPage[] = [];
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, TARGET_W / base.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent "print": requestAnimationFrame 없이 그린다 (창이 가려지거나 최소화돼도 멈추지 않음)
      await page.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
      const tc = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        const h = Math.hypot(t[2], t[3]) || 10;
        items.push({ str: it.str, x: t[4], y: t[5] - h, w: Math.max(1, it.width * scale), h: h * 1.15 });
      }
      pages.push({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, items });
    }
    await pdf.destroy();
    return { pages, truncated: pdf.numPages > MAX_PAGES };
  }
  // 이미지 1장
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const img = await loadImage(url);
  const scale = Math.min(1, 2000 / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { pages: [{ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, items: [] }], truncated: false };
}

export function hasTextLayer(page: DocPage): boolean {
  return page.items.reduce((n, i) => n + i.str.replace(/\s/g, "").length, 0) >= 15;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * 자동으로 가릴 곳 찾기 (글자층이 있는 PDF만): 명단의 이름, 5자리 학번, "이름:·성명:" 뒤 값.
 * 글자 조각 안에서 이름 위치를 글자 비율로 잘라 그 부분만 가린다.
 */
export function suggestMasks(pages: DocPage[], names: string[]): Rect[][] {
  const pats = [...new Set(names.filter((n) => n && n.length >= 2))].map(escapeRe);
  const re = new RegExp([...pats, "(?<!\\d)[1-3]\\d{4}(?!\\d)"].join("|"), "g");
  const sub = (it: TextItem, from: number, len: number): Rect => {
    const cw = it.w / Math.max(1, Array.from(it.str).length);
    return { x: it.x + from * cw - 2, y: it.y - 2, w: len * cw + 4, h: it.h + 4 };
  };
  return pages.map((p) => {
    const out: Rect[] = [];
    p.items.forEach((it, idx) => {
      const chars = Array.from(it.str);
      for (const m of it.str.matchAll(re)) out.push(sub(it, Array.from(it.str.slice(0, m.index)).length, Array.from(m[0]).length));
      // 줄바꿈으로 쪼개진 이름: 이 조각 끝 + 다음 조각 앞을 이어서 찾는다 (예: "…주" + "시우는…")
      const next = p.items[idx + 1];
      if (next) {
        const tail = chars.slice(-6).join(""); const head = Array.from(next.str).slice(0, 6).join("");
        const joined = tail + head; const cut = Array.from(tail).length;
        for (const m of joined.matchAll(re)) {
          const st = Array.from(joined.slice(0, m.index)).length; const en = st + Array.from(m[0]).length;
          if (st < cut && en > cut) {
            out.push(sub(it, chars.length - (cut - st), cut - st));
            out.push(sub(next, 0, en - cut));
          }
        }
      }
      // "이름", "성명" 라벨만 있는 조각이면 바로 다음 조각을 가린다
      if (/^(이름|성명|학생명)\s*[:：]?\s*$/.test(it.str.trim()) && next && Math.abs(next.y - it.y) < it.h) out.push({ x: next.x - 2, y: next.y - 2, w: next.w + 4, h: next.h + 4 });
    });
    return out;
  });
}

/** 가린 부분을 검게 칠한 쪽 캔버스 */
export async function maskedCanvas(page: DocPage, masks: Rect[], maxW?: number): Promise<HTMLCanvasElement> {
  const img = await loadImage(page.dataUrl);
  const scale = maxW ? Math.min(1, maxW / page.width) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(page.width * scale); c.height = Math.round(page.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  for (const r of masks) ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  return c;
}

/** 저장용 썸네일: 가린 첫 쪽을 줄인 JPEG */
export async function maskedThumb(page: DocPage, masks: Rect[]): Promise<string> {
  return (await maskedCanvas(page, masks, 900)).toDataURL("image/jpeg", 0.75);
}

/** 글자층 조각을 줄 단위로 이어 붙인다 (가린 조각 제외) */
/** 가린 상자와 겹치는 글자만 ○○○ 로 바꾼다 (조각 전체를 버리지 않음). 전부 가려지면 빈 문자열 */
function maskItem(it: TextItem, masks: Rect[]): string {
  const hit = masks.filter((m) => overlaps(it, m));
  if (!hit.length) return it.str;
  const chars = Array.from(it.str); const cw = it.w / Math.max(1, chars.length);
  let out = ""; let inRun = false; let visible = 0;
  chars.forEach((c, k) => {
    const cx = it.x + (k + 0.5) * cw;
    if (hit.some((m) => cx >= m.x && cx <= m.x + m.w)) { if (!inRun) out += "○○○"; inRun = true; }
    else { out += c; inRun = false; if (c.trim()) visible++; }
  });
  return visible ? out : "";
}

function joinItems(itemsAll: TextItem[], masks: Rect[]): string {
  const kept = itemsAll.map((it) => ({ ...it, str: maskItem(it, masks) })).filter((it) => it.str.trim());
  kept.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of kept) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) < it.h * 0.5) last.push(it); else lines.push([it]);
  }
  return lines.map((ln) => ln.sort((a, b) => a.x - b.x).reduce((s, it, i) => {
    if (i === 0) return it.str;
    const prev = ln[i - 1]; const gap = it.x - (prev.x + prev.w);
    return s + (gap > it.h * 0.25 ? " " : "") + it.str;
  }, "")).join("\n");
}

export interface ExtractProgress { page: number; pages: number; stage: "text" | "ocr"; ratio: number }

/** 가리기가 끝난 뒤에만 호출한다. */
export async function extractText(pages: DocPage[], masks: Rect[][], onProgress?: (p: ExtractProgress) => void): Promise<string> {
  const parts: string[] = [];
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
  let curPage = 0;
  try {
    for (let i = 0; i < pages.length; i++) {
      curPage = i;
      const pg = pages[i]; const m = masks[i] || [];
      if (hasTextLayer(pg)) {
        onProgress?.({ page: i + 1, pages: pages.length, stage: "text", ratio: 1 });
        parts.push(joinItems(pg.items, m));
        continue;
      }
      if (!worker) {
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker("kor+eng", 1, {
          logger: (x: { status: string; progress: number }) => { if (x.status === "recognizing text") onProgress?.({ page: curPage + 1, pages: pages.length, stage: "ocr", ratio: x.progress }); },
        });
      }
      onProgress?.({ page: i + 1, pages: pages.length, stage: "ocr", ratio: 0 });
      const canvas = await maskedCanvas(pg, m);
      const { data } = await worker.recognize(canvas);
      parts.push(String(data.text || ""));
    }
  } finally {
    if (worker) await worker.terminate();
  }
  return parts.map((t) => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()).filter(Boolean).join("\n\n");
}

/** 안전장치: 추출된 글에 남은 명단 이름을 ○○○ 로 바꾼다 */
export function scrubNames(text: string, names: string[]): { text: string; count: number } {
  let count = 0; let out = text;
  for (const n of [...new Set(names)].filter((x) => x && x.length >= 2).sort((a, b) => b.length - a.length)) {
    // 글자 사이 공백·줄바꿈이 끼어도 찾는다 (예: "주⏎시우")
    const re = new RegExp(Array.from(n).map(escapeRe).join("\\s*"), "g");
    out = out.replace(re, () => { count++; return "○".repeat(Math.min(3, Array.from(n).length)); });
  }
  return { text: out, count };
}

/** 추출 글에서 초안에 쓸 발췌(앞부분 요약)를 뽑는다 */
export function makeExcerpt(text: string, max = 140): string {
  // 가린 자리만 남은 줄("학번 ○○○ 성명 ○○○")과 ○○○ 는 발췌에서 뺀다
  const lines = text.split(/\n/).filter((ln) => ln.replace(/(학번|성명|이름|번호|반|학년)\s*[:：]?|○+|\s/g, "").length > 0);
  const flat = lines.join(" ").replace(/○+/g, "").replace(/\s+/g, " ").trim();
  return Array.from(flat).length > max ? Array.from(flat).slice(0, max - 1).join("") + "…" : flat;
}
