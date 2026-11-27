// 부스에서 계속 틀어 둘 '체험하기' 시연 영상.
// 실제 체험 페이지(trial/?booth=1)를 사람이 하듯 눌러 가며 화면을 그대로 녹화하고(커서 · 누름 표시만 덧붙임),
// '처음으로'를 눌러 첫 화면이 다시 그려진 1초 뒤에서 자르므로 처음과 끝이 같은 장면이라 반복 재생이 끊기지 않는다.
//   node apps/landing/video/trial-loop.mjs                       → video/out/trial-loop.mp4
//   node apps/landing/video/trial-loop.mjs --out D:/booth.mp4 --crf 20
// 필요: Node 22+, Chrome(또는 Edge, CHROME_PATH), ffmpeg (PATH). 녹화는 실제 시간으로 약 1분 30초 걸린다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const FPS = 30, W = 1920, H = 1080;
const outDir = path.join(here, "out");
const out = opt("out", path.join(outDir, "trial-loop.mp4"));
fs.mkdirSync(outDir, { recursive: true });
// 녹화 프레임은 실행마다 새 임시 폴더에 두고, 끝나면 그 파일만 하나씩 지운다
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "nuga-trial-loop-"));
// 시연 기록: 수업 영상 속 5번 학생의 말(요일을 나눠 쓰자)을 쉬는 시간에 한 줄로
const NOTE = opt("note", "친구 의견을 이어받아 요일을 나눠 쓰자는 대안을 냄");

