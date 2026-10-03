// 누가 서버 점검: worker.js를 직접 불러 가짜 KV·가짜 외부 응답으로 확인한다.
// 실행: npm test  (node test/harness.mjs)
import worker from '../worker.js';

// ---------- 메모리 KV ----------
function makeKV() {
  const m = new Map();
  const live = (k) => { const e = m.get(k); if (!e) return null; if (e.exp && e.exp <= Date.now()) { m.delete(k); return null; } return e; };
  return {
    _map: m,
    async get(k, type) { const e = live(k); if (!e) return null; return type === 'json' ? JSON.parse(e.value) : e.value; },
    async put(k, value, opt = {}) {
      if (typeof value !== 'string') throw new Error('KV 값은 문자열이어야 함');
      m.set(k, { value, exp: opt.expirationTtl ? Date.now() + opt.expirationTtl * 1000 : 0, ttl: opt.expirationTtl });
    },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const names = [...m.keys()].filter((k) => k.startsWith(prefix) && live(k)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + limit);
      const done = start + limit >= names.length;
      return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
}

// ---------- 가짜 외부 fetch ----------
const calls = [];
let geminiReply = null; // (body) => object
let whaleUser = null;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  calls.push({ url, init });
  const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'generativelanguage.googleapis.com') {
    const body = JSON.parse(init.body);
    return reply({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply(body)) }] } }] });
  }
  if (u.host === 'open.neis.go.kr') {
    const svc = u.pathname.split('/').pop();
    const rows = NEIS[svc]?.(u.searchParams);
    if (!rows || !rows.length) return reply({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } });
    return reply({ [svc]: [{ head: [{ list_total_count: rows.length }, { RESULT: { CODE: 'INFO-000' } }] }, { row: rows }] });
  }
  if (u.host === 'apis.data.go.kr') {
    const mm = u.searchParams.get('solMonth');
    const item = HOL[mm];
    return reply({ response: { header: { resultCode: '00' }, body: { items: item ? { item } : '', totalCount: 1 } } });
  }
  if (url.startsWith('https://auth.whalespace.io/oauth2/v1.1/token')) {
    const p = new URLSearchParams(init.body.toString());
    return p.get('code') === 'good' ? reply({ access_token: 'AT', token_type: 'Bearer' }) : reply({ error: 'invalid_grant' }, 400);
  }
  if (url.startsWith('https://www.whalespaceapis.com/v1/users/me')) return reply(whaleUser);
  throw new Error('예상 못 한 외부 요청: ' + url);
};

const NEIS = {
  schoolInfo: (q) => q.get('SCHUL_NM') === '해밀' ? [
    { ATPT_OFCDC_SC_CODE: 'B10', ATPT_OFCDC_SC_NM: '서울특별시교육청', SD_SCHUL_CODE: '7010000', SCHUL_NM: '해밀고등학교', SCHUL_KND_SC_NM: '고등학교', ORG_RDNMA: '서울특별시 어딘가로 1' },
    { ATPT_OFCDC_SC_CODE: 'B10', ATPT_OFCDC_SC_NM: '서울특별시교육청', SD_SCHUL_CODE: '7010001', SCHUL_NM: '해밀초등학교', SCHUL_KND_SC_NM: '초등학교', ORG_RDNMA: '' },
  ] : [],
  hisTimetable: (q) => [
    { ALL_TI_YMD: '20261013', PERIO: '3', GRADE: '2', CLASS_NM: '5', ITRT_CNTNT: '화학Ⅰ' },
    { ALL_TI_YMD: '20261013', PERIO: '2', GRADE: '2', CLASS_NM: '3', ITRT_CNTNT: '화학Ⅰ' },
  ].filter(() => q.get('GRADE') === '2' && q.get('TI_FROM_YMD') === '20261012'),
  SchoolSchedule: () => [
    { AA_YMD: '20261003', EVENT_NM: '개천절', SBTR_DD_SC_NM: '공휴일' },
    { AA_YMD: '20261002', EVENT_NM: '재량휴업일', SBTR_DD_SC_NM: '휴업일' },
    { AA_YMD: '20261015', EVENT_NM: '체육대회', SBTR_DD_SC_NM: '해당없음' },
  ],
};
const HOL = {
  '10': [
    { locdate: 20261003, dateName: '개천절', isHoliday: 'Y' },
    { locdate: 20261005, dateName: '대체공휴일', isHoliday: 'Y' },
    { locdate: 20261009, dateName: '한글날', isHoliday: 'Y' },
  ],
  '11': { locdate: 20261111, dateName: '가상 기념일', isHoliday: 'N' }, // 쉬는 날 아님 → 빠져야 함
};

