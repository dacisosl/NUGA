// 부스 시연 영상에 체험 QR 을 계속 띄운다.
// 녹화한 체험 화면(trial-loop.mp4)을 오른쪽에 조금 줄여(0.8125 배) 놓고, 비는 왼쪽 위에 '내 폰으로 직접 체험하기' QR 카드를 둔다.
// QR 을 체험 화면 위에 얹지 않으므로 제목·버튼·인물을 가리지 않는다. QR 은 trial/assets/qr-trial.svg (https://dacisosl.github.io/NUGA/trial/).
//   node apps/landing/video/trial-loop-qr.mjs                         → out/trial-loop.mp4 를 읽어 out/trial-loop-qr.mp4
//   node apps/landing/video/trial-loop-qr.mjs D:/rec.mp4 --out D:/booth.mp4
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const inp = args[0] && !args[0].startsWith("--") ? args[0] : path.join(here, "out", "trial-loop.mp4");
const out = opt("out", path.join(here, "out", "trial-loop-qr.mp4"));
const F = { x: 330, y: 100, w: 1560, h: 878 };   // 체험 화면 자리 (16:9)

const qr = fs.readFileSync(path.join(here, "../trial/assets/qr-trial.svg"), "utf8");
const font = pathToFileURL(path.join(repo, "apps/desktop/public/fonts/PretendardVariable.woff2")).href;
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
@font-face{font-family:P;src:url("${font}") format("woff2");font-weight:45 920}
html,body{margin:0}
body{position:relative;width:1920px;height:1080px;overflow:hidden;font-family:P,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(ellipse 55% 75% at 9% 32%,#17345a 0%,#0b1a2c 55%,#081422 100%)}
.frame{position:absolute;left:${F.x - 3}px;top:${F.y - 3}px;width:${F.w + 6}px;height:${F.h + 6}px;border-radius:8px;background:#081422;box-shadow:0 0 0 1.5px rgba(171,201,241,.32),0 30px 80px rgba(0,0,0,.55)}
.card{position:absolute;left:34px;top:${F.y}px;width:262px;box-sizing:border-box;padding:20px 20px 18px;border-radius:24px;background:#fff;box-shadow:0 0 0 4px #ffd76a,0 22px 56px rgba(0,0,0,.5)}
.card svg{display:block;width:222px;height:222px}
.card b{display:block;margin-top:14px;text-align:center;font-size:30px;font-weight:850;letter-spacing:-.045em;line-height:1.22;color:#0b1d33}
.sub{position:absolute;left:34px;top:${F.y + 404}px;width:262px;margin:0;text-align:center;font-size:20px;font-weight:650;line-height:1.5;color:#a3b7d2;letter-spacing:-.03em}
.sub em{font-style:normal;color:#eaf2ff;font-weight:800}
.brand{position:absolute;left:34px;bottom:${1080 - F.y - F.h}px;width:262px;display:flex;align-items:center;justify-content:center;gap:10px;color:#eaf2ff;font-size:30px;font-weight:850;letter-spacing:-.04em}
.brand svg{width:30px;height:30px;color:#accdff}
.brand span{font-size:15px;font-weight:750;color:#081422;background:#accdff;padding:3px 10px;border-radius:999px;letter-spacing:0}
</style><body><div class="frame"></div>
<div class="card">${qr}<b>내 폰으로<br>직접 체험하기</b></div>
<p class="sub">카메라로 찍으면<br><em>약 1분</em> 체험이 바로 시작돼요</p>
<div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25h7v-7h7v-7h8" fill="none" stroke="currentColor" stroke-width="3"/></svg>누가<span>체험</span></div>
</body></html>`;

// 왼쪽 판(정지 그림)을 크롬으로 그린다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nuga-qr-panel-"));
const htmlFile = path.join(tmp, "panel.html"), png = path.join(tmp, "panel.png");
fs.writeFileSync(htmlFile, html);
const browser = await launch();
try {
  const p = await browser.newPage(1920, 1080, 1);
  await p.goto(pathToFileURL(htmlFile).href);
  await p.eval("document.fonts.ready.then(() => true)");
  await sleep(300);
  fs.writeFileSync(png, await p.screenshot());
  p.close();
} finally { await browser.close(); }

// 판 위에 체험 화면을 얹는다 (판은 TV 색 범위 · BT.709 로 바꿔 체험 화면과 색을 맞춘다)
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-i", png, "-i", inp,
  "-filter_complex", `[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[bg];[1:v]scale=${F.w}:${F.h}:flags=lanczos[t];[bg][t]overlay=${F.x}:${F.y}:shortest=1,format=yuv420p`,
  "-c:v", "libx264", "-preset", "slow", "-crf", opt("crf", "21"), "-pix_fmt", "yuv420p",
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  "-movflags", "+faststart", "-an", out], { stdio: "inherit" });
fs.unlinkSync(htmlFile); fs.unlinkSync(png); fs.rmdirSync(tmp);
if (r.status !== 0) throw new Error("ffmpeg 실패");
console.log(out);
