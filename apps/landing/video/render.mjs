// 장면(HTML)을 프레임마다 찍어 ffmpeg 로 MP4 를 만든다.
//   node apps/landing/video/render.mjs manual --poster 3.6     → video/out/record-manual.mp4 + record-manual-poster.jpg
//   node apps/landing/video/render.mjs auto --crf 25           → video/out/record-auto.mp4
//   node apps/landing/video/render.mjs manual --stills 2,9,19  → 그 시각의 장면만 JPG 로 (빠르게 살펴보기)
// 필요: Node 22+, Chrome(또는 Edge, CHROME_PATH 로 지정 가능), ffmpeg (PATH). 장면이 쓰는 앱 화면은 먼저 capture.mjs 로 찍어 둔다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--")) || "manual";
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const fps = Number(opt("fps", 30));
const from = Number(opt("from", 0));
const until = opt("until", null);
const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });
const out = opt("out", path.join(outDir, `record-${name}.mp4`));
// 무대는 1920×1080 으로 그리고, 소개 페이지에는 1280×720 이면 충분하다 (--size 1920x1080 으로 바꿀 수 있음)
const [ow, oh] = opt("size", "1280x720").split("x").map(Number);

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let file;
  try { file = path.join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname)); } catch { res.writeHead(400); return res.end(); }
  const rel = path.relative(repo, file);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launch();

/** 1920×1080 JPEG 한 장을 출력 크기로 줄여 저장 (포스터·살펴보기용) */
function saveScaled(jpg, file, q = 4) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-i", "-", "-vf", `scale=${ow}:${oh}:flags=lanczos`, "-q:v", String(q), file], { input: jpg });
  if (r.status !== 0) fs.writeFileSync(file, jpg);
}

try {
  const page = await browser.newPage(1920, 1080, 1);
  await page.goto(`http://127.0.0.1:${port}/apps/landing/video/${name}.html`);
  await page.waitFor("window.sceneReady === true", 60000);
  const duration = await page.eval("window.duration");

  const stills = opt("stills", null);
  if (stills) {
    for (const t of stills.split(",").map(Number)) {
      await page.eval(`window.renderAt(${t})`);
      const file = path.join(outDir, `${name}-t${t.toFixed(1)}.jpg`);
      fs.writeFileSync(file, await page.screenshot({ format: "jpeg", quality: 85 }));
      console.log(file);
    }
  } else {
    const end = until ? Number(until) : duration;
    const frames = Math.round((end - from) * fps);
    // 색 범위는 TV(16–235)·BT.709 로 명시한다. 그대로 두면 JPEG 의 full range 가 따라와 브라우저에서 검정이 뭉개진다
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      "-vf", `scale=${ow}:${oh}:flags=lanczos:out_range=tv:out_color_matrix=bt709,format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", opt("crf", "22"), "-pix_fmt", "yuv420p",
      "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
    const started = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.eval(`window.renderAt(${(from + f / fps).toFixed(4)})`);
      const jpg = await page.screenshot({ format: "jpeg", quality: 95 });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % fps === 0) process.stdout.write(`\r${name}: ${(f / fps).toFixed(0)}s / ${(frames / fps).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
    // 포스터: 재생 전에 보이는 장면 (--poster 초, 기본 1초). 영상과 같은 크기로
    await page.eval(`window.renderAt(${Number(opt("poster", 1))})`);
    saveScaled(await page.screenshot({ format: "jpeg", quality: 95 }), out.replace(/\.mp4$/, "-poster.jpg"));
    console.log(`\n${out} (${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  page.close();
} finally {
  await browser.close();
  server.close();
}
