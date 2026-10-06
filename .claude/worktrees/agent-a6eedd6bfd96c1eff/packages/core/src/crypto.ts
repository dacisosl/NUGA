import type { Envelope, SyncMessage } from "./types";

const enc = new TextEncoder();
const dec = new TextDecoder();
/** TS 5.9 BufferSource 호환: Uint8Array → 독립 ArrayBuffer */
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function toB64(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
}
export function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return fromB64(b64);
}
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateSyncKey(): Uint8Array {
  const k = new Uint8Array(32); crypto.getRandomValues(k); return k;
}

export async function keyIdOf(key: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(key)));
  return toHex(h.slice(0, 8));
}

export interface Pairing { key: Uint8Array; relayUrl: string; pcName: string }

export function buildPairingUri(p: Pairing): string {
  return `nuga://pair?v=1&k=${toB64Url(p.key)}&r=${encodeURIComponent(p.relayUrl)}&n=${encodeURIComponent(p.pcName)}`;
}

export function parsePairingUri(uri: string): Pairing {
  const m = uri.match(/^nuga:\/\/pair\?(.*)$/);
  if (!m) throw new Error("페어링 QR 형식이 아님");
  const q = new URLSearchParams(m[1]);
  if (q.get("v") !== "1") throw new Error("지원하지 않는 버전");
  const k = q.get("k"); const r = q.get("r");
  if (!k || !r) throw new Error("키 또는 릴레이 주소 없음");
  const key = fromB64Url(k);
  if (key.length !== 32) throw new Error("키 길이 오류");
  return { key, relayUrl: r, pcName: q.get("n") || "" };
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptEnvelope(key: Uint8Array, keyId: string, message: SyncMessage, from: Envelope["from"], ts: string): Promise<Envelope> {
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const k = await aesKey(key);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(enc.encode(keyId)), tagLength: 128 }, k, buf(enc.encode(JSON.stringify(message)))));
  return { from, iv: toB64(iv), ct: toB64(ct), ts };
}

export async function decryptEnvelope(key: Uint8Array, keyId: string, env: Envelope): Promise<SyncMessage> {
  const k = await aesKey(key);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(env.iv)), additionalData: buf(enc.encode(keyId)), tagLength: 128 }, k, buf(fromB64(env.ct)));
  return JSON.parse(dec.decode(pt)) as SyncMessage;
}

/** 비밀번호 기반 암호화 백업: PBKDF2-SHA256(200k) → AES-256-GCM. */
export interface BackupContainer { format: "nuga-backup"; v: 1; salt: string; iv: string; iter: number; ct: string; createdAt: string }

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", buf(enc.encode(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: buf(salt), iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBackup(password: string, plaintext: string, createdAt: string): Promise<BackupContainer> {
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const iter = 200_000;
  const k = await pbkdf2(password, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, k, buf(enc.encode(plaintext))));
  return { format: "nuga-backup", v: 1, salt: toB64(salt), iv: toB64(iv), iter, ct: toB64(ct), createdAt };
}

export async function decryptBackup(password: string, c: BackupContainer): Promise<string> {
  if (c.format !== "nuga-backup") throw new Error("백업 파일 형식이 아님");
  const k = await pbkdf2(password, fromB64(c.salt), c.iter);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(c.iv)) }, k, buf(fromB64(c.ct)));
    return dec.decode(pt);
  } catch { throw new Error("비밀번호가 틀렸거나 파일이 손상됨"); }
}
