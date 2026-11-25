import { keyIdOf, toB64 } from "./crypto";

/**
 * 로그인 = 회원 서버 없이 같은 통로 찾기.
 * 아이디·비밀번호로 동기화 키 K 를 만든다: PBKDF2-SHA256(비밀번호, "nuga-login-v1|<아이디 소문자>", 21만 회) → 32바이트.
 * 같은 아이디·비밀번호를 넣은 폰과 PC 는 같은 K(같은 keyId)를 갖게 되어 같은 통로로 암호문을 주고받는다.
 * 비밀번호는 어디에도 저장하지 않는다. 서버(중계)는 keyId 에서 만든 통로 이름과 암호문만 본다.
 */
export const LOGIN_ITERATIONS = 210_000;
export const LOGIN_SALT_PREFIX = "nuga-login-v1|";
/** 공개 테스트 계정 (부스·시연용). 누구나 같은 통로에 들어올 수 있으므로 실제 학생 이름은 보내지 않는다 */
export const TEST_LOGIN = { id: "nuga-test", password: "4wq7b8tjb7gqzps3" } as const;

const enc = new TextEncoder();
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function normalizeLoginId(id: string): string { return id.trim().toLowerCase(); }
export function isTestLogin(id: string | undefined | null): boolean { return !!id && normalizeLoginId(id) === TEST_LOGIN.id; }

/** 입력 검사: 아이디 2~40자, 비밀번호 4자 이상. 문제가 없으면 null */
export function checkLogin(id: string, password: string): string | null {
  const n = normalizeLoginId(id);
  if (n.length < 2) return "아이디를 2자 이상 입력하세요";
  if (n.length > 40) return "아이디는 40자까지입니다";
  if (password.length < 4) return "비밀번호를 4자 이상 입력하세요";
  return null;
}

export interface LoginKey { key: Uint8Array; keyB64: string; keyId: string }

/** 아이디·비밀번호 → 동기화 키. 같은 입력이면 어느 기기에서든 같은 값 */
export async function deriveLoginKey(id: string, password: string, iterations = LOGIN_ITERATIONS): Promise<LoginKey> {
  const base = await crypto.subtle.importKey("raw", buf(enc.encode(password)), "PBKDF2", false, ["deriveBits"]);
  const salt = enc.encode(LOGIN_SALT_PREFIX + normalizeLoginId(id));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" }, base, 256);
  const key = new Uint8Array(bits);
  return { key, keyB64: toB64(key), keyId: await keyIdOf(key) };
}
