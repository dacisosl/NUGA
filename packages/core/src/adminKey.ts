// 이 파일은 tools/admin-key.mjs 가 만든다 (손으로 고치지 않는다). 공개돼도 되는 값뿐이다.
// pub  = 관리자 공개키 (P-256). 모든 기기가 관리자 명령의 서명을 이것으로 확인한다.
// blob = 관리자 비밀번호로 잠근 개인키. 비밀번호(무작위 26자)는 관리자 PC의 파일에만 있다.
// 키를 바꾸려면: node tools/admin-key.mjs rotate  → 커밋 · 배포
export const ADMIN_KEY = {
  pub: "BBV/Kv8INCXk6JkKt0cmbWnk8QlapapYvnGe/G43DdWodbAkAuWjpAhLh/gL1PaiRTGVkYPYJI6JWQSe5o17ATc=",
  blob: "AgAJJ8AUUVGD8wMG0y4NpRQBWhNKJeXngEhP4ZIATEDS8ZaP+ARmol7zdryhN6QWRGDs81uQQIswW4zM6/ArzPXsm40yEBZsaWylGMcXTYFY",
  madeAt: "2026-11-25",
} as const;
