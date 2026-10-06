#!/usr/bin/env node
/**
 * 합성 모의 수업 음성 만들기 (v3 13.4, 데모·시연 영상용).
 * 대회 규칙상 실제 수업 녹음을 쓰지 않으므로, 대본(packages/core/demo/lesson-equilibrium.json)을
 * Gemini 음성 합성(TTS)으로 읽혀 10분짜리 모의 수업 음성을 만든다.
 *
 *   GEMINI_API_KEY=... node tools/make-demo-lesson.mjs                # tools/out/lesson-equilibrium.wav
 *   GEMINI_API_KEY=... node tools/make-demo-lesson.mjs --transcribe   # 만든 음성을 다시 받아쓰기해 스크립트 비교
 *
 * - 화자마다 다른 목소리를 써서 발언 하나씩 합성하고, 대본의 시작 시각에 맞춰 무음 사이에 배치한다.
 * - 결과 음성은 저장소에 넣지 않는다(tools/out 은 .gitignore). 학생 이름·실제 음성은 없다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 환경 변수가 필요합니다 (유료 등급 키 권장)."); process.exit(1); }
const TTS_MODEL = process.env.NUGA_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const STT_MODEL = process.env.NUGA_STT_MODEL || "gemini-2.5-flash";
const RATE = 24000; // Gemini TTS 출력: 24kHz 16bit mono PCM
const root = new URL("..", import.meta.url);
const lesson = JSON.parse(readFileSync(new URL("packages/core/demo/lesson-equilibrium.json", root), "utf8"));
const outDir = new URL("tools/out/", root);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 화자별 목소리 (Gemini 사전 정의 음성). 교사 = 화자1
const VOICES = ["Charon", "Leda", "Puck", "Kore", "Fenrir", "Aoede", "Orus", "Zephyr", "Callirrhoe", "Iapetus"];
const speakers = [...new Set(lesson.segments.map((s) => s.speaker))];
const voiceOf = (sp) => VOICES[speakers.indexOf(sp) % VOICES.length];
const clock = (t) => t.split(":").map(Number).reduce((a, x) => a * 60 + x, 0);

async function tts(text, voice, style) {
  const body = {
    contents: [{ parts: [{ text: `${style}: ${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`TTS ${r.status}: ${j.error?.message || ""}`);
    const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!b64) throw new Error("TTS 응답에 음성이 없음");
    return Buffer.from(b64, "base64");
  }
  throw new Error("TTS 재시도 초과");
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const total = Buffer.alloc(lesson.durationSec * RATE * 2);
let cursor = 0;
for (const [i, seg] of lesson.segments.entries()) {
  const style = seg.speaker === "화자1" ? "고등학교 교사가 교실에서 차분하고 또렷하게 말하듯이" : "고등학생이 수업 중 자연스럽게 말하듯이";
  process.stdout.write(`[${i + 1}/${lesson.segments.length}] ${seg.speaker} ${seg.start}\r`);
  const pcm = await tts(seg.text, voiceOf(seg.speaker), style);
  const at = Math.max(cursor, clock(seg.start) * RATE * 2);
  const off = at - (at % 2);
  if (off + pcm.length > total.length) { console.warn(`\n${seg.start} 발언이 수업 길이를 넘어 잘림`); }
  pcm.copy(total, off, 0, Math.max(0, Math.min(pcm.length, total.length - off)));
  cursor = off + pcm.length + RATE; // 다음 발언 전 0.5초 이상 띄움
}
const file = new URL("lesson-equilibrium.wav", outDir);
writeFileSync(file, wav(total));
console.log(`\n저장: ${file.pathname} (${(total.length / 1e6).toFixed(1)}MB, ${lesson.durationSec}초)`);

if (process.argv.includes("--transcribe")) {
  // 폰과 같은 방식(Files API + JSON 스키마)으로 받아쓰기해 본다
  const { TRANSCRIBE_PROMPT } = await import("../packages/core/src/transcript.ts").catch(() => ({ TRANSCRIBE_PROMPT: null }));
  const prompt = TRANSCRIBE_PROMPT || "이 음성은 한국 학교의 수업 녹음이다. 받아쓰기와 화자 구분만 하고, 화자는 '화자1'처럼 번호로만 적는다. start·end 는 'MM:SS'.";
  const data = readFileSync(file);
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(data.length), "X-Goog-Upload-Header-Content-Type": "audio/wav", "content-type": "application/json" },
    body: JSON.stringify({ file: { display_name: "demo-lesson" } }),
  });
  const url = start.headers.get("x-goog-upload-url");
  const up = await (await fetch(url, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: data })).json();
  let f = up.file;
  while (f.state !== "ACTIVE") { await new Promise((r) => setTimeout(r, 3000)); f = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${f.name}`, { headers: { "x-goog-api-key": KEY } })).json(); if (f.state === "FAILED") throw new Error("파일 처리 실패"); }
  const schema = { type: "OBJECT", properties: { segments: { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "STRING" }, end: { type: "STRING" }, speaker: { type: "STRING" }, text: { type: "STRING" } }, required: ["start", "end", "speaker", "text"] } } }, required: ["segments"] };
  const g = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${STT_MODEL}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ file_data: { mime_type: "audio/wav", file_uri: f.uri } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 } }),
  })).json();
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${f.name}`, { method: "DELETE", headers: { "x-goog-api-key": KEY } });
  const text = g.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  writeFileSync(new URL("lesson-equilibrium.transcript.json", outDir), text);
  const segs = JSON.parse(text).segments || [];
  console.log(`받아쓰기: 발언 ${segs.length}개 (대본 ${lesson.segments.length}개), 화자 ${new Set(segs.map((s) => s.speaker)).size}명 (대본 ${speakers.length}명)`);
}
