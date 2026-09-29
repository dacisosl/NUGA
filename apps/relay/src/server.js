// 누가 릴레이 서버 — docs/PROTOCOL.md 4장 구현.
// 서버는 keyId · 암호 봉투 · 수신시각만 보관하고 TTL(기본 24시간) 후 삭제한다.
// 평문 키(K)나 복호화된 내용은 절대 다루지 않는다. 로그에도 본문을 남기지 않는다.

import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { MemoryStore, openStoreFromEnv } from './store.js';

const KEY_ID_RE = /^[0-9a-f]{16}$/;
const ID_RE = /^[0-9a-z]{9}-[0-9a-z]{4}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_ITEMS = 200;
const MAX_WAIT_SEC = 25;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** 시간순으로 정렬되는 서버 id: `<epoch ms base36 9자리>-<seq base36 4자리>` */
export function createIdGenerator() {
  let lastMs = 0;
  let seq = 0;
  return () => {
    const now = Date.now();
    if (now === lastMs) seq = (seq + 1) % 1679616; // 36^4
    else {
      lastMs = now;
      seq = 0;
    }
    return `${now.toString(36).padStart(9, '0')}-${seq.toString(36).padStart(4, '0')}`;
  };
}

/** 봉투 검증. 통과하면 저장할 필드만 뽑아 돌려준다. */
export function validateEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_envelope');
  const { from, iv, ct, ts } = body;
  if (from !== 'phone' && from !== 'pc') throw new HttpError(400, 'invalid_envelope_from');
  if (!isBase64(iv)) throw new HttpError(400, 'invalid_envelope_iv');
  if (!isBase64(ct)) throw new HttpError(400, 'invalid_envelope_ct');
  if (typeof ts !== 'string' || ts.length === 0 || ts.length > 64) throw new HttpError(400, 'invalid_envelope_ts');
  return { from, iv, ct, ts };
}

function isBase64(s) {
  return typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && BASE64_RE.test(s);
}

