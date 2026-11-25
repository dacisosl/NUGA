#!/usr/bin/env node
// 관리자 키 도구 — 테스트 아이디 관리(강제 로그아웃)에 쓰는 관리자 비밀번호와 서명 키를 만든다.
//
//   node tools/admin-key.mjs rotate   새 키 + 새 비밀번호 (이전 것은 못 쓰게 된다)
//   node tools/admin-key.mjs check    이 PC의 비밀번호 파일이 코드의 키와 맞는지 확인
//   node tools/admin-key.mjs copy     비밀번호를 클립보드에 복사 (화면에는 보이지 않는다)
//   node tools/admin-key.mjs where    비밀번호 파일 위치
//
// 무엇이 어디에 있나
// - 비밀번호: 이 PC의 파일 하나(아래 PASSWORD_FILE)에만. 코드 · 깃허브 · 화면 어디에도 쓰지 않는다.
// - 코드(packages/core/src/adminKey.ts): 공개키 + '비밀번호로 잠근 개인키'. 공개돼도 되는 값이다
//   (비밀번호가 무작위 26자 = 130비트라 대입으로 풀 수 없다).
// - 바꾼 키는 커밋 · 배포한 뒤부터 쓰인다. 그때까지 배포된 사이트는 이전 비밀번호(…prev.txt)로 열린다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EC = { name: "ECDSA", namedCurve: "P-256" };
const AAD = new TextEncoder().encode("nuga-admin-wrap-v1");
export const ADMIN_ITERATIONS = 600_000;
const ALPHABET = "abcdefghjkmnpqrstvwxyz0123456789"; // 32자 (헷갈리는 i · l · o · u 는 뺌)

const DIR = process.env.NUGA_ADMIN_DIR || path.join(os.homedir(), ".nuga");
export const PASSWORD_FILE = path.join(DIR, "admin-password.txt");
const PREV_FILE = path.join(DIR, "admin-password.prev.txt");
const KEY_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "src", "adminKey.ts");

const toB64 = (u) => Buffer.from(u).toString("base64");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const fromB64Url = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const toB64Url = (u) => Buffer.from(u).toString("base64url");

/** 무작위 비밀번호: 26자 × 5비트 = 130비트 */
export function randomAdminPassword(chars = 26) {
  return [...crypto.getRandomValues(new Uint8Array(chars))].map((b) => ALPHABET[b & 31]).join("");
}

async function kek(password, salt, iterations, usages) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, usages);
}

/**
 * 새 서명 키 한 벌.
 * pub = 공개키(P-256, 65바이트), blob = 1(판) + 4(반복 횟수) + 16(소금) + 12(iv) + 48(잠근 개인키 32 + 표 16)
 */
export async function makeAdminKey(password, iterations = ADMIN_ITERATIONS) {
  const kp = await crypto.subtle.generateKey(EC, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const d = fromB64Url((await crypto.subtle.exportKey("jwk", kp.privateKey)).d);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await kek(password, salt, iterations, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 }, k, d));
  d.fill(0);
  const blob = new Uint8Array(33 + ct.length);
  blob[0] = 2; new DataView(blob.buffer).setUint32(1, iterations); blob.set(salt, 5); blob.set(iv, 21); blob.set(ct, 33);
  return { pub: toB64(pub), blob: toB64(blob) };
}

/** 비밀번호로 잠근 개인키를 연다 (틀리면 예외) */
async function openAdminKey(material, password) {
  const blob = fromB64(material.blob), pub = fromB64(material.pub);
  if (blob[0] !== 2 || blob.length !== 81 || pub.length !== 65 || pub[0] !== 4) throw new Error("키 형식이 다릅니다");
  const k = await kek(password, blob.slice(5, 21), new DataView(blob.buffer).getUint32(1), ["decrypt"]);
  const d = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.slice(21, 33), additionalData: AAD, tagLength: 128 }, k, blob.slice(33)));
  const jwk = { kty: "EC", crv: "P-256", x: toB64Url(pub.slice(1, 33)), y: toB64Url(pub.slice(33, 65)), d: toB64Url(d) };
  d.fill(0);
  const priv = await crypto.subtle.importKey("jwk", jwk, EC, false, ["sign"]);
  // 짝이 맞는지: 서명해 보고 공개키로 확인
  const probe = new TextEncoder().encode("nuga-admin-check");
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, probe);
  const pk = await crypto.subtle.importKey("raw", pub, EC, false, ["verify"]);
  if (!(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pk, sig, probe))) throw new Error("공개키와 개인키가 짝이 아닙니다");
  return priv;
}

