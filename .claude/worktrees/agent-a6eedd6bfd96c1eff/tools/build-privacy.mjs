#!/usr/bin/env node
/** docs/PRIVACY.md → apps/desktop/public/privacy.html (앱 내 표시·웹 배포용). 의존성 없는 최소 마크다운 변환. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../docs/PRIVACY.md");
const out = resolve(here, "../apps/desktop/public/privacy.html");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

const lines = readFileSync(src, "utf8").split(/\r?\n/);
const html = [];
let list = null; // "ul" | "ol"
const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
for (const raw of lines) {
  const line = raw.replace(/\s+$/, "");
  let m;
  if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { closeList(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
  if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) { if (list !== "ol") { closeList(); html.push("<ol>"); list = "ol"; } html.push(`<li>${inline(m[2])}</li>`); continue; }
  if ((m = line.match(/^\s*-\s+(.*)$/))) {
    if (list === "ol") { html.push(`<ul><li>${inline(m[1])}</li></ul>`); continue; }
    if (list !== "ul") { closeList(); html.push("<ul>"); list = "ul"; }
    html.push(`<li>${inline(m[1])}</li>`); continue;
  }
  if (!line.trim()) { closeList(); continue; }
  closeList(); html.push(`<p>${inline(line)}</p>`);
}
closeList();

const page = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>누가 개인정보 처리방침</title>
<style>
body{margin:0;background:#F4F3EF;color:#1A1C21;font:15px/1.7 "IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:820px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:32px 0 8px;padding-top:12px;border-top:1px solid #E3E1DA}h3{font-size:15px}
p{margin:8px 0}ol,ul{padding-left:22px;margin:6px 0}li{margin:3px 0}code{background:#ECECEE;padding:0 4px;border-radius:4px;font-size:13px}a{color:#2448C9}
.box{background:#E8EDFB;border-radius:12px;padding:12px 16px;margin:16px 0}
</style></head><body><main>
${html.join("\n")}
</main></body></html>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page, "utf8");
console.log("wrote", out);
