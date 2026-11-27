// 소개 페이지(apps/landing)의 [?] 묻고 답하기가 쓰는 답 찾기 묶음을 만든다.
// 앱 도움말과 같은 자료·같은 답 찾기(packages/core/src/help.ts)를 그대로 묶어 window.NugaHelp 로 내놓는다 (AI·서버 없음).
//   node tools/build-landing-help.mjs   → apps/landing/ask-data.js
// help.ts 를 고치면 다시 돌린다. 배포(pages.yml)에서도 매번 다시 만든다.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
await build({
  entryPoints: [root + "packages/core/src/help.ts"],
  outfile: root + "apps/landing/ask-data.js",
  bundle: true, format: "iife", globalName: "NugaHelp", minify: true, target: "es2019", charset: "utf8", legalComments: "none",
  banner: { js: "/* 자동 생성: node tools/build-landing-help.mjs (원본 packages/core/src/help.ts) */" },
});
console.log("apps/landing/ask-data.js");
