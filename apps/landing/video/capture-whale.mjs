// 소개 페이지 '웨일 연계' 화면의 사진 4장을 실제 앱의 웨일 모드에서 찍는다 (시계 2026-10-28(수) 10:05 고정).
//   1) 앱 개발 서버: npm run dev -w @nuga/desktop        (http://localhost:1420, 다른 주소면 NUGA_APP)
//   2) node apps/landing/video/capture-whale.mjs          → apps/landing/assets/whale-1.jpg … whale-4.jpg
// 처음 방문한 브라우저로 ?whale=1 에 들어가 웨일 모드의 장면을 클릭·입력으로 진행한다.
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
const NOTE = "촉매가 평형 위치에 주는 영향을 스스로 조사해 발표함";
/** 웨일 클래스 응답(메모) → 선생님이 남기는 한 줄 */
const QUIZ_LINES = [["1차 오답", "평형 상태를 양이 같은 상태로 본 생각을 스스로 고침"], ["질문 남김", "촉매가 평형 위치에 주는 영향을 질문함"]];

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
    window.step = async (i) => { document.querySelectorAll('.wt-steps button')[i].click(); await wait(700); return true; };
    window.byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
    return true;
  })()`);
  const shot = async (p, name) => { await p.send("Page.bringToFront"); fs.writeFileSync(path.join(shotsDir, `${name}.png`), await p.screenshot()); console.log(`  ${name}`); };

  // 수업 중: 수업관리 칸 두 개(14 · 7번)를 누른다 → 쉬는 시간 기록 창에 같이 모인다
  await page.eval("(async () => { await step(1); document.querySelectorAll('.wt-tile')[13].click(); await wait(300); document.querySelectorAll('.wt-tile')[6].click(); await wait(400); return true; })()");
  await sleep(5500); // 토스트가 사라지도록

  // 2. 쉬는 시간: 웨일 클래스 응답 두 개를 보내고 '쉬는 시간 기록' 창
  await page.eval(`(async () => { await step(2);
    document.querySelectorAll('.wt-quiz .btn.primary')[0].click(); await wait(300); document.querySelectorAll('.wt-quiz .btn.primary')[0].click(); await wait(300);
    document.querySelector('.wt-act .btn.primary').click(); await wait(2500); return true; })()`);
  await shot(page, "whale-inbox");

  // 쉬는 시간 기록 창에서 웨일 클래스 응답 두 건을 선생님이 한 줄로 남긴다 (생기부 근거에는 선생님 문장이 들어가게)
  await page.eval(`(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    for (const [memo, line] of ${JSON.stringify(QUIZ_LINES)}) {
      const ta = [...document.querySelectorAll('.ib-item.man')].find((c) => c.textContent.includes(memo))?.querySelector('textarea');
      if (!ta) continue;
      set.call(ta, line); ta.dispatchEvent(new Event('input', { bubbles: true })); await wait(150);
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(700);
    }
    return true; })()`);

  // 3. 방과 후: 카드 → 학생 웨일 → [도전해 볼게요] → 기록 창에 한 줄 → 고리가 닫힘
  await page.eval(`(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(500);
    byText('.modal .btn', '닫기')?.click(); await wait(400); await step(3);
    document.querySelector('.wt-ex .btn.primary').click(); await wait(400); document.querySelector('.wt-phone .btn.primary').click(); await wait(400);
    document.querySelector('.wt-call .btn').click(); await wait(700);
    const ta = document.querySelector('.modal textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, ${JSON.stringify(NOTE)}); ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(800);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(400);
    document.querySelector('.modal .close, .modal [aria-label="닫기"]')?.click(); await wait(5500); return !!byText('.wt-call', '한 바퀴'); })()`);
  await shot(page, "whale-loop");

  // 4. 학기 말: 그 학생의 생기부 생성 화면 (듀얼탭으로 여는 화면)
  await page.eval("(async () => { await step(4); await wait(1500); return true; })()");
  await shot(page, "whale-draft");
  // 1. 수업 중 (마지막에 찍는다: 사이드바 창을 열면 큰 창이 뒤로 가 그려지지 않으므로)
  //    큰 창(현황판, 웨일 칸 접음, 1032px) + 웨일 사이드바(408px)의 모바일 화면
  await page.eval("(async () => { await step(1); byText('.wt-h button', '–')?.click(); await wait(800); return true; })()");
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

// 1600×1000 JPEG 4장. 1번은 큰 창 + 사이드바를 나란히 (사이에 1px 선)
const ff = (args) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" }); if (r.status) throw new Error("ffmpeg 실패"); };
const S = (n) => path.join(shotsDir, `${n}.png`);
const out = (n) => path.join(assets, `whale-${n}.jpg`);
ff(["-i", S("whale-main"), "-i", S("whale-side"), "-filter_complex", "[0]crop=iw-2:ih:0:0,pad=iw+2:ih:0:0:color=0x2a3f5c[a];[a][1]hstack,scale=1600:1000:flags=lanczos,format=yuvj420p", "-q:v", "4", out(1)]);
for (const [n, name] of [[2, "whale-inbox"], [3, "whale-loop"], [4, "whale-draft"]]) ff(["-i", S(name), "-vf", "scale=1600:1000:flags=lanczos,format=yuvj420p", "-q:v", "4", out(n)]);
for (let n = 1; n <= 4; n++) console.log(`whale-${n}.jpg ${Math.round(fs.statSync(out(n)).size / 1024)}KB`);
