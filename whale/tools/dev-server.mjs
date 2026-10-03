#!/usr/bin/env node
/**
 * 누가 서버(worker.js)를 Wrangler 없이 로컬에서 돌린다 (점검용).
 *   node tools/dev-server.mjs [포트=8790]
 * KV 는 메모리. 환경 변수(GEMINI_API_KEY, NEIS_KEY …)는 그대로 넘긴다. AI_ACCESS 기본 open.
 */
import http from 'node:http';
import worker from '../server/worker.js';

const port = Number(process.argv[2] || 8790);
const store = new Map();
const KV = {
  async get(k, type) { const v = store.get(k); if (!v || (v.exp && v.exp < Date.now())) { store.delete(k); return null; } return type === 'json' ? JSON.parse(v.value) : v.value; },
  async put(k, value, opt = {}) { store.set(k, { value: String(value), exp: opt.expirationTtl ? Date.now() + opt.expirationTtl * 1000 : 0 }); },
  async delete(k) { store.delete(k); },
  async list({ prefix = '', cursor } = {}) { const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })); return { keys, list_complete: true, cursor: undefined }; },
};
const env = { NUGA_KV: KV, AI_ACCESS: 'open', OPEN_AI_DAILY: '200', TOKEN_SECRET: 'dev-only-secret', ALLOWED_RETURN: 'http://localhost:5180,http://127.0.0.1:5180', ...process.env };

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const url = `http://${req.headers.host}${req.url}`;
  const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, duplex: 'half' });
  try {
    const r = await worker.fetch(request, env, { waitUntil() {} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
  console.log(req.method, req.url.split('?')[0]);
}).listen(port, () => console.log(`누가 서버 (로컬) http://localhost:${port}`));
