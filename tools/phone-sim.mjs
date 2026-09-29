#!/usr/bin/env node
/**
 * 폰 시뮬레이터 — 폰 앱 없이 동기화 프로토콜을 검증하는 개발 도구.
 *
 *   node tools/phone-sim.mjs "<nuga://pair?...>" ping
 *   node tools/phone-sim.mjs "<nuga://pair?...>" record 2-3 5 1 "메모"
 *   node tools/phone-sim.mjs "<nuga://pair?...>" pull        # PC가 내려보낸 config 확인
 *
 * 프로토콜: docs/PROTOCOL.md (AES-256-GCM, AAD=keyId, 봉투 {from,iv,ct,ts})
 */
import { webcrypto as crypto } from "node:crypto";

const [uri, cmd = "ping", ...rest] = process.argv.slice(2);
if (!uri) { console.error("usage: phone-sim.mjs <pairing-uri> <ping|record|pull> ..."); process.exit(1); }

const q = new URLSearchParams(uri.replace(/^nuga:\/\/pair\?/, ""));
const key = Buffer.from(q.get("k").replace(/-/g, "+").replace(/_/g, "/"), "base64");
const relay = q.get("r").replace(/\/+$/, "");
const keyId = Buffer.from(await crypto.subtle.digest("SHA-256", key)).subarray(0, 8).toString("hex");
const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
const deviceId = "sim-" + keyId.slice(0, 6);
const nowIso = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); const off = -d.getTimezoneOffset(); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? "+" : "-"}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`; };

async function send(message) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: Buffer.from(keyId) }, aes, Buffer.from(JSON.stringify(message)));
  const env = { from: "phone", iv: Buffer.from(iv).toString("base64"), ct: Buffer.from(ct).toString("base64"), ts: nowIso() };
  const r = await fetch(`${relay}/box/${keyId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env) });
  console.log("POST", r.status, await r.text());
}

async function pull() {
  const r = await fetch(`${relay}/box/${keyId}?for=phone`);
  const { items } = await r.json();
  for (const it of items) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(it.iv, "base64"), additionalData: Buffer.from(keyId) }, aes, Buffer.from(it.ct, "base64"));
    const msg = JSON.parse(Buffer.from(pt).toString("utf8"));
    console.log(`[${it.id}] ${msg.type}`, msg.type === "config" ? `classes=${JSON.stringify(msg.payload.classes)} timetable=${msg.payload.timetable.length} progress=${msg.payload.progress.length} roster=${msg.payload.roster ? msg.payload.roster.length : "null"}` : JSON.stringify(msg.payload).slice(0, 200));
    await fetch(`${relay}/box/${keyId}/${it.id}`, { method: "DELETE" });
  }
  if (!items.length) console.log("(no items)");
}

console.log("keyId", keyId, "relay", relay);
if (cmd === "ping") await send({ v: 1, type: "ping", deviceId, sentAt: nowIso(), payload: { name: "시뮬레이터 폰" } });
else if (cmd === "record") {
  const [cls = "2-3", no = "5", cat = "1", memo = ""] = rest;
  const t = nowIso();
  await send({ v: 1, type: "records", deviceId, sentAt: t, payload: [{ id: crypto.randomUUID(), class: cls, no: Number(no), category: Number(cat), time: t, lesson: null, memo, voiceMemo: null, note: "", status: "pending", source: "phone", createdAt: t, updatedAt: t }] });
} else if (cmd === "pull") await pull();
else console.error("unknown command", cmd);