/* ---------- 정적 서버 (영상 이어 받기용 Range 지원) ---------- */
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".mp4": "video/mp4" };
const server = http.createServer((req, res) => {
  let file;
  try { file = path.join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname)); } catch { res.writeHead(400); return res.end(); }
  const rel = path.relative(repo, file);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size, type = types[path.extname(file)] || "application/octet-stream";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (m) {
    const start = m[1] ? Number(m[1]) : 0, end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch();

/* ---------- 커서 · 누름 표시 (화면에만 덧붙이고 체험 페이지 코드는 건드리지 않는다) ---------- */
const CURSOR = `(() => {
  const st = document.createElement('style');
  st.textContent = '#dcur{position:fixed;left:50%;top:60%;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;background:rgba(255,255,255,.3);border:3px solid #fff;box-shadow:0 0 0 2px rgba(11,29,51,.35),0 8px 20px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none;opacity:0;transition:left .75s cubic-bezier(.3,.7,.2,1),top .75s cubic-bezier(.3,.7,.2,1),transform .14s,opacity .3s}'
    + '#dcur.on{opacity:1}#dcur.press{transform:scale(.72)}'
    + '.dring{position:fixed;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:3px solid #fff;z-index:2147483646;pointer-events:none;animation:dring .6s ease-out forwards}'
    + '@keyframes dring{to{transform:scale(2.6);opacity:0}}';
  document.head.append(st);
  const c = document.createElement('div'); c.id = 'dcur'; document.body.append(c);
  return true;
})()`;

try {
  const p = await browser.newPage(W, H, 1);
  await p.goto(`http://127.0.0.1:${server.address().port}/apps/landing/trial/?booth=1`);
  await p.waitFor("typeof go === 'function' && typeof reset === 'function'", 30000);
  await p.eval("document.fonts.ready.then(() => true)");
  await p.eval(CURSOR);
  await sleep(1500);

  const scene = () => p.eval("document.querySelector('#stage').dataset.scene");
  const waitScene = (id, t = 20000) => p.waitFor(`document.querySelector('#stage').dataset.scene === '${id}'`, t);
  async function tap(sel, { after = 400 } = {}) {
    const r = await p.rect(sel);
    if (!r || !r.width) throw new Error(`누를 곳이 없음: ${sel} (장면 ${await scene()})`);
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    await p.eval(`(() => { const c = document.getElementById('dcur'); c.classList.add('on'); c.style.left = '${x}px'; c.style.top = '${y}px'; return true; })()`);
    await sleep(800);
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(160);
    await p.eval(`(() => { const c = document.getElementById('dcur'); c.classList.add('press'); const g = document.createElement('div'); g.className = 'dring'; g.style.left = '${x}px'; g.style.top = '${y}px'; document.body.append(g); setTimeout(() => g.remove(), 700); return true; })()`);
    await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(90);
    await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await p.eval("document.getElementById('dcur').classList.remove('press'), true");
    await sleep(after);
  }
  async function type(text, gap = 95) {
    for (const ch of text) { await p.send("Input.insertText", { text: ch }); await sleep(ch === " " ? gap * 0.6 : gap); }
  }

  /* ---------- 녹화 ---------- */
  const frames = [];
  let recording = true, n = 0;
  (async () => {
    while (recording) {
      const f = await p.once("Page.screencastFrame");
      p.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      if (!recording) break;
      const file = path.join(frameDir, `${String(n++).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      frames.push({ t: f.metadata.timestamp, file });
    }
  })();
  await p.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(600);

  // 0 · 첫 화면 (여기서 1초 뒤가 영상의 처음)
  const tStart = Date.now() / 1000;
  await p.eval("reset(), true");
  console.log("첫 화면");
  await sleep(4200);
  await tap('.modes button[data-m="mobile"]', { after: 200 });

  // 1 · 수업 중 영상 → 폰에서 말한 학생(5번) → 저장
  await waitScene("m-phone");
  console.log("수업 중 · 폰");
  await p.waitFor("document.querySelector('#phhalf')?.classList.contains('ready')", 20000);
  await sleep(700);
  await tap('#pgrid .pc[data-i="4"]', { after: 900 });
  await tap("#psave", { after: 200 });

  // 2 · 쉬는 시간: PC 의 쉬는 시간 기록 창에 한 줄
  await waitScene("m-desk");
  console.log("쉬는 시간 기록");
  await sleep(2600);
  await tap("#note", { after: 300 });
  await type(NOTE);
  await sleep(900);
  await tap("#nsave", { after: 1700 });
  await tap("#tuok", { after: 200 });

  // 3 · 한눈에: 기록이 학생 카드로 → 반 전체
  await waitScene("board");
  console.log("한눈에");
  await sleep(6800);
  await tap("#mkdraft", { after: 200 });

  // 4 · 생기부 초안
  await waitScene("draft");
  console.log("생기부");
  await sleep(1100);
  await tap("#gen", { after: 200 });
  await p.waitFor("!!document.querySelector('#tobatch')", 30000);
  await sleep(3600);
  await tap("#tobatch", { after: 200 });

  // 5 · 반 전체 일괄 작성
  await waitScene("batch");
  console.log("일괄 작성");
  await p.waitFor("!document.querySelector('#btnext').hidden", 30000);
  await sleep(1600);
  await tap("#btnext", { after: 200 });

  // 6 · 강점 3가지 (+ 투표 부탁)
  await waitScene("points");
  console.log("강점 3가지");
  await sleep(6500);
  await tap("#totalk", { after: 200 });

  // 7 · 상담: 막연한 대답 → [누가기록!] → 근거 있는 대답
  await waitScene("talk");
  console.log("상담");
  await sleep(2600);
  for (let i = 0; i < 3; i++) await tap("#tnext", { after: 2300 });
  await tap("#tnext", { after: 1700 });
  await tap("#nuga", { after: 3800 });
  await tap("#tnext", { after: 4200 });

  // 8 · 처음으로 → 첫 화면이 다시 그려진 1초 뒤에서 끝 (영상의 처음과 같은 장면)
  const r = await p.rect("#home");
  const hx = Math.round(r.x + r.width / 2), hy = Math.round(r.y + r.height / 2);
  await tap("#home", { after: 0 });
  const tHome = Date.now() / 1000;
  await p.eval("document.getElementById('dcur').classList.remove('on'), true");
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hx, y: hy });
  console.log("처음으로");
  await sleep(1800);
  recording = false;
  await p.send("Page.stopScreencast");
  await sleep(300);

  /* ---------- 같은 간격(30fps)으로 다시 놓아 MP4 로 ---------- */
  // 영상의 처음 = 첫 화면이 그려지고 1초 뒤, 끝 = '처음으로'로 첫 화면이 다시 그려지고 1초 뒤 (같은 장면)
  const t0 = tStart + 1.0, t1 = tHome - 0.05 + 1.0;   // '처음으로'는 누름 처리 직전에 그려진다
  const count = Math.round((t1 - t0) * FPS);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", opt("crf", "21"), "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
  let j = 0;
  for (let k = 0; k < count; k++) {
    const t = t0 + k / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
    if (!ff.stdin.write(fs.readFileSync(frames[j].file))) await new Promise((res) => ff.stdin.once("drain", res));
  }
  ff.stdin.end();
  await new Promise((res) => ff.on("close", res));
  const span = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  console.log(`${out}\n${(count / FPS).toFixed(1)}초 · 녹화 프레임 ${frames.length}장 (평균 ${(frames.length / span).toFixed(1)}fps)`);
  p.close();
  for (const f of frames) fs.unlinkSync(f.file);
} finally {
  await browser.close();
  server.close();
  try { for (const f of fs.readdirSync(frameDir)) fs.unlinkSync(path.join(frameDir, f)); fs.rmdirSync(frameDir); } catch {}
}