function readKeyFile() {
  if (!fs.existsSync(KEY_FILE)) return null;
  const s = fs.readFileSync(KEY_FILE, "utf8");
  const pub = /pub:\s*"([^"]*)"/.exec(s)?.[1] || "", blob = /blob:\s*"([^"]*)"/.exec(s)?.[1] || "";
  return pub && blob ? { pub, blob } : null;
}

function writeKeyFile(m, madeAt) {
  fs.writeFileSync(KEY_FILE, `// 이 파일은 tools/admin-key.mjs 가 만든다 (손으로 고치지 않는다). 공개돼도 되는 값뿐이다.
// pub  = 관리자 공개키 (P-256). 모든 기기가 관리자 명령의 서명을 이것으로 확인한다.
// blob = 관리자 비밀번호로 잠근 개인키. 비밀번호(무작위 26자)는 관리자 PC의 파일에만 있다.
// 키를 바꾸려면: node tools/admin-key.mjs rotate  → 커밋 · 배포
export const ADMIN_KEY = {
  pub: "${m.pub}",
  blob: "${m.blob}",
  madeAt: "${madeAt}",
} as const;
`);
}

async function main(cmd) {
  if (cmd === "where") { console.log(PASSWORD_FILE); return 0; }
  if (cmd === "rotate") {
    const password = randomAdminPassword();
    const m = await makeAdminKey(password);
    await openAdminKey(m, password); // 쓰기 전에 열리는지 확인
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    if (fs.existsSync(PASSWORD_FILE)) { fs.copyFileSync(PASSWORD_FILE, PREV_FILE); try { fs.chmodSync(PREV_FILE, 0o600); } catch { /* 윈도우 */ } }
    fs.writeFileSync(PASSWORD_FILE, password + "\n", { mode: 0o600 });
    try { fs.chmodSync(PASSWORD_FILE, 0o600); } catch { /* 윈도우: 사용자 폴더 권한을 따른다 */ }
    writeKeyFile(m, new Date().toISOString().slice(0, 10));
    console.log("새 관리자 키를 만들었습니다.");
    console.log("  비밀번호 파일(이 PC에만): " + PASSWORD_FILE);
    if (fs.existsSync(PREV_FILE)) console.log("  이전 비밀번호: " + PREV_FILE + "  (새 키를 배포하기 전까지 배포된 사이트는 이것으로 열립니다)");
    console.log("  코드의 키: packages/core/src/adminKey.ts  → 커밋 · 배포해야 사이트에 반영됩니다.");
    console.log("  비밀번호 복사: node tools/admin-key.mjs copy");
    return 0;
  }
  if (cmd === "check" || cmd === "copy") {
    if (!fs.existsSync(PASSWORD_FILE)) { console.error("비밀번호 파일이 없습니다: " + PASSWORD_FILE + "\n먼저 node tools/admin-key.mjs rotate"); return 1; }
    const password = fs.readFileSync(PASSWORD_FILE, "utf8").trim();
    if (cmd === "copy") {
      const [bin, args] = process.platform === "win32" ? ["clip", []] : process.platform === "darwin" ? ["pbcopy", []] : ["xclip", ["-selection", "clipboard"]];
      execFileSync(bin, args, { input: password });
      console.log("관리자 비밀번호를 클립보드에 복사했습니다. 붙여 넣은 뒤 다른 것을 복사하세요. 클립보드 기록(Win+V)이나 클라우드 동기화를 켜 두었다면 그곳에 남을 수 있으니 거기서도 지우세요.");
      return 0;
    }
    const m = readKeyFile();
    if (!m) { console.error("코드에 관리자 키가 없습니다: packages/core/src/adminKey.ts"); return 1; }
    try { await openAdminKey(m, password); console.log("맞습니다: 이 PC의 비밀번호로 코드의 관리자 키가 열립니다."); return 0; }
    catch { console.error("맞지 않습니다: 이 PC의 비밀번호로는 코드의 관리자 키가 열리지 않습니다 (다른 PC에서 키를 바꿨을 수 있습니다)."); return 1; }
  }
  console.log("쓰는 법: node tools/admin-key.mjs rotate | check | copy | where");
  return cmd ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).then((code) => process.exit(code), (e) => { console.error(e?.message || e); process.exit(1); });
}