// ---------- 점검 도구 ----------
let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}
const BASE = 'https://nuga.example.workers.dev';
const APP = 'https://nuga.example.github.io';
function baseEnv(over = {}) {
  return {
    NUGA_KV: makeKV(), GEMINI_API_KEY: 'G-KEY', NEIS_KEY: 'N-KEY', HOLIDAY_KEY: 'H-KEY', TOKEN_SECRET: 'secret-for-tests',
    WHALE_CLIENT_ID: 'cid', WHALE_CLIENT_SECRET: 'csecret', AI_ACCESS: 'token', ALLOWED_RETURN: `${APP}, https://other.example`, ...over,
  };
}
async function call(env, path, { method = 'GET', body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let b = body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') { b = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request(BASE + path, { method, body: b, headers: h }), env, {});
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
async function hmacToken(secret, payload) {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${body}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))))}`;
}
const fragment = (loc) => JSON.parse(Buffer.from(loc.split('#ws=')[1], 'base64url').toString('utf8'));

// ---------- 점검 ----------
async function main() {
  const env = baseEnv();
  const day = Date.now() + 3600e3;
  const tea = await hmacToken(env.TOKEN_SECRET, { t: 'tea', sc: '7010000', sid: 'abcd', exp: day });
  const stu7 = await hmacToken(env.TOKEN_SECRET, { t: 'stu', sc: '7010000', cls: '2-3', no: 7, exp: day });
  const stu8 = await hmacToken(env.TOKEN_SECRET, { t: 'stu', sc: '7010000', cls: '2-3', no: 8, exp: day });

  console.log('# 기본');
  {
    const r = await worker.fetch(new Request(BASE + '/box/x', { method: 'OPTIONS' }), env, {});
    ok(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === '*' && /Authorization/.test(r.headers.get('Access-Control-Allow-Headers')), 'OPTIONS → 204 + CORS');
    const h = await call(env, '/health');
    ok(h.status === 200 && h.data.ok === true && h.data.version === '0.9.0' && h.data.aiAccess === 'token', 'health 기본');
    ok(JSON.stringify(h.data.features) === JSON.stringify({ box: true, ai: true, neis: true, holiday: true, whalespace: true }), 'health 기능 표시');
    ok(h.headers.get('Access-Control-Allow-Origin') === '*', 'JSON 응답에 CORS');
    const h2 = await call({ NUGA_KV: makeKV(), AI_ACCESS: 'open' }, '/health');
    ok(h2.data.features.ai === false && h2.data.features.whalespace === false && h2.data.aiAccess === 'open', 'health 키 없음·open');
    ok((await call(env, '/nope')).status === 404, '없는 주소 404');
  }

  console.log('# 암호화 전달함');
  {
    const ch = 'a'.repeat(32);
    ok((await call(env, '/box/XYZ', { method: 'POST', body: { msg: 'a.b' } })).data.error === 'bad_channel', '잘못된 채널 거부');
    // 실제 AES-GCM으로 봉한 기록
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const plain = JSON.stringify({ class: '2-3', no: 12, cat: 1, note: '평문비밀문장' });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
    const msg = `${b64u(iv)}.${b64u(ct)}`;
    const p1 = await call(env, `/box/${ch}`, { method: 'POST', body: { msg } });
    ok(p1.status === 201 && typeof p1.data.id === 'string', 'POST → 201 id');
    await new Promise((r) => setTimeout(r, 3));
    const p2 = await call(env, `/box/${ch}`, { method: 'POST', body: { msg: msg + 'A' } });
    ok(p2.status === 201, '두 번째 저장');
    const stored = [...env.NUGA_KV._map].filter(([k]) => k.startsWith(`box:${ch}:`));
    ok(stored.length === 2 && stored.every(([, e]) => e.value.startsWith(b64u(iv) + '.') && !e.value.includes('평문') && !e.value.includes('2-3')), 'KV에는 암호문만');
    ok(stored.every(([, e]) => e.ttl === 7 * 86400), 'KV TTL 7일');
    ok((await call(env, `/box/${ch}`, { method: 'POST', body: { msg: 'hello world' } })).status === 400, '형식 틀린 msg 400');
    ok((await call(env, `/box/${ch}`, { method: 'POST', body: 'not json' })).status === 400, 'JSON 아님 400');
    ok((await call(env, `/box/${ch}`, { method: 'POST', body: { msg: 'A'.repeat(16) + '.' + 'B'.repeat(16400) } })).status === 413, '16KB 넘는 msg 413');
    const g = await call(env, `/box/${ch}`);
    ok(g.status === 200 && g.data.items.length === 2 && g.data.items[0].id === p1.data.id && g.data.items[0].msg === msg && typeof g.data.items[0].at === 'number', 'GET 오래된 것 먼저');
    const a = await call(env, `/box/${ch}/ack`, { method: 'POST', body: { ids: [p1.data.id, p2.data.id, 'bogus'] } });
    ok(a.data.ok === true && a.data.removed === 2, 'ack 삭제 수');
    ok((await call(env, `/box/${ch}`)).data.items.length === 0 && ![...env.NUGA_KV._map.keys()].some((k) => k.startsWith(`box:${ch}`)), 'ack 후 비어 있음');
    const ch2 = 'b'.repeat(32);
    for (let i = 0; i < 500; i++) await env.NUGA_KV.put(`box:${ch2}:${String(1e12 + i).padStart(13, '0')}-00000000`, msg, { expirationTtl: 60 });
    ok((await call(env, `/box/${ch2}`, { method: 'POST', body: { msg } })).status === 429, '채널당 500건 넘으면 429');
  }

  console.log('# 토큰');
  {
    const forged = tea.slice(0, -3) + (tea.endsWith('AAA') ? 'BBB' : 'AAA');
    const f = await call(env, '/feedback/send', { method: 'POST', token: forged, body: { cards: [] } });
    ok(f.status === 401 && f.data.error === 'bad_token', '위조 토큰 401 bad_token');
    const other = await hmacToken('other-secret', { t: 'tea', sc: '7010000', sid: 'x', exp: day });
    ok((await call(env, '/feedback/send', { method: 'POST', token: other, body: { cards: [] } })).data.error === 'bad_token', '다른 비밀로 서명한 토큰 거부');
    const expired = await hmacToken(env.TOKEN_SECRET, { t: 'tea', sc: '7010000', sid: 'x', exp: Date.now() - 1 });
    ok((await call(env, '/feedback/send', { method: 'POST', token: expired, body: { cards: [] } })).data.error === 'bad_token', '만료 토큰 거부');
    ok((await call(env, '/ai/draft', { method: 'POST', token: 'garbage', body: { records: [] } })).data.error === 'bad_token', '형식 틀린 토큰 거부');
  }

  console.log('# AI');
  {
    const r0 = await call(env, '/ai/suggest', { method: 'POST', body: { segments: [] } });
    ok(r0.status === 401 && r0.data.error === 'login_required', '토큰 없는 AI 거부');
    ok((await call(env, '/ai/suggest', { method: 'POST', token: stu7, body: { segments: [] } })).data.error === 'login_required', '학생 토큰으로 AI 거부');
    const noKey = baseEnv({ GEMINI_API_KEY: '' });
    ok((await call(noKey, '/ai/draft', { method: 'POST', token: tea, body: { records: [] } })).data.error === 'ai_off', '키 없으면 503 ai_off');

    // 전사
    let seen;
    geminiReply = (body) => {
      seen = body;
      return { segments: [
        { start: 12.5, speaker: 'B', text: '○○아 그럼 온도를 올리면 왜 빨라져요?', summary: '온도와 반응 속도의 관계를 묻는 질문으로 아주 깁니다' },
        { start: 3, speaker: 'A', text: '오늘은 반응 속도를 배웁니다.', summary: '수업 안내' },
        { start: 20, speaker: 'A', text: '좋은 질문이에요.', summary: '응답' },
      ] };
    };
    const fd = new FormData();
    fd.append('audio', new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/webm;codecs=opus' }), 'a.webm');
    const t = await call(env, '/ai/transcribe', { method: 'POST', token: tea, body: fd });
    ok(t.status === 200 && t.data.segments.length === 3, '전사 결과');
    ok(t.data.segments[0].start === 3 && t.data.segments.every((s) => /^화자\d+$/.test(s.speaker)), '시간순·화자N 표기');
    ok(t.data.segments[0].speaker !== t.data.segments[1].speaker && t.data.segments[0].speaker === t.data.segments[2].speaker, '화자 구분 유지');
    ok(t.data.segments.every((s) => s.summary.length <= 25), '요약 25자 이내');
    const gcall = calls.filter((c) => c.url.includes('generativelanguage')).pop();
    ok(gcall.url.endsWith('/models/gemini-2.5-flash:generateContent') && gcall.init.headers['x-goog-api-key'] === 'G-KEY', 'Gemini 주소·키 헤더');
    ok(seen.generationConfig.responseMimeType === 'application/json' && seen.generationConfig.responseSchema.type === 'OBJECT', 'JSON 스키마 요청');
    const inl = seen.contents[0].parts.find((p) => p.inline_data).inline_data;
    ok(inl.mime_type === 'audio/webm' && inl.data === Buffer.from([1, 2, 3, 4, 5]).toString('base64'), '음성 inline_data(base64)');
    ok(/화자1/.test(seen.systemInstruction.parts[0].text) && /○○/.test(seen.systemInstruction.parts[0].text), '전사 프롬프트 규칙');
    const big = new FormData();
    big.append('audio', new Blob([new Uint8Array(14 * 1024 * 1024 + 10)], { type: 'audio/webm' }), 'b.webm');
    ok((await call(env, '/ai/transcribe', { method: 'POST', token: tea, body: big })).status === 413, '14MB 넘는 음성 413');
    ok((await call(env, '/ai/transcribe', { method: 'POST', token: tea, body: new FormData() })).status === 400, '음성 없음 400');

    // 놓친 발언 추천
    geminiReply = (body) => {
      seen = body;
      return { items: [
        { segId: 's2', criteria: '깊이 있는 질문', cat: 0, score: 0.9, sum: '온도와 반응 속도 질문' },
        { segId: 's1', criteria: '근거 제시', cat: 3, score: 0.8, sum: '교사 발언' },
        { segId: 'zzz', criteria: '개념 연결', cat: 3, score: 0.7, sum: '없는 구간' },
        { segId: 's3', criteria: '협력·배려', cat: 7, score: 3, sum: '역할 나누기 제안' },
        { segId: 's2', criteria: '깊이 있는 질문', cat: 0, score: 0.5, sum: '중복' },
      ] };
    };
    const sg = await call(env, '/ai/suggest', { method: 'POST', token: tea, body: {
      segments: [
        { id: 's1', t0: 1, speaker: '화자1', text: '오늘은 반응 속도를 배웁니다.', name: '홍길동' },
        { id: 's2', t0: 2, speaker: '화자2', text: '그럼 온도를 올리면 왜 빨라져요?', studentName: '김철수' },
        { id: 's3', t0: 3, speaker: '화자3', text: '제가 그래프 정리 맡을게요, 같이 해요.' },
      ], teacherSpeaker: '화자1', unit: '반응 속도', categories: ['질문', '발표', '협동', '탐구'], max: 5,
    } });
    ok(sg.status === 200 && sg.data.items.map((i) => i.segId).join() === 's3,s2', '교사·모르는 id·중복 제외, 점수순');
    ok(sg.data.items[0].cat === 3 && sg.data.items[0].score === 1 && sg.data.items[1].sum === '온도와 반응 속도 질문', 'cat·score 범위 보정');
    const sent = JSON.stringify(seen);
    ok(!sent.includes('"name"') && !sent.includes('홍길동') && !sent.includes('김철수'), 'Gemini 요청에 이름 필드 없음');
    ok(CRIT_OK(seen), '추천 기준 6가지 프롬프트');

    // 세특 초안
    geminiReply = (body) => {
      seen = body;
      return { sentences: [
        { text: '온도와 반응 속도의 관계를 그래프로 설명함.', evidence: ['r1'] },
        { text: '근거 없는 문장임.', evidence: [] },
        { text: '지어낸 근거를 댄 문장임.', evidence: ['r1', 'r9'] },
        { text: '교내 탐구 활동에서 역할을 나누어 협력함.', evidence: ['r2', 'r1'] },
        { text: '과학 대회에 나가 수상함.', evidence: ['r2'] },
      ] };
    };
    const dr = await call(env, '/ai/draft', { method: 'POST', token: tea, body: {
      records: [{ id: 'r1', text: '그래프로 반응 속도 설명', cat: 3, std: ['[예시 3-1]'], date: '2026-10-13', name: '홍길동' }, { id: 'r2', text: '역할 나누기 제안', cat: 2, std: [], date: '2026-10-13' }],
      standards: { '[예시 3-1]': '반응 속도에 영향을 주는 요인을 설명할 수 있다.' }, limit: 1500, level: 'high', guide: '탐구 과정 중심', subject: '화학Ⅰ',
    } });
    ok(dr.status === 200 && dr.data.sentences.length === 2, '근거 없는·모르는 근거·금지어 문장 버림');
    ok(dr.data.sentences[1].evidence.join() === 'r2,r1', '근거 id 유지');
    ok(!JSON.stringify(seen).includes('홍길동') && !JSON.stringify(seen).includes('"name"'), '초안 요청에 이름 없음');
    ok(/명사형/.test(seen.systemInstruction.parts[0].text) && /사교육/.test(seen.systemInstruction.parts[0].text), '초안 프롬프트 규칙');

    // open 모드 하루 한도
    const open = baseEnv({ AI_ACCESS: 'open', OPEN_AI_DAILY: '2' });
    const ip = { 'CF-Connecting-IP': '203.0.113.5' };
    const o1 = await call(open, '/ai/draft', { method: 'POST', headers: ip, body: { records: [] } });
    const o2 = await call(open, '/ai/draft', { method: 'POST', headers: ip, body: { records: [] } });
    const o3 = await call(open, '/ai/draft', { method: 'POST', headers: ip, body: { records: [] } });
    ok(o1.status === 200 && o2.status === 200 && o3.status === 429 && o3.data.error === 'daily_limit', 'open 모드: 토큰 없이 쓰고 하루 한도 429');
    ok((await call(open, '/ai/draft', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.6' }, body: { records: [] } })).status === 200, '다른 IP는 따로 셈');
  }

  console.log('# 학교 정보');
  {
    const off = baseEnv({ NEIS_KEY: '' });
    ok((await call(off, '/school/search?name=해밀')).data.error === 'neis_off', '키 없으면 neis_off');
    const s = await call(env, '/school/search?name=' + encodeURIComponent('해밀'));
    ok(s.status === 200 && s.data.schools.length === 2 && s.data.schools[0].kind === 'high' && s.data.schools[1].kind === 'elem', '학교 검색·학교급');
    ok(s.data.schools[0].code === '7010000' && s.data.schools[0].office === 'B10' && s.data.schools[0].officeName === '서울특별시교육청', '학교 필드');
    ok((await call(env, '/school/search?name=' + encodeURIComponent('없는학교'))).data.schools.length === 0, '검색 결과 없음');
    const tt = await call(env, '/school/timetable?office=B10&code=7010000&kind=high&from=2026-10-12&to=2026-10-16&grade=2');
    ok(tt.status === 200 && tt.data.items.length === 2 && tt.data.items[0].period === 2 && tt.data.items[0].class === '2-3' && tt.data.items[0].date === '2026-10-13' && tt.data.items[0].subject === '화학Ⅰ', '시간표');
    ok(calls.some((c) => c.url.includes('/hub/hisTimetable')), '고등 → hisTimetable');
    await call(env, '/school/timetable?office=B10&code=1&kind=middle&from=20261012&to=20261016');
    await call(env, '/school/timetable?office=B10&code=1&kind=elem&from=20261012&to=20261016');
    await call(env, '/school/timetable?office=B10&code=1&kind=special&from=20261012&to=20261016');
    ok(['misTimetable', 'elsTimetable', 'spsTimetable'].every((sv) => calls.some((c) => c.url.includes('/hub/' + sv))), '학교급별 시간표 서비스');
    ok((await call(env, '/school/timetable?office=B10&code=1&kind=uni&from=20261012&to=20261016')).status === 400, '모르는 학교급 400');
    const cal = await call(env, '/school/calendar?office=B10&code=7010000&from=2026-10-01&to=2026-11-30');
    const days = cal.data.days;
    ok(cal.status === 200 && JSON.stringify(days.map((d) => d.date)) === JSON.stringify(['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-09']), '학사일정 + 공휴일 합치기(날짜 중복 제거·정렬)');
    ok(days[0].reason === '재량휴업일' && days[3].reason === '한글날', '쉬는 이유');
    ok(calls.some((c) => c.url.includes('getRestDeInfo') && c.url.includes('solMonth=11')), '기간의 달마다 특일 조회');
    const noHol = baseEnv({ HOLIDAY_KEY: '' });
    ok((await call(noHol, '/school/calendar?office=B10&code=7010000&from=20261001&to=20261031')).data.days.length === 2, '특일 키 없으면 학사일정만');
  }

  console.log('# 웨일 스페이스 로그인');
  {
    const bad = await call(env, '/auth/whalespace?return=' + encodeURIComponent('https://evil.example/app'));
    ok(bad.status === 400 && bad.data.error === 'bad_return', '허용 안 된 돌아갈 주소 거부');
    ok((await call(env, '/auth/whalespace?return=' + encodeURIComponent('file:///C:/nuga/index.html'))).data.error === 'bad_return', 'file: 거부');
    ok((await call(env, '/auth/whalespace?return=' + encodeURIComponent('http://localhost:8080/'))).status === 302, 'http://localhost 허용');

    const start = async (role) => {
      const r = await call(env, `/auth/whalespace?return=${encodeURIComponent(APP + '/nuga/#settings')}${role ? '&role=' + role : ''}`);
      const loc = new URL(r.headers.get('Location'));
      return { r, loc, state: loc.searchParams.get('state') };
    };
    const { r, loc, state } = await start();
    ok(r.status === 302 && loc.origin + loc.pathname === 'https://auth.whalespace.io/oauth2/v1.1/authorize', '인증 주소로 302');
    ok(loc.searchParams.get('client_id') === 'cid' && loc.searchParams.get('response_type') === 'code' && loc.searchParams.get('redirect_uri') === BASE + '/auth/whalespace/callback' && loc.searchParams.get('scope') === 'openid profile', '인증 요청 인자');
    ok(env.NUGA_KV._map.get('st:' + state)?.ttl === 600, 'state 10분 저장');

    whaleUser = { data: { userId: 'raw-user-id-12345', name: '홍교사', userType: 'TEACHER', school: { schoolName: '해밀고등학교', schoolCode: '7010000', officeCode: 'B10', schoolKind: '고등학교' } } };
    const cb = await call(env, `/auth/whalespace/callback?code=good&state=${state}`);
    const L = cb.headers.get('Location');
    const f = fragment(L);
    ok(cb.status === 302 && L.startsWith(APP + '/nuga/#ws='), '앱 주소#ws=로 돌려보냄');
    ok(f.userType === 'tea' && /^[0-9a-f]{16}$/.test(f.sid) && f.school.code === '7010000' && f.school.office === 'B10' && f.school.kind === 'high' && f.school.name === '해밀고등학교', '교사 결과');
    ok(!L.includes('raw-user-id') && !Buffer.from(L.split('#ws=')[1], 'base64url').toString().includes('raw-user-id') && !JSON.stringify(f).includes('홍교사'), '아이디 해시·이름 없음');
    ok(f.exp > Date.now() + 11 * 3600e3 && f.exp <= Date.now() + 12 * 3600e3, '토큰 12시간');
    const useTok = await call(env, '/ai/draft', { method: 'POST', token: f.token, body: { records: [] } });
    ok(useTok.status === 200, '발급 토큰으로 AI 사용');
    const again = await call(env, `/auth/whalespace/callback?code=good&state=${state}`);
    ok(again.status === 400 && again.data.error === 'bad_state', 'state 재사용 거부');
    ok((await call(env, '/auth/whalespace/callback?code=good&state=' + 'f'.repeat(32))).data.error === 'bad_state', '모르는 state 거부');

    const s2 = await start();
    ok(fragment((await call(env, `/auth/whalespace/callback?error=access_denied&state=${s2.state}`)).headers.get('Location')).error === 'cancelled', '취소 → cancelled');

    const s3 = await start('student');
    whaleUser = { userId: 'stu-raw-1', userType: 'STUDENT', schoolCode: '7010000', grade: 2, classNum: 3, number: 7 };
    const sf = fragment((await call(env, `/auth/whalespace/callback?code=good&state=${s3.state}`)).headers.get('Location'));
    ok(sf.userType === 'stu' && sf.className === '2-3' && sf.number === 7 && sf.token && !JSON.stringify(sf).includes('stu-raw-1'), '학생 결과');
    const mine = await call(env, '/feedback/mine', { token: sf.token });
    ok(mine.status === 200 && Array.isArray(mine.data.cards), '학생 토큰으로 내 카드 조회');

    const s4 = await start('student');
    whaleUser = { userId: 't1', userType: 'TEACHER', schoolCode: '7010000' };
    ok(fragment((await call(env, `/auth/whalespace/callback?code=good&state=${s4.state}`)).headers.get('Location')).error === 'wrong_role', '학생 화면에 교사 → wrong_role');
    const s5 = await start();
    whaleUser = { userId: 's1', userType: 'STUDENT', schoolCode: '7010000', grade: 2, classNum: 3, number: 7 };
    ok(fragment((await call(env, `/auth/whalespace/callback?code=good&state=${s5.state}`)).headers.get('Location')).error === 'wrong_role', '교사 화면에 학생 → wrong_role');
    const s6 = await start('student');
    whaleUser = { userId: 's2', userType: 'STUDENT', schoolCode: '7010000' };
    ok(fragment((await call(env, `/auth/whalespace/callback?code=good&state=${s6.state}`)).headers.get('Location')).error === 'no_class', '반·번호 없음 → no_class');
    const s7 = await start();
    ok(fragment((await call(env, `/auth/whalespace/callback?code=bad&state=${s7.state}`)).headers.get('Location')).error === 'login_failed', '코드 교환 실패 → login_failed');
  }

  console.log('# 학생 피드백');
  {
    const card = { class: '2-3', no: 7, period: 'unit-3', good: '그래프로 설명한 점이 좋았어요.', next: '다른 의견에 덧붙여 말해 보기', text: '', label: '3단원', name: '홍길동', secret: 1 };
    ok((await call(env, '/feedback/send', { method: 'POST', token: stu7, body: { cards: [card] } })).status === 403, '학생은 보내기 거부(403)');
    ok((await call(env, '/feedback/send', { method: 'POST', body: { cards: [card] } })).status === 401, '토큰 없이 보내기 거부');
    const sd = await call(env, '/feedback/send', { method: 'POST', token: tea, body: { cards: [card, { ...card, no: 8, good: '8번 카드' }, { class: 'x', no: 1, period: 'p' }] } });
    ok(sd.status === 200 && sd.data.ok === true && sd.data.saved === 2, '교사 보내기 저장 수');
    const kv = env.NUGA_KV._map.get('fb:7010000:2-3:7:unit-3');
    ok(kv && kv.ttl === 30 * 86400 && !kv.value.includes('홍길동') && !kv.value.includes('"name"') && !kv.value.includes('secret'), '카드 키·30일·이름 필드 버림');
    const m7 = await call(env, '/feedback/mine', { token: stu7 });
    ok(m7.data.cards.length === 1 && m7.data.cards[0].no === 7 && m7.data.cards[0].good.includes('그래프'), '학생 7번은 자기 카드만');
    const m8 = await call(env, '/feedback/mine', { token: stu8 });
    ok(m8.data.cards.length === 1 && m8.data.cards[0].good === '8번 카드', '학생 8번은 7번 카드를 못 봄');
    const stu70 = await hmacToken(env.TOKEN_SECRET, { t: 'stu', sc: '7010000', cls: '2-3', no: 70, exp: day });
    ok((await call(env, '/feedback/mine', { token: stu70 })).data.cards.length === 0, '70번은 7번 카드와 섞이지 않음');
    const otherSchool = await hmacToken(env.TOKEN_SECRET, { t: 'stu', sc: '9999999', cls: '2-3', no: 7, exp: day });
    ok((await call(env, '/feedback/mine', { token: otherSchool })).data.cards.length === 0, '다른 학교 같은 반·번호는 못 봄');
    ok((await call(env, '/feedback/mine', { token: tea })).status === 403, '교사 토큰으로 mine 거부');
    ok((await call(env, '/feedback/mine')).status === 401, '토큰 없이 mine 거부');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log('FAILED'); process.exit(1); }
  console.log('ALL PASS');
}
const CRIT_OK = (body) => ['깊이 있는 질문', '개념 연결', '오개념 수정·자기 성찰', '근거 제시', '다른 의견 확장', '협력·배려'].every((c) => body.systemInstruction.parts[0].text.includes(c));

main().catch((e) => { console.error(e); console.log('FAILED'); process.exit(1); });
