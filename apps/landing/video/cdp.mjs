// 소개 영상용 헤드리스 Chrome 도우미 (의존성 없음: Node 24 의 WebSocket 과 DevTools 프로토콜만 쓴다).
// 실제 앱 화면을 찍는 capture.mjs 와 장면을 한 장씩 그리는 render.mjs 가 함께 쓴다.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 새 헤드리스 Chrome 을 빈 임시 프로필로 띄운다. 포트는 Chrome 이 비어 있는 것을 골라 알려 준다(다른 브라우저에 붙지 않게) */
export async function launch() {
  const exe = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error("Chrome 을 찾지 못했습니다. CHROME_PATH 로 브라우저 경로를 지정하세요.");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nuga-video-"));
  const proc = spawn(exe, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--force-color-profile=srgb",
    "about:blank",
  ], { stdio: "ignore" });
  // 스크립트가 예외로 끝나도 Chrome 이 남지 않게
  const kill = () => { try { proc.kill(); } catch { /* 이미 끝남 */ } };
  process.once("exit", kill);
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    if (proc.exitCode !== null) throw new Error("Chrome 이 바로 끝났습니다");
    try { port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]); } catch { await sleep(100); }
  }
  if (!port) { kill(); throw new Error("Chrome 디버깅 포트를 얻지 못했습니다"); }
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/json/version`); break; } catch { await sleep(100); }
  }
  return {
    async newPage(width = 1440, height = 900, dpr = 2) {
      const target = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
      const page = await connect(target.webSocketDebuggerUrl);
      await page.send("Page.enable");
      await page.send("Runtime.enable");
      await page.setViewport(width, height, dpr);
      return page;
    },
    async close() {
      // Chrome 이 완전히 끝난 뒤 임시 프로필을 지운다 (먼저 지우면 파일이 잠겨 수십 MB 씩 남는다)
      const exited = proc.exitCode !== null ? Promise.resolve() : new Promise((r) => proc.once("exit", r));
      process.off("exit", kill);
      proc.kill();
      await Promise.race([exited, sleep(5000)]);
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); return; } catch { await sleep(300); }
      }
    },
  };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ""}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  };
  const page = {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const fn = (params) => { listeners.set(method, (listeners.get(method) || []).filter((f) => f !== fn)); resolve(params); };
        listeners.set(method, [...(listeners.get(method) || []), fn]);
      });
    },
    async setViewport(width, height, dpr = 2) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
    },
    /** 페이지 스크립트보다 먼저 실행할 코드 (시계 고정 등) */
    async addInitScript(source) {
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source });
    },
    async setTimezone(timezoneId) {
      await page.send("Emulation.setTimezoneOverride", { timezoneId });
    },
    async mouseMove(x, y) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    },
    /** 요소의 화면 위치 (CSS 픽셀). 없으면 null */
    async rect(selector) {
      return page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    },
    async goto(url) {
      const loaded = page.once("Page.loadEventFired");
      await page.send("Page.navigate", { url });
      await loaded;
    },
    /** 페이지 안에서 식을 계산해 값으로 돌려준다 (Promise 는 기다린다) */
    async eval(expression) {
      const res = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      return res.result.value;
    },
    async waitFor(expression, timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await page.eval(`!!(${expression})`)) return;
        await sleep(100);
      }
      throw new Error(`기다림 시간 초과: ${expression}`);
    },
    /** clip 은 CSS 픽셀 {x,y,width,height}. 결과는 PNG 버퍼 */
    async screenshot({ clip, format = "png", quality } = {}) {
      const params = { format, captureBeyondViewport: false };
      if (quality) params.quality = quality;
      if (clip) params.clip = { ...clip, scale: 1 };
      const { data } = await page.send("Page.captureScreenshot", params);
      return Buffer.from(data, "base64");
    },
    close() { ws.close(); },
  };
  return page;
}

export { sleep };
