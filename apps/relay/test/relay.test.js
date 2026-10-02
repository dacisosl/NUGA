import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRelay, createIdGenerator } from '../src/server.js';
import { MemoryStore, SqliteStore } from '../src/store.js';

const KEY = '0123456789abcdef';
const b64 = (n) => randomBytes(n).toString('base64');
const envelope = (from = 'phone', extra = {}) => ({
  from,
  iv: b64(12),
  ct: b64(48),
  ts: '2026-05-08T10:12:05+09:00',
  ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 테스트용 릴레이를 띄우고 fetch 헬퍼를 돌려준다. */
async function boot(opts = {}) {
  const relay = createRelay({ log: () => {}, rateLimitPerMinute: 0, ...opts });
  const { port } = await relay.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const api = {
    base,
    relay,
    post: (key, body, init = {}) =>
      fetch(`${base}/box/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        ...init,
      }),
    get: (key, qs = '') => fetch(`${base}/box/${key}${qs}`),
    del: (key, id) => fetch(`${base}/box/${key}${id ? `/${id}` : ''}`, { method: 'DELETE' }),
    close: () => relay.close(),
  };
  return api;
}

describe('id generator', () => {
  test('ids are lexicographically increasing', () => {
    const next = createIdGenerator();
    const ids = Array.from({ length: 500 }, () => next());
    for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1], `${ids[i - 1]} < ${ids[i]}`);
    assert.match(ids[0], /^[0-9a-z]{9}-[0-9a-z]{4}$/);
  });
});

describe('relay HTTP API', () => {
  let api;
  before(async () => {
    api = await boot();
  });
  after(() => api.close());

  test('GET /health', async () => {
    const res = await fetch(`${api.base}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await res.json(), { ok: true, ttlHours: 24 });
  });

  test('OPTIONS preflight → 204 with CORS headers', async () => {
    const res = await fetch(`${api.base}/box/${KEY}`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-methods'), /GET.*POST.*DELETE.*OPTIONS/);
    assert.match(res.headers.get('access-control-allow-headers'), /Content-Type/);
  });

  test('post → get(for=pc) → delete → get empty', async () => {
    const key = 'aaaaaaaaaaaaaaaa';
    const env = envelope('phone');
    const posted = await api.post(key, env);
    assert.equal(posted.status, 201);
    const { id, ts } = await posted.json();
    assert.match(id, /^[0-9a-z]{9}-[0-9a-z]{4}$/);
    assert.ok(!Number.isNaN(Date.parse(ts)));

    const got = await api.get(key, '?for=pc');
    assert.equal(got.status, 200);
    const { items } = await got.json();
    assert.equal(items.length, 1);
    assert.deepEqual(items[0], { id, from: 'phone', iv: env.iv, ct: env.ct, ts: env.ts });
    assert.deepEqual(Object.keys(items[0]).sort(), ['ct', 'from', 'id', 'iv', 'ts']);

    const deleted = await api.del(key, id);
    assert.equal(deleted.status, 204);

    const again = await api.get(key, '?for=pc');
    assert.deepEqual(await again.json(), { items: [] });

    // 이미 지운 것은 404
    assert.equal((await api.del(key, id)).status, 404);
  });

  test('for= filter and after= cursor, oldest first', async () => {
    const key = 'bbbbbbbbbbbbbbbb';
    const p1 = await (await api.post(key, envelope('phone'))).json();
    const c1 = await (await api.post(key, envelope('pc'))).json();
    const p2 = await (await api.post(key, envelope('phone'))).json();
    const c2 = await (await api.post(key, envelope('pc'))).json();

    const forPc = (await (await api.get(key, '?for=pc')).json()).items;
    assert.deepEqual(forPc.map((i) => i.id), [p1.id, p2.id]);
    assert.ok(forPc.every((i) => i.from === 'phone'));

    const forPhone = (await (await api.get(key, '?for=phone')).json()).items;
    assert.deepEqual(forPhone.map((i) => i.id), [c1.id, c2.id]);
    assert.ok(forPhone.every((i) => i.from === 'pc'));

    const all = (await (await api.get(key)).json()).items;
    assert.deepEqual(all.map((i) => i.id), [p1.id, c1.id, p2.id, c2.id]);

    const afterP1 = (await (await api.get(key, `?for=pc&after=${p1.id}`)).json()).items;
    assert.deepEqual(afterP1.map((i) => i.id), [p2.id]);

    const afterLast = (await (await api.get(key, `?after=${c2.id}`)).json()).items;
    assert.deepEqual(afterLast, []);
  });

  test('DELETE /box/{keyId} empties the box', async () => {
    const key = 'cccccccccccccccc';
    await api.post(key, envelope('phone'));
    await api.post(key, envelope('pc'));
    assert.equal((await api.del(key)).status, 204);
    assert.deepEqual(await (await api.get(key)).json(), { items: [] });
    // 다른 상자는 건드리지 않는다
    const other = 'dddddddddddddddd';
    await api.post(other, envelope('phone'));
    await api.del(key);
    assert.equal((await (await api.get(other)).json()).items.length, 1);
  });

  test('validation errors', async () => {
    const bad = async (res, status, pattern) => {
      assert.equal(res.status, status);
      const body = await res.json();
      assert.match(body.error, pattern);
    };
    // keyId
    await bad(await api.get('short'), 400, /invalid_key_id/);
    await bad(await api.get('0123456789ABCDEF'), 400, /invalid_key_id/);
    await bad(await api.post('0123456789abcdeg', envelope()), 400, /invalid_key_id/);
    // envelope
    await bad(await api.post(KEY, envelope('watch')), 400, /invalid_envelope_from/);
    await bad(await api.post(KEY, envelope('phone', { iv: 'not base64!' })), 400, /invalid_envelope_iv/);
    await bad(await api.post(KEY, envelope('phone', { ct: 123 })), 400, /invalid_envelope_ct/);
    await bad(await api.post(KEY, envelope('phone', { ts: 12345 })), 400, /invalid_envelope_ts/);
    await bad(await api.post(KEY, { from: 'phone' }), 400, /invalid_envelope/);
    await bad(await api.post(KEY, '[1,2]'), 400, /invalid_envelope/);
    await bad(await api.post(KEY, '{not json'), 400, /invalid_json/);
    await bad(await api.post(KEY, ''), 400, /invalid_json/);
    // query
    await bad(await api.get(KEY, '?for=watch'), 400, /invalid_for/);
    await bad(await api.get(KEY, '?after=../../etc'), 400, /invalid_after/);
    await bad(await api.get(KEY, '?wait=abc'), 400, /invalid_wait/);
    // routes
    await bad(await fetch(`${api.base}/nope`), 404, /not_found/);
    await bad(await fetch(`${api.base}/box/${KEY}/x/y`), 404, /not_found/);
    await bad(await fetch(`${api.base}/box/${KEY}/000000000-0000`, { method: 'GET' }), 405, /method_not_allowed/);
    await bad(await fetch(`${api.base}/health`, { method: 'POST' }), 405, /method_not_allowed/);
    // 나쁜 요청은 아무것도 저장하지 않았다
    assert.deepEqual(await (await api.get(KEY)).json(), { items: [] });
  });

  test('extra envelope fields are dropped', async () => {
    const key = 'eeeeeeeeeeeeeeee';
    await api.post(key, envelope('pc', { plaintext: 'oops', keyId: key }));
    const { items } = await (await api.get(key, '?for=phone')).json();
    assert.deepEqual(Object.keys(items[0]).sort(), ['ct', 'from', 'id', 'iv', 'ts']);
  });

  test('GET caps at 200 items', async () => {
    const key = 'ffffffffffffffff';
    // 저장소에 직접 넣어 빠르게 채운다
    const next = createIdGenerator();
    for (let i = 0; i < 205; i++) {
      api.relay.store.insert({ id: next(), keyId: key, from: 'phone', iv: b64(12), ct: b64(16), ts: 'x', receivedAt: Date.now() });
    }
    const { items } = await (await api.get(key, '?for=pc')).json();
    assert.equal(items.length, 200);
    const rest = (await (await api.get(key, `?for=pc&after=${items[199].id}`)).json()).items;
    assert.equal(rest.length, 5);
  });
});

describe('body size limit', () => {
  test('rejects bodies over RELAY_MAX_BODY with 413', async () => {
    const api = await boot({ maxBody: 1024 });
    try {
      const big = envelope('phone', { ct: 'A'.repeat(2048) });
      const res = await api.post(KEY, big);
      assert.equal(res.status, 413);
      assert.deepEqual(await res.json(), { error: 'body_too_large' });
      // 크기 안쪽은 통과
      assert.equal((await api.post(KEY, envelope('phone'))).status, 201);
    } finally {
      await api.close();
    }
  });

  test('a 120KB transcript part (encrypted + base64) fits the default 256KB limit', async () => {
    const api = await boot();
    try {
      // 스크립트 조각 JSON 120KB → AES-GCM(+16B) → base64(×4/3) ≈ 160KB 봉투
      const res = await api.post(KEY, envelope('phone', { ct: b64(120_000 + 16) }));
      assert.equal(res.status, 201);
    } finally {
      await api.close();
    }
  });
});

describe('TTL', () => {
  test('expired items disappear from GET and are swept from the store', async () => {
    const api = await boot({ ttlMs: 80, sweepIntervalMs: 20 });
    try {
      const { id } = await (await api.post(KEY, envelope('phone'))).json();
      assert.equal((await (await api.get(KEY, '?for=pc')).json()).items.length, 1);
      await sleep(150);
      assert.deepEqual(await (await api.get(KEY, '?for=pc')).json(), { items: [] });
      // 스위퍼가 실제로 지웠다 (직접 sweep 도 0을 돌려줘야 함)
      assert.equal(api.relay.store.count(), 0);
      assert.equal(api.relay.sweep(), 0);
      assert.equal((await api.del(KEY, id)).status, 404);
      assert.deepEqual(await (await fetch(`${api.base}/health`)).json(), { ok: true, ttlHours: 80 / 3600000 });
    } finally {
      await api.close();
    }
  });

  test('sweep() removes only expired rows', () => {
    const store = new MemoryStore();
    const now = Date.now();
    store.insert({ id: 'a', keyId: KEY, from: 'phone', iv: 'x', ct: 'y', ts: 't', receivedAt: now - 10000 });
    store.insert({ id: 'b', keyId: KEY, from: 'phone', iv: 'x', ct: 'y', ts: 't', receivedAt: now });
    assert.equal(store.sweep(now - 5000), 1);
    assert.deepEqual(store.list(KEY).map((r) => r.id), ['b']);
  });
});

describe('long-poll', () => {
  let api;
  before(async () => {
    api = await boot();
  });
  after(() => api.close());

  test('returns as soon as a message arrives', async () => {
    const key = '1111111111111111';
    const started = Date.now();
    const pending = api.get(key, '?for=pc&wait=10');
    await sleep(150);
    const { id } = await (await api.post(key, envelope('phone'))).json();
    const res = await pending;
    const elapsed = Date.now() - started;
    const { items } = await res.json();
    assert.deepEqual(items.map((i) => i.id), [id]);
    assert.ok(elapsed < 3000, `took ${elapsed}ms`);
    assert.ok(elapsed >= 140, `returned too early: ${elapsed}ms`);
  });

  test('ignores messages not addressed to the poller and keeps waiting', async () => {
    const key = '2222222222222222';
    const started = Date.now();
    const pending = api.get(key, '?for=pc&wait=10');
    await sleep(100);
    await api.post(key, envelope('pc')); // for=pc 는 from=phone 만 받는다
    await sleep(100);
    const { id } = await (await api.post(key, envelope('phone'))).json();
    const { items } = await (await pending).json();
    assert.deepEqual(items.map((i) => i.id), [id]);
    assert.ok(Date.now() - started < 3000);
  });

  test('times out with empty items when nothing arrives', async () => {
    const key = '3333333333333333';
    const started = Date.now();
    const res = await api.get(key, '?for=pc&wait=0.3');
    const elapsed = Date.now() - started;
    assert.deepEqual(await res.json(), { items: [] });
    assert.ok(elapsed >= 250 && elapsed < 2000, `took ${elapsed}ms`);
  });

  test('returns immediately if items already exist', async () => {
    const key = '4444444444444444';
    await api.post(key, envelope('phone'));
    const started = Date.now();
    const { items } = await (await api.get(key, '?for=pc&wait=10')).json();
    assert.equal(items.length, 1);
    assert.ok(Date.now() - started < 1000);
  });

  test('multiple pollers on the same box all wake up', async () => {
    const key = '5555555555555555';
    const polls = [1, 2, 3].map(() => api.get(key, '?for=pc&wait=10'));
    await sleep(100);
    await api.post(key, envelope('phone'));
    const results = await Promise.all(polls.map(async (p) => (await (await p).json()).items.length));
    assert.deepEqual(results, [1, 1, 1]);
  });
});

describe('rate limit', () => {
  test('returns 429 after the per-IP budget is used up', async () => {
    const api = await boot({ rateLimitPerMinute: 5 });
    try {
      const statuses = [];
      for (let i = 0; i < 7; i++) statuses.push((await fetch(`${api.base}/health`)).status);
      assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
      const res = await fetch(`${api.base}/health`);
      assert.equal(res.status, 429);
      assert.deepEqual(await res.json(), { error: 'rate_limited' });
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
      // OPTIONS 는 제한하지 않는다
      assert.equal((await fetch(`${api.base}/health`, { method: 'OPTIONS' })).status, 204);
    } finally {
      await api.close();
    }
  });
});

describe('logging', () => {
  test('logs one line per request without body or full keyId', async () => {
    const lines = [];
    const api = await boot({ log: (l) => lines.push(l) });
    try {
      const env = envelope('phone');
      await api.post(KEY, env);
      await api.get(KEY, '?for=pc&wait=0');
      assert.equal(lines.length, 2);
      assert.match(lines[0], /POST \/box\/0123\.\.\. 201 /);
      assert.match(lines[1], /GET \/box\/0123\.\.\. 200 /);
      for (const l of lines) {
        assert.ok(!l.includes(env.ct), 'ciphertext leaked to log');
        assert.ok(!l.includes(env.iv), 'iv leaked to log');
        assert.ok(!l.includes(KEY), 'full keyId leaked to log');
      }
    } finally {
      await api.close();
    }
  });
});

describe('stores', () => {
  test('MemoryStore persists to and reloads from a JSON file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nuga-relay-'));
    const file = join(dir, 'data.json');
    try {
      const s1 = new MemoryStore({ file, saveDelayMs: 0 });
      s1.insert({ id: 'a', keyId: KEY, from: 'phone', iv: 'x', ct: 'y', ts: 't', receivedAt: 1 });
      s1.insert({ id: 'b', keyId: KEY, from: 'pc', iv: 'x', ct: 'y', ts: 't', receivedAt: 2 });
      s1.close();
      assert.ok(existsSync(file));
      const s2 = new MemoryStore({ file });
      assert.equal(s2.count(), 2);
      assert.deepEqual(s2.list(KEY, { from: 'pc' }).map((r) => r.id), ['b']);
      s2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('SqliteStore passes the same API flow', async (t) => {
    let store;
    try {
      store = await SqliteStore.open(':memory:');
    } catch (err) {
      t.skip(`node:sqlite unavailable: ${err.message}`);
      return;
    }
    const api = await boot({ store });
    try {
      const key = '6666666666666666';
      const a = await (await api.post(key, envelope('phone'))).json();
      const b = await (await api.post(key, envelope('pc'))).json();
      const c = await (await api.post(key, envelope('phone'))).json();
      const forPc = (await (await api.get(key, '?for=pc')).json()).items.map((i) => i.id);
      assert.deepEqual(forPc, [a.id, c.id]);
      const afterA = (await (await api.get(key, `?for=pc&after=${a.id}`)).json()).items.map((i) => i.id);
      assert.deepEqual(afterA, [c.id]);
      assert.equal((await api.del(key, b.id)).status, 204);
      assert.equal((await api.del(key, b.id)).status, 404);
      assert.equal(store.count(), 2);
      assert.equal(store.sweep(Date.now() + 1000), 2);
      assert.equal(store.count(), 0);
      // 롱폴링도 동일하게 동작
      const pending = api.get(key, '?for=phone&wait=5');
      await sleep(50);
      await api.post(key, envelope('pc'));
      assert.equal((await (await pending).json()).items.length, 1);
      assert.equal((await api.del(key)).status, 204);
      assert.equal(store.count(), 0);
    } finally {
      await api.close();
    }
  });
});
