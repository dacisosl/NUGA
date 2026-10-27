// 소개 영상에 쓸 실제 앱 화면을 찍는다 (데모 모드, 시계를 2026-10-28(수) 10:05 로 고정해 언제 찍어도 같은 화면).
//   1) 앱 개발 서버: npm run dev -w @nuga/desktop        (http://localhost:1420)
//   2) node apps/landing/video/capture.mjs [manual|auto]  → apps/landing/video/shots/*.png + manifest.json
// 화면 조작은 클릭·입력·Enter 로 하고, 계단의 '도착' 순간처럼 시점을 맞춰야 하는 곳만 앱 모듈(store)을 직접 부른다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.NUGA_APP || "http://localhost:1420/";
const shotsDir = path.join(here, "shots");
fs.mkdirSync(shotsDir, { recursive: true });
const manifestPath = path.join(shotsDir, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const which = process.argv[2] || "all";

// 수요일 2교시(09:50–10:40)가 진행 중인 시각: 모바일 화면 '지금 수업 2-3 · 2교시', 데모 수업 녹음도 오늘 09:51
const CLOCK = "2026-10-28T10:05:00+09:00";
const clockShim = `(() => { const R = Date, OFF = new R(${JSON.stringify(CLOCK)}).getTime() - R.now();
  class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + OFF])); } static now() { return R.now() + OFF; } }
  window.Date = D; })();`;

const TYPED = "르샤틀리에 원리를 온도 실험 결과와 연결해 질문함";
const ARRIVAL = "수업 스크립트 1건 도착 — 2-3 2교시";

async function open(port) {
  const browser = await launch({ port });
  const page = await browser.newPage(1440, 900, 2);
  await page.setTimezone("Asia/Seoul");
  await page.addInitScript(clockShim);
  await page.goto(APP);
  await page.waitFor("document.querySelector('.onb-cta.main')", 30000);
  await sleep(800);
  await page.eval("document.querySelector('.onb-cta.main').click()");
  await page.waitFor("document.querySelector('.topnav')", 30000);
  await page.eval("document.fonts.ready.then(() => true)");
  await sleep(2000);
  // 앱이 쓰는 것과 같은 모듈 인스턴스 (Vite 개발 서버 주소)
  await page.eval(`(async () => {
    window.S = (await import('/src/store.ts')).useStore;
    window.T = (await import('/src/lib/transcripts.ts')).useTranscripts;
    window.Demo = await import('/src/lib/demo.ts');
    window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.frames2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.rectOf = (e, o) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x - (o?.x || 0), y: r.y - (o?.y || 0), width: r.width, height: r.height }; };
    window.byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
    const ts = T.getState(); if (!ts.loaded) await ts.load();
    return true;
  })()`);
  return { browser, page };
}

/** 찍어서 저장하고 manifest 에 크기·요소 위치를 적는다. rects 는 페이지에서 계산할 식 (clip 기준 좌표) */
async function shot(page, group, name, { clip, rects = {} } = {}) {
  const buf = await page.screenshot({ clip });
  fs.writeFileSync(path.join(shotsDir, `${name}.png`), buf);
  const o = clip ? JSON.stringify({ x: clip.x, y: clip.y }) : "null";
  const found = {};
  for (const [k, expr] of Object.entries(rects)) found[k] = await page.eval(`rectOf(${expr}, ${o})`);
  const size = clip ? { width: clip.width, height: clip.height } : await page.eval("({ width: innerWidth, height: innerHeight })");
  manifest[group][name] = { file: `${name}.png`, ...size, rects: found };
  console.log(`  ${name}`, Object.entries(found).map(([k, r]) => `${k}=${r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "없음"}`).join(" "));
}

async function setStairs(page, label) {
  await page.eval(`(async () => { S.getState().setPage('main'); await wait(500); byText('.sp-seg button', ${JSON.stringify(label)})?.click(); await wait(1600); return true; })()`);
}

const plateOf = (name) => `[...document.querySelectorAll('.plate')].find((p) => p.textContent.includes(${JSON.stringify(name)}))`;

/** 기록을 지웠다가 같은 내용으로 다시 넣어, 앱의 '도착' 고리가 뜨는 순간을 멈춰 찍는다 (계단은 자세히 보기로 열려 있어야 함) */
async function climb(page, group, prefix, find, studentName) {
  await page.eval(`(async () => { const st = S.getState(); const rec = ${find}; window.__rec = { ...rec }; st.deleteRecord(rec.id); await wait(1700); return true; })()`);
  await shot(page, group, `${prefix}-before`, { rects: { plate: plateOf(studentName), stage: "document.querySelector('.stairs-stage')" } });
  const ok = await page.eval(`(async () => {
    const { id, createdAt, updatedAt, ...fields } = window.__rec;
    window.__climbed = S.getState().addRecord(fields).id;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const p = document.querySelector('.plate.arrive');
      const a = p?.getAnimations({ subtree: true }).find((x) => x.animationName === 'stairs-arrive');
      if (a) { p.getAnimations({ subtree: true }).forEach((x) => { x.pause(); x.currentTime = 300; }); return true; }
      await wait(4);
    }
    return false;
  })()`);
  await shot(page, group, `${prefix}-arrive`, { rects: { plate: plateOf(studentName), stage: "document.querySelector('.stairs-stage')" } });
  if (!ok) console.log("  (도착 고리를 잡지 못함: 위 화면은 도착 직후 상태)");
  await sleep(1800);
  await shot(page, group, `${prefix}-after`, { rects: { plate: plateOf(studentName), stage: "document.querySelector('.stairs-stage')" } });
}

async function manual() {
  console.log("방법 1 · 수동 기록");
  const g = "manual";
  manifest[g] = { clock: CLOCK, typed: TYPED };
  const { browser, page } = await open(9351);
  // 녹음을 쓰지 않는 교사의 하루: 데모 수업 스크립트를 지워 PC 창의 자동 추천 칸이 '녹음 없음'이 되게 한다
  await page.eval("(async () => { const d = Demo.demoInfo(); if (d) await T.getState().remove(d.transcriptId); return true; })()");

  await setStairs(page, "간략히");
  await shot(page, g, "m-stairs-brief-before", { rects: { chip: "byText('.sb-name', '설유진')", stage: "document.querySelector('.sb-stage')" } });
  await setStairs(page, "자세히");
  await shot(page, g, "m-stairs-full-before0", { rects: { plate: plateOf("설유진"), stage: "document.querySelector('.stairs-stage')" } });

  // 모바일 화면 (앱이 PC에서 그리는 폰 화면: 상태 표시줄·시계 포함)
  await page.setViewport(1440, 1000, 2);
  await page.eval("(async () => { S.getState().setPage('mobile'); await wait(900); return true; })()");
  const phone = await page.rect(".mp-phone");
  const phoneRects = { reel: "document.querySelector('.mp-reel')", plate: "document.querySelector('.mp-reel-plate')", save: "document.querySelector('.mp-btn.save')", head: "document.querySelector('.mp-head')", chips: "document.querySelector('.mp-sheet-classes')" };
  manifest[g].phoneHeader = await page.eval("document.querySelector('.mp-head')?.innerText");
  await shot(page, g, "m-phone-idle", { clip: phone, rects: phoneRects });
  // 번호 릴을 1 → 14 로 굴린다 (끌기 상태로 한 칸씩 멈추지 않게)
  await page.eval("document.querySelector('.mp-reel-scroll').classList.add('drag'); true");
  const ROLL = 36;
  for (let i = 1; i <= ROLL; i++) {
    const x = i / ROLL, e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    await page.eval(`(async () => { document.querySelector('.mp-reel-scroll').scrollTop = ${Math.round(13 * 56 * e)}; await frames2(); return true; })()`);
    await shot(page, g, `m-phone-roll-${String(i).padStart(2, "0")}`, { clip: phone });
  }
  await page.eval(`(async () => { const s = document.querySelector('.mp-reel-scroll'); s.classList.remove('drag'); s.scrollTop = 728; document.querySelector('.mp-reel-row[title="14번 고르기"]').click(); await wait(800); return document.querySelector('.mp-btn.save').textContent; })()`);
  await shot(page, g, "m-phone-14", { clip: phone, rects: phoneRects });
  // [저장 · 14번]: 폰에서 누른 것처럼 저장만 하고, PC 쪽 즉시 팝업은 닫아 둔다 (교사가 자리에 앉을 때 다시 연다)
  await page.eval("document.querySelector('.mp-btn.save').click(); S.getState().closeInbox(); true");
  await sleep(450);
  await shot(page, g, "m-phone-saved", { clip: phone, rects: { ...phoneRects, snack: "document.querySelector('.mp-snack')" } });

  // 폰 기록이 PC에 도착한 순간 계단이 한 칸 오른다 (앱은 보완 전 기록도 센다). 도착 고리를 찍으려고 계단을 연 채 기록을 다시 넣는다
  await page.setViewport(1440, 900, 2);
  await setStairs(page, "자세히");
  await climb(page, g, "m-stairs-full", "st.doc.records.filter((r) => r.source === 'phone' && r.class === '2-3' && r.no === 14).pop()", "설유진");
  manifest[g].arrivedRecord = await page.eval("(() => { const r = S.getState().doc.records.find((x) => x.id === window.__climbed); return r && { status: r.status, category: r.category, note: r.note, source: r.source }; })()");

  // 교사가 자리에 앉으면: PC의 '쉬는 시간 기록' 창 (폰 기록이 도착했을 때 동기화가 여는 것과 같은 호출)
  await page.eval(`(async () => { const st = S.getState(); window.__recId = window.__climbed; st.openInbox({ records: [window.__recId] }); await wait(1000); return true; })()`);
  const popupRects = { modal: "document.querySelector('.modal.inbox')", card: "document.querySelector('.ib-item.man')", input: "document.querySelector('.ib-item.man textarea')", save: "document.querySelector('.ib-item.man .btn.primary')" };
  await shot(page, g, "m-pc-popup", { rects: popupRects });
  const chars = Array.from(TYPED);
  const steps = [];
  for (let k = 2; k < chars.length; k += 2) steps.push(k);
  steps.push(chars.length);
  manifest[g].typing = steps.length;
  for (let i = 0; i < steps.length; i++) {
    const text = chars.slice(0, steps[i]).join("");
    await page.eval(`(async () => { const ta = document.querySelector('.ib-item.man textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); await frames2(); return true; })()`);
    await shot(page, g, `m-pc-type-${String(i + 1).padStart(2, "0")}`, { rects: i === steps.length - 1 ? popupRects : {} });
  }
  await page.eval("document.querySelector('.ib-item.man textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })); true");
  await sleep(600);
  await shot(page, g, "m-pc-done", { rects: { modal: "document.querySelector('.modal.inbox')", empty: "document.querySelector('.ib-empty')" } });
  manifest[g].savedRecord = await page.eval("(() => { const r = S.getState().doc.records.find((x) => x.id === window.__recId); return r && { status: r.status, category: r.category, note: r.note }; })()");

  // 그 한 줄이 학생 카드에 근거로 남는다
  const cardOf = "[...document.querySelectorAll('.sg-card')].find((c) => c.textContent.includes('설유진'))";
  await page.eval(`(async () => { S.getState().closeInbox(); await wait(500); ${cardOf}.scrollIntoView({ block: 'center' }); await wait(700); return true; })()`);
  manifest[g].cardText = await page.eval(`${cardOf}?.innerText`);
  await shot(page, g, "m-card", { rects: { card: cardOf, line: `[...${cardOf}.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.includes('르샤틀리에')).map((e) => e.closest('li, p, div'))[0]` } });
  page.close();
  await browser.close();
}

async function auto() {
  console.log("방법 2 · 자동 기록");
  const g = "auto";
  manifest[g] = { clock: CLOCK, arrival: ARRIVAL };
  const { browser, page } = await open(9352);
  const tr = await page.eval("Demo.demoInfo().transcriptId");

  // 녹음 설정: 기본 꺼짐 → 사용 조건 확인 → 켜짐 · 하루 대기(아침 1탭, 시간표대로 자동)
  await page.eval("(async () => { const st = S.getState(); st.setPage('settings'); st.setSettingsTab('recording'); await wait(1000); return true; })()");
  const card = "document.querySelector('.settings-body .card.pad')";
  await shot(page, g, "a-rec-off", { rects: { card, switch: "document.querySelector('.settings-body .switch')" } });
  await page.eval("(async () => { document.querySelector('.settings-body .switch').click(); await wait(600); return true; })()");
  await shot(page, g, "a-rec-check-0", { rects: { modal: "document.querySelector('.overlay .modal')" } });
  await page.eval("(async () => { for (const c of document.querySelectorAll('.modal .check-row input[type=checkbox]')) { c.click(); await wait(120); } await wait(300); return true; })()");
  await shot(page, g, "a-rec-check-4", { rects: { modal: "document.querySelector('.overlay .modal')", ok: "byText('.modal-f button', '확인하고 켜기')" } });
  await page.eval("(async () => { byText('.modal-f button', '확인하고 켜기').click(); await wait(500); byText('.settings-body .seg button', '하루 대기').click(); await wait(700); return true; })()");
  await shot(page, g, "a-rec-on", { rects: { card, standby: "byText('.settings-body .seg button', '하루 대기')", chip: "document.querySelector('.settings-body .chip.pass')", ttl: "byText('.settings-body .field', '음성 보존')" } });

  // 폰: 수업 시간 (이 위에 안드로이드 앱의 '녹음 중' 알림을 그래픽으로 얹는다)
  await page.setViewport(1440, 1000, 2);
  await page.eval("(async () => { S.getState().setPage('mobile'); await wait(900); return true; })()");
  const phone = await page.rect(".mp-phone");
  manifest[g].phoneHeader = await page.eval("document.querySelector('.mp-head')?.innerText");
  await shot(page, g, "a-phone-now", { clip: phone, rects: { head: "document.querySelector('.mp-head')", status: "document.querySelector('.mp-status')", reel: "document.querySelector('.mp-reel')" } });
  await page.setViewport(1440, 900, 2);

  // 받은 스크립트: 이름 없이 화자만 구분
  await page.eval("(async () => { const st = S.getState(); st.setPage('settings'); st.setSettingsTab('recording'); await wait(900); [...document.querySelectorAll('.settings-body table button')].find((b) => b.textContent.trim() === '보기').click(); await wait(1300); return true; })()");
  const trRects = { modal: "document.querySelector('.modal.xl')", list: "document.querySelector('.seg-list')", s8: "document.getElementById('seg-s8')", note: "byText('.modal span', '화자 라벨은')" };
  await shot(page, g, "a-transcript", { rects: trRects });
  await page.eval("(async () => { [...document.querySelectorAll('.modal label')].find((l) => l.textContent.includes('교사 발언 숨기기')).querySelector('input').click(); await wait(500); return true; })()");
  await shot(page, g, "a-transcript-students", { rects: trRects });
  await page.eval("(async () => { document.querySelector('#seg-s8 .seg-line').classList.add('hl'); await frames2(); return true; })()");
  await shot(page, g, "a-transcript-hl", { rects: trRects });
  await page.eval("(async () => { document.querySelector('.modal .x')?.click(); await wait(500); return true; })()");

  // PC가 고른 발언: 쉬는 시간 기록 창 (스크립트가 도착했을 때 동기화가 하는 것과 같은 알림·창)
  // 화자5의 질문을 첫 카드로 보이려고 앞 카드(s6) 하나만 '무시'로 둔다. 발언 원문이 보이도록 '처음부터 자세히'
  await page.eval(`(async () => {
    const st = S.getState();
    await T.getState().setSuggestionStatus(${JSON.stringify(tr)}, ${JSON.stringify(tr + ":s6")}, 'dismissed');
    st.setSettings((x) => ({ ...x, options: { ...x.options, detail: 'full' } }));
    st.setPage('main'); await wait(700);
    window.__toast = st.toast({ text: ${JSON.stringify(ARRIVAL)}, kind: 'notice', ttl: 120000 });
    st.openInbox({ transcripts: [${JSON.stringify(tr)}] }); await wait(1600);
    return true;
  })()`);
  const sgRects = { modal: "document.querySelector('.modal.inbox')", card: "document.querySelector('.ib-item.sg.open')", quote: "document.querySelector('.ib-item.sg.open .ib-quote')", roster: "document.querySelector('.ib-item.sg.open .ib-roster')", toast: "document.querySelector('.toasts .toast')" };
  await shot(page, g, "a-inbox", { rects: sgRects });
  manifest[g].firstCard = await page.eval("document.querySelector('.ib-item.sg.open')?.innerText.slice(0, 400)");
  await page.eval("(async () => { S.getState().dismissToast(window.__toast); await wait(400); const l = document.querySelector('.ib-item.sg.open .ib-roster-list'); l.scrollTop = l.scrollHeight; await wait(300); return true; })()");
  const b24 = "[...document.querySelectorAll('.ib-item.sg.open .ib-roster-list button')].find((b) => b.querySelector('.num')?.textContent === '24')";
  const r24 = await page.eval(`rectOf(${b24})`);
  await page.mouseMove(r24.x + r24.width / 2, r24.y + r24.height / 2);
  await sleep(350);
  await shot(page, g, "a-inbox-pick", { rects: { ...sgRects, pick: b24 } });
  await page.eval(`(async () => { ${b24}.click(); await wait(700); return true; })()`);
  await shot(page, g, "a-inbox-done", { rects: { modal: "document.querySelector('.modal.inbox')", toast: "document.querySelector('.toasts .toast')" } });
  manifest[g].savedRecord = await page.eval("(() => { const r = S.getState().doc.records.filter((x) => x.class === '2-3' && x.no === 24 && x.source === 'suggestion').pop(); return r && { time: r.time, category: r.category, memo: r.memo, note: r.note }; })()");

  await page.mouseMove(5, 5);
  await page.eval("(async () => { const st = S.getState(); st.closeInbox(); for (const t of st.toasts || []) st.dismissToast(t.id); await wait(500); return true; })()");
  await setStairs(page, "자세히");
  await climb(page, g, "a-stairs-full", "st.doc.records.filter((r) => r.class === '2-3' && r.no === 24 && r.source === 'suggestion').pop()", "손시우");
  page.close();
  await browser.close();
}

if (which === "all" || which === "manual") await manual();
if (which === "all" || which === "auto") await auto();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n${manifestPath}`);
