// 소개 페이지 '웨일 연계' 화면의 사진 4장을 실제 앱의 웨일 모드에서 찍는다 (서비스마다 1장, 시계 2026-10-28(수) 10:05 고정).
//   1) 앱 개발 서버: npm run dev -w @nuga/desktop        (http://localhost:1420, 다른 주소면 NUGA_APP)
//   2) node apps/landing/video/capture-whale.mjs          → apps/landing/assets/whale-1.jpg … whale-4.jpg
//      1 웨일 스페이스 · 2 웨일 클래스 · 3 팀보드 · 4 웨일 브라우저(큰 창 + 사이드바)
// 처음 방문한 브라우저로 ?whale=1 에 들어가 탭을 클릭으로 진행한다.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = (process.env.NUGA_APP || "http://localhost:1420/").replace(/\/?$/, "/");
const shotsDir = path.join(here, "shots");
const assets = path.join(here, "..", "assets");
fs.mkdirSync(shotsDir, { recursive: true });

// 수요일 2교시(09:50–10:40)가 진행 중인 시각: 모바일 화면 '지금 수업 2-3 · 2교시'
const CLOCK = "2026-10-28T10:05:00+09:00";
const clockShim = `(() => { const R = Date, OFF = new R(${JSON.stringify(CLOCK)}).getTime() - R.now();
  class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + OFF])); } static now() { return R.now() + OFF; } }
  window.Date = D; })();`;
const browser = await launch();
try {
  const page = await browser.newPage(1440, 900, 2);
  await page.setTimezone("Asia/Seoul");
  await page.addInitScript(clockShim);
  await page.goto(`${APP}?whale=1`);
  await page.waitFor("document.querySelector('.whale-tour .wt-b h2')", 40000);
  await page.eval("document.fonts.ready.then(() => true)");
  await sleep(2500);
  await page.eval(`(() => {
    window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.tab = async (i) => { document.querySelectorAll('.wt-steps button')[i].click(); await wait(800); return true; };
    window.byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
    // 칸 안의 '해 보기'를 맨 위로
    window.tryIt = () => { const b = document.querySelector('.wt-b'); const t = document.querySelector('.wt-sec[aria-label="해 보기"]'); b.scrollTop = t.offsetTop - b.offsetTop - 8; return true; };
    return true;
  })()`);
  const shot = async (p, name) => { await p.send("Page.bringToFront"); fs.writeFileSync(path.join(shotsDir, `${name}.png`), await p.screenshot()); console.log(`  ${name}`); };
  const settle = () => sleep(5500); // 알림이 사라지도록

  // 1. 웨일 스페이스: 관리자 명단 파일 → 2-7 25명 (왼쪽 반·명단)
  await page.eval("(async () => { await tab(1); byText('.wt-ex .btn', '누가로 가져오기').click(); await wait(600); byText('.wt-ex .btn', '교사 계정으로').click(); await wait(400); return true; })()");
  await settle(); await page.eval("tryIt()"); await sleep(400);
  await shot(page, "whale-space");

  // 2. 웨일 클래스: 퀴즈 응답 두 개를 근거 후보로 → 왼쪽 계단의 출발선이 준다
  await page.eval(`(async () => { await tab(2);
    document.querySelectorAll('.wt-quiz .btn.primary')[0].click(); await wait(300); document.querySelectorAll('.wt-quiz .btn.primary')[0].click(); await wait(300); return true; })()`);
  await settle(); await page.eval("tryIt()"); await sleep(400);
  await shot(page, "whale-class");

  // 3. 팀보드: 모둠 보드의 스티키 노트 (작성자 이름 · 모둠 결과물은 보내지 않음)
  await page.eval("(async () => { await tab(3); return true; })()");
  await sleep(600); await page.eval("tryIt()"); await sleep(400);
  await shot(page, "whale-board");

  // 4. 웨일 브라우저 (마지막에 찍는다: 사이드바 창을 열면 큰 창이 뒤로 가 그려지지 않으므로)
  //    큰 창(현황판, 웨일 칸 접음, 1032px) + 웨일 사이드바(408px)의 모바일 화면
  await page.eval("(async () => { await tab(4); byText('.wt-h button', '–')?.click(); await wait(800); return true; })()");
  await page.setViewport(1032, 900, 2);
  await page.eval("(async () => { const p = document.querySelector('.wt-pill'); if (p) p.style.visibility = 'hidden'; await wait(800); return true; })()");
  await shot(page, "whale-main");
  const side = await browser.newPage(408, 900, 2);
  await side.setTimezone("Asia/Seoul");
  await side.addInitScript(clockShim);
  await side.goto(`${APP}?panel=sidebar`);
  await side.waitFor("document.querySelector('.mp-reel-row')", 30000);
  await side.eval("document.fonts.ready.then(() => true)");
  await sleep(1500);
  await shot(side, "whale-side");
} finally { await browser.close(); }

// 1600×1000 JPEG 4장. 4번은 큰 창 + 사이드바를 나란히 (사이에 1px 선)
const ff = (args) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" }); if (r.status) throw new Error("ffmpeg 실패"); };
const S = (n) => path.join(shotsDir, `${n}.png`);
const out = (n) => path.join(assets, `whale-${n}.jpg`);
ff(["-i", S("whale-main"), "-i", S("whale-side"), "-filter_complex", "[0]crop=iw-2:ih:0:0,pad=iw+2:ih:0:0:color=0x2a3f5c[a];[a][1]hstack,scale=1600:1000:flags=lanczos,format=yuvj420p", "-q:v", "4", out(4)]);
for (const [n, name] of [[1, "whale-space"], [2, "whale-class"], [3, "whale-board"]]) ff(["-i", S(name), "-vf", "scale=1600:1000:flags=lanczos,format=yuvj420p", "-q:v", "4", out(n)]);
for (let n = 1; n <= 4; n++) console.log(`whale-${n}.jpg ${Math.round(fs.statSync(out(n)).size / 1024)}KB`);