/** 간단한 IP별 토큰 버킷. perMinute=0 이면 비활성. */
export function createRateLimiter({ perMinute = 120, burst = perMinute } = {}) {
  const buckets = new Map();
  const refillPerMs = perMinute / 60000;
  let lastPrune = Date.now();
  return {
    enabled: perMinute > 0,
    take(ip) {
      if (perMinute <= 0) return true;
      const now = Date.now();
      let b = buckets.get(ip);
      if (!b) {
        b = { tokens: burst, at: now };
        buckets.set(ip, b);
      } else {
        b.tokens = Math.min(burst, b.tokens + (now - b.at) * refillPerMs);
        b.at = now;
      }
      if (now - lastPrune > 60000) {
        lastPrune = now;
        for (const [k, v] of buckets) if (now - v.at > 120000) buckets.delete(k);
      }
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
  };
}

/**
 * 릴레이 서버 생성.
 * @param {object} [opts]
 * @param {number} [opts.ttlHours=24]
 * @param {number} [opts.ttlMs]            ttlHours 대신 밀리초 지정(테스트용)
 * @param {number} [opts.maxBody=262144]
 * @param {object} [opts.store]            store.js 인터페이스 구현체 (기본 MemoryStore)
 * @param {number} [opts.rateLimitPerMinute=120]  0이면 비활성
 * @param {number} [opts.sweepIntervalMs=60000]
 * @param {boolean} [opts.trustProxy=false]  X-Forwarded-For / Fly-Client-IP 신뢰
 * @param {(line: string) => void} [opts.log]
 */
export function createRelay(opts = {}) {
  const ttlHours = opts.ttlHours ?? 24;
  const ttlMs = opts.ttlMs ?? ttlHours * 3600 * 1000;
  const maxBody = opts.maxBody ?? 262144;
  const store = opts.store ?? new MemoryStore();
  const limiter = createRateLimiter({ perMinute: opts.rateLimitPerMinute ?? 120 });
  const trustProxy = opts.trustProxy ?? false;
  const log = opts.log ?? ((line) => process.stdout.write(line + '\n'));
  const nextId = createIdGenerator();

  /** keyId → Set<() => void> 롱폴링 대기자 */
  const waiters = new Map();
  function notify(keyId) {
    const set = waiters.get(keyId);
    if (!set) return;
    waiters.delete(keyId);
    for (const wake of set) wake();
  }
  function waitFor(keyId, ms, req) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        req.off('close', finish);
        const set = waiters.get(keyId);
        if (set) {
          set.delete(finish);
          if (set.size === 0) waiters.delete(keyId);
        }
        resolve();
      };
      const timer = setTimeout(finish, ms);
      req.once('close', finish);
      let set = waiters.get(keyId);
      if (!set) {
        set = new Set();
        waiters.set(keyId, set);
      }
      set.add(finish);
    });
  }

  function sweep(now = Date.now()) {
    return store.sweep(now - ttlMs);
  }
  const sweepTimer = setInterval(() => {
    try {
      const n = sweep();
      if (n) log(`${new Date().toISOString()} sweep removed=${n}`);
    } catch (err) {
      log(`${new Date().toISOString()} sweep error=${err.message}`);
    }
  }, opts.sweepIntervalMs ?? 60000);
  sweepTimer.unref();

  function clientIp(req) {
    if (trustProxy) {
      const fly = req.headers['fly-client-ip'];
      if (typeof fly === 'string' && fly) return fly;
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function send(res, status, body, extra) {
    const headers = { ...CORS_HEADERS, ...extra };
    if (body === undefined) {
      res.writeHead(status, headers);
      res.end();
      return;
    }
    const json = JSON.stringify(body);
    res.writeHead(status, {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBody) return reject(new HttpError(413, 'body_too_large'));
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBody) {
          reject(new HttpError(413, 'body_too_large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (size === 0) return reject(new HttpError(400, 'invalid_json'));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new HttpError(400, 'invalid_json'));
        }
      });
      req.on('error', () => reject(new HttpError(400, 'bad_request')));
    });
  }

  async function handle(req, res, url) {
    const { method } = req;
    if (method === 'OPTIONS') return send(res, 204);

    if (url.pathname === '/health') {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed');
      return send(res, 200, { ok: true, ttlHours: ttlMs / 3600000 });
    }

    const m = /^\/box\/([^/]+)(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (!m) throw new HttpError(404, 'not_found');
    const keyId = m[1];
    const msgId = m[2];
    if (!KEY_ID_RE.test(keyId)) throw new HttpError(400, 'invalid_key_id');

    if (msgId !== undefined) {
      if (method !== 'DELETE') throw new HttpError(405, 'method_not_allowed');
      if (!ID_RE.test(msgId)) throw new HttpError(400, 'invalid_id');
      if (!store.deleteOne(keyId, msgId)) throw new HttpError(404, 'not_found');
      return send(res, 204);
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const env = validateEnvelope(body);
      const receivedAt = Date.now();
      const id = nextId();
      store.insert({ id, keyId, ...env, receivedAt });
      notify(keyId);
      return send(res, 201, { id, ts: new Date(receivedAt).toISOString() });
    }

    if (method === 'GET') {
      const forParam = url.searchParams.get('for');
      let from = null;
      if (forParam !== null) {
        if (forParam === 'pc') from = 'phone';
        else if (forParam === 'phone') from = 'pc';
        else throw new HttpError(400, 'invalid_for');
      }
      const after = url.searchParams.get('after');
      if (after !== null && !ID_RE.test(after)) throw new HttpError(400, 'invalid_after');
      const waitParam = url.searchParams.get('wait');
      let waitMs = 0;
      if (waitParam !== null) {
        const sec = Number(waitParam);
        if (!Number.isFinite(sec) || sec < 0) throw new HttpError(400, 'invalid_wait');
        waitMs = Math.min(sec, MAX_WAIT_SEC) * 1000;
      }
      const query = () => store.list(keyId, { from, after, limit: MAX_ITEMS, notBefore: Date.now() - ttlMs });
      let items = query();
      if (items.length === 0 && waitMs > 0) {
        const deadline = Date.now() + waitMs;
        while (items.length === 0 && !req.destroyed) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          await waitFor(keyId, remaining, req);
          if (req.destroyed) return;
          items = query();
        }
      }
      return send(res, 200, {
        items: items.map((r) => ({ id: r.id, from: r.from, iv: r.iv, ct: r.ct, ts: r.ts })),
      });
    }

    if (method === 'DELETE') {
      store.deleteAll(keyId);
      return send(res, 204);
    }

    throw new HttpError(405, 'method_not_allowed');
  }

  const server = http.createServer((req, res) => {
    const started = process.hrtime.bigint();
    const ip = clientIp(req);
    let url;
    try {
      url = new URL(req.url, 'http://relay.local');
    } catch {
      url = new URL('/invalid', 'http://relay.local');
    }
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const wait = url.searchParams.has('wait') ? ' wait' : '';
      log(`${new Date().toISOString()} ${req.method} ${maskPath(url.pathname)} ${res.statusCode} ${ms.toFixed(1)}ms ip=${ip}${wait}`);
    });

    if (req.method !== 'OPTIONS' && !limiter.take(ip)) {
      return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '10' });
    }

    handle(req, res, url).catch((err) => {
      if (res.headersSent || res.writableEnded) return;
      if (err instanceof HttpError) return send(res, err.status, { error: err.code });
      log(`${new Date().toISOString()} error ${req.method} ${maskPath(url.pathname)} ${err?.stack || err}`);
      send(res, 500, { error: 'internal_error' });
    });
  });
  server.keepAliveTimeout = 30000;
  server.headersTimeout = 35000;
  server.requestTimeout = 60000;

  return {
    server,
    store,
    ttlMs,
    sweep,
    /** 서버를 열고 { port, host } 를 돌려준다. */
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          const addr = server.address();
          resolve({ port: addr.port, host: addr.address });
        });
      });
    },
    async close() {
      clearInterval(sweepTimer);
      for (const set of waiters.values()) for (const wake of set) wake();
      await new Promise((resolve) => {
        server.closeIdleConnections?.();
        server.close(() => resolve());
        setTimeout(() => {
          server.closeAllConnections?.();
          resolve();
        }, 1000).unref();
      });
      store.close?.();
    },
  };
}

