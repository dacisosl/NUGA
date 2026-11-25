/**
 * 관리자 명령 서명 (테스트 아이디 관리용: 강제 로그아웃).
 *
 * 테스트 아이디의 비밀번호는 코드에 공개돼 있어, 테스트 아이디의 열쇠로는 '누가 보냈는지'를 가릴 수 없다.
 * 그래서 관리자 명령만은 따로 서명한다.
 * - 코드(adminKey.ts): 관리자 공개키 + 관리자 비밀번호로 잠근 개인키. 둘 다 공개돼도 된다.
 * - 관리자: 비밀번호 → 개인키를 연다(이 탭의 메모리에만) → 명령에 서명.
 * - 다른 기기: 공개키로 서명을 확인한 명령만 따른다.
 * 비밀번호는 저장하지도 보내지도 않는다. 키 만들기 · 바꾸기: tools/admin-key.mjs
 */
import { fromB64, fromB64Url, toB64Url } from "./crypto";
import { ADMIN_KEY } from "./adminKey";

/** 관리자 아이디 (로그인 창에 이 아이디를 넣으면 관리자 비밀번호를 묻는다) */
export const ADMIN_LOGIN_ID = "nuga-admin";
export function isAdminLogin(id: string | undefined | null): boolean { return !!id && id.trim().toLowerCase() === ADMIN_LOGIN_ID; }

export interface AdminKeyMaterial { pub: string; blob: string }
/** 서명한 명령: p = 정해진 순서로 쓴 JSON 글자 그대로, s = 그 글자에 대한 서명 */
export interface SignedAdmin { nuga: "adm1"; p: string; s: string }

const EC = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIG = { name: "ECDSA", hash: "SHA-256" } as const;
const AAD = new TextEncoder().encode("nuga-admin-wrap-v1");
const subtle = () => globalThis.crypto.subtle;
/** WebCrypto 에 넘길 바이트 (새 ArrayBuffer 로 복사: 타입과 조각 범위 문제를 피한다) */
const buf = (u: Uint8Array): ArrayBuffer => { const b = new ArrayBuffer(u.length); new Uint8Array(b).set(u); return b; };

/** 키 순서를 정해 쓴 JSON (서명하는 쪽과 확인하는 쪽이 같은 글자를 보게) */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** 코드에 관리자 키가 들어 있는가 (없으면 관리자 기능을 감춘다) */
export function hasAdminKey(m: AdminKeyMaterial = ADMIN_KEY): boolean {
  try { return fromB64(m.pub).length === 65 && fromB64(m.blob).length === 81; } catch { return false; }
}

/**
 * 관리자 비밀번호로 개인키를 연다. 틀리면 null.
 * 돌려주는 키는 꺼낼 수 없고(extractable 아님) 서명만 할 수 있다.
 */
export async function openAdminKey(password: string, m: AdminKeyMaterial = ADMIN_KEY): Promise<CryptoKey | null> {
  try {
    const blob = fromB64(m.blob), pub = fromB64(m.pub);
    if (blob[0] !== 2 || blob.length !== 81 || pub.length !== 65 || pub[0] !== 4) return null;
    const iterations = new DataView(buf(blob)).getUint32(1);
    const base = await subtle().importKey("raw", buf(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveKey"]);
    const kek = await subtle().deriveKey({ name: "PBKDF2", salt: buf(blob.slice(5, 21)), iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const d = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(blob.slice(21, 33)), additionalData: buf(AAD), tagLength: 128 }, kek, buf(blob.slice(33))));
    const jwk = { kty: "EC", crv: "P-256", x: toB64Url(pub.slice(1, 33)), y: toB64Url(pub.slice(33, 65)), d: toB64Url(d) };
    d.fill(0);
    const key = await subtle().importKey("jwk", jwk, EC, false, ["sign"]);
    // 잠근 개인키가 코드의 공개키와 짝인지 (다른 키의 blob 이 섞였으면 여기서 걸린다)
    const probe = await signAdmin(key, { probe: 1 });
    return (await verifyAdmin(probe, m)) ? key : null;
  } catch { return null; }
}

/** 명령에 서명한다 */
export async function signAdmin(key: CryptoKey, cmd: unknown): Promise<SignedAdmin> {
  const p = canonicalJson(cmd);
  const sig = new Uint8Array(await subtle().sign(SIG, key, buf(new TextEncoder().encode(p))));
  return { nuga: "adm1", p, s: toB64Url(sig) };
}

let pubCache: { pub: string; key: Promise<CryptoKey> } | null = null;
function publicKey(m: AdminKeyMaterial): Promise<CryptoKey> {
  if (pubCache?.pub !== m.pub) pubCache = { pub: m.pub, key: subtle().importKey("raw", buf(fromB64(m.pub)), EC, false, ["verify"]) };
  return pubCache.key;
}

/** 서명이 맞으면 명령을, 아니면 null (형식이 다르거나, 글자가 바뀌었거나, 다른 키로 서명한 것) */
export async function verifyAdmin<T = unknown>(msg: unknown, m: AdminKeyMaterial = ADMIN_KEY): Promise<T | null> {
  try {
    const x = msg as Partial<SignedAdmin> | null;
    if (!x || x.nuga !== "adm1" || typeof x.p !== "string" || typeof x.s !== "string" || x.p.length > 2000) return null;
    const sig = fromB64Url(x.s);
    if (sig.length !== 64) return null;
    if (!(await subtle().verify(SIG, await publicKey(m), buf(sig), buf(new TextEncoder().encode(x.p))))) return null;
    const cmd = JSON.parse(x.p) as T;
    return canonicalJson(cmd) === x.p ? cmd : null;
  } catch { return null; }
}