/** 로그에 keyId 전체를 남기지 않는다 (keyId 는 접근 권한 그 자체). */
function maskPath(pathname) {
  return pathname.replace(/^\/box\/([0-9a-f]{4})[0-9a-f]{12}/, '/box/$1...');
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

export async function main(env = process.env) {
  const port = Number(env.PORT || 8787);
  const host = env.HOST || '0.0.0.0';
  const ttlHours = Number(env.RELAY_TTL_HOURS || 24);
  const maxBody = Number(env.RELAY_MAX_BODY || 262144);
  const rateLimitPerMinute = env.RELAY_RATE_LIMIT !== undefined ? Number(env.RELAY_RATE_LIMIT) : 120;
  const trustProxy =
    env.RELAY_TRUST_PROXY === '1' || env.RELAY_TRUST_PROXY === 'true' || Boolean(env.FLY_APP_NAME);
  if (!(ttlHours > 0)) throw new Error('RELAY_TTL_HOURS must be > 0');
  if (!(maxBody > 0)) throw new Error('RELAY_MAX_BODY must be > 0');

  const { store, kind } = await openStoreFromEnv(env);
  const relay = createRelay({ ttlHours, maxBody, store, rateLimitPerMinute, trustProxy });
  relay.sweep();
  const bound = await relay.listen(port, host);

  console.log(
    `[relay] listening on http://${bound.host}:${bound.port}  store=${kind}  ttl=${ttlHours}h  maxBody=${maxBody}B  rateLimit=${rateLimitPerMinute}/min`,
  );
  if (host === '0.0.0.0' || host === '::') {
    for (const ip of lanAddresses()) console.log(`[relay] LAN url: http://${ip}:${bound.port}`);
  }

  let closing = false;
  const shutdown = (sig) => {
    if (closing) return;
    closing = true;
    console.log(`[relay] ${sig} received, shutting down`);
    relay.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return relay;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[relay] fatal: ${err.message}`);
    process.exit(1);
  });
}
