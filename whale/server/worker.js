// 누가 서버 — Cloudflare Worker 한 파일 참고 구현 (앱 제작 문서 8장)
// 외부 의존성 없음: fetch · crypto.subtle · Request/Response · FormData 만 쓴다.
// 저장(KV `NUGA_KV`): 전달함 암호문(7일) · 로그인 state(10분) · 피드백 카드(30일) · open 모드 하루 호출 수
// 학생 이름·평문 기록·음성은 서버에 저장하지 않는다.

const VERSION = '0.9.0';
const DAY = 86400;
const BOX_TTL = 7 * DAY, BOX_MAX_MSG = 16384, BOX_MAX_ITEMS = 500;
const STATE_TTL = 600;
const TOKEN_MS = 12 * 3600 * 1000;
const MAX_AUDIO = 14 * 1024 * 1024;
const CATS = ['질문', '발표', '협동', '탐구'];
const CRITERIA = ['깊이 있는 질문', '개념 연결', '오개념 수정·자기 성찰', '근거 제시', '다른 의견 확장', '협력·배려'];
const FORBIDDEN = ['대회', '수상', '자격증', '어학시험', '토익', '토플', '사교육', '학원', '부모', '교외'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ---------- 응답·오류 ----------
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
});
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
function fail(status, code) { throw new HttpError(status, code); }
// Response.redirect()는 헤더를 못 바꾸므로 직접 만든다.
const redirect = (location) => new Response(null, { status: 302, headers: { Location: location, ...CORS } });

// ---------- 인코딩·암호 도구 ----------
const enc = new TextEncoder(), dec = new TextDecoder();
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64u = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const b64uJson = (obj) => b64u(enc.encode(JSON.stringify(obj)));
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256hex(text) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const clampInt = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function readJson(req, maxChars) {
  const text = await req.text();
  if (text.length > maxChars) fail(413, 'too_large');
  let body;
  try { body = JSON.parse(text); } catch { fail(400, 'bad_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'bad_json');
  return body;
}

// KV 목록을 끝까지 읽는다(커서 따라가기).
async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const r = await kv.list({ prefix, cursor });
    keys.push(...r.keys);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return keys;
}

// ---------- 서명 토큰 (HMAC-SHA256, 12시간) ----------
async function hmacKey(env) {
  if (!env.TOKEN_SECRET) fail(503, 'token_off');
  return crypto.subtle.importKey('raw', enc.encode(env.TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signToken(env, payload) {
  const body = b64uJson(payload);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}
async function verifyToken(env, token) {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token || '');
  if (!m || !env.TOKEN_SECRET) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(m[2]), enc.encode(m[1]));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64u(m[1])));
    if (!p || p.t !== 'tea' || !(Number(p.exp) > Date.now())) return null; // 교사 토큰만 (학생 정보는 서버에 오지 않는다)
    return p;
  } catch { return null; }
}
// 헤더가 없으면 null, 있는데 위조·만료면 401 bad_token.
async function auth(req, env) {
  const h = req.headers.get('Authorization') || '';
  if (!h) return null;
  const p = await verifyToken(env, h.replace(/^Bearer\s+/i, ''));
  if (!p) fail(401, 'bad_token');
  return p;
}

// ---------- 상태 ----------
function health(env) {
  return json({
    ok: true, version: VERSION,
    features: { box: true, ai: !!env.GEMINI_API_KEY, neis: !!env.NEIS_KEY, holiday: !!env.HOLIDAY_KEY, whalespace: !!env.WHALE_CLIENT_ID },
    aiAccess: env.AI_ACCESS === 'open' ? 'open' : 'token',
  });
}

// ---------- 암호화 전달함 (서버는 암호문만 본다) ----------
const BOX_ID = /^\d{13}-[0-9a-f]{8}$/;
const BOX_MSG = /^[A-Za-z0-9_-]{8,}={0,2}\.[A-Za-z0-9_-]{16,}={0,2}$/;
async function boxPost(req, env, ch) {
  const body = await readJson(req, BOX_MAX_MSG + 1024);
  const msg = body.msg;
  if (typeof msg !== 'string') fail(400, 'bad_msg');
  if (msg.length > BOX_MAX_MSG) fail(413, 'too_large');
  if (!BOX_MSG.test(msg)) fail(400, 'bad_msg');
  const keys = await listAll(env.NUGA_KV, `box:${ch}:`);
  if (keys.length >= BOX_MAX_ITEMS) fail(429, 'box_full');
  const id = `${String(Date.now()).padStart(13, '0')}-${randHex(4)}`;
  await env.NUGA_KV.put(`box:${ch}:${id}`, msg, { expirationTtl: BOX_TTL }); // 값은 암호문 문자열 그대로
  return json({ id }, 201);
}
async function boxGet(env, ch) {
  const keys = (await listAll(env.NUGA_KV, `box:${ch}:`)).map((k) => k.name).sort();
  const items = [];
  for (const name of keys) {
    const msg = await env.NUGA_KV.get(name);
    if (msg == null) continue; // 그사이 만료
    const id = name.slice(`box:${ch}:`.length);
    items.push({ id, msg, at: Number(id.slice(0, 13)) });
  }
  return json({ items });
}
async function boxAck(req, env, ch) {
  const body = await readJson(req, 64 * 1024);
  if (!Array.isArray(body.ids)) fail(400, 'bad_ids');
  let removed = 0;
  for (const id of [...new Set(body.ids)].slice(0, BOX_MAX_ITEMS)) {
    if (typeof id !== 'string' || !BOX_ID.test(id)) continue;
    const key = `box:${ch}:${id}`;
    if ((await env.NUGA_KV.get(key)) == null) continue;
    await env.NUGA_KV.delete(key);
    removed++;
  }
  return json({ ok: true, removed });
}

// ---------- AI 대행 (Gemini, 서버에서만) ----------
async function aiGate(req, env) {
  if (!env.GEMINI_API_KEY) fail(503, 'ai_off');
  if (env.AI_ACCESS === 'open') {
    // 심사·시연용: IP당 하루 호출 수 제한
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const key = `rl:${kstDay()}:${ip}`;
    const n = Number(await env.NUGA_KV.get(key)) || 0;
    if (n >= (Number(env.OPEN_AI_DAILY) || 30)) fail(429, 'daily_limit');
    await env.NUGA_KV.put(key, String(n + 1), { expirationTtl: 2 * DAY });
    return;
  }
  const who = await auth(req, env);
  if (!who || who.t !== 'tea') fail(401, 'login_required');
}

async function gemini(env, system, parts, schema) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    }),
  }).catch(() => null);
  if (!r || !r.ok) fail(502, 'ai_failed');
  const data = await r.json().catch(() => null);
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  try { return JSON.parse(text); } catch { fail(502, 'ai_failed'); }
}
const S = (type, extra = {}) => ({ type, ...extra });
const obj = (props) => S('OBJECT', { properties: props, required: Object.keys(props) });

const P_TRANSCRIBE = `너는 학교 수업 녹음을 받아 적는 도구다. 규칙을 반드시 지켜라.
1. 말한 내용을 발화 구간별로 나누어 들리는 그대로 받아 적는다. 알아들을 수 없는 부분은 지어내지 않고 뺀다.
2. 화자는 목소리로만 구분해 "화자1", "화자2"…로만 표시한다. 누구인지(이름, 교사·학생 여부, 성별 등)는 절대 추정하거나 적지 않는다.
3. 본문에 사람 이름이 나오면 모두 "○○"으로 바꾼다.
4. start는 녹음 시작부터 그 구간이 시작된 시각(초, 숫자)이다.
5. summary는 그 구간의 요지를 25자 이내 명사형(예: "반응 속도 질문", "그래프 근거 설명")으로 쓴다. 평가하는 말은 쓰지 않는다.`;

async function aiTranscribe(req, env) {
  if ((Number(req.headers.get('Content-Length')) || 0) > MAX_AUDIO + 64 * 1024) fail(413, 'too_large');
  let fd;
  try { fd = await req.formData(); } catch { fail(400, 'bad_form'); }
  const audio = fd.get('audio');
  if (!audio || typeof audio === 'string' || !audio.size) fail(400, 'no_audio');
  if (audio.size > MAX_AUDIO) fail(413, 'too_large');
  const data = b64(new Uint8Array(await audio.arrayBuffer()));
  const mime = (audio.type || 'audio/webm').split(';')[0];
  const out = await gemini(env, P_TRANSCRIBE, [
    { text: '다음 수업 녹음을 규칙대로 구간별로 받아 적어 JSON으로 답하라.' },
    { inline_data: { mime_type: mime, data } },
  ], obj({ segments: S('ARRAY', { items: obj({ start: S('NUMBER'), speaker: S('STRING'), text: S('STRING'), summary: S('STRING') }) }) }));
  // 화자 표기는 처음 나온 순서대로 "화자N"으로 다시 매긴다(모델이 이름·역할을 붙여도 지움).
  const label = new Map();
  const segments = (Array.isArray(out?.segments) ? out.segments : [])
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .map((s) => {
      const raw = str(s.speaker, 40) || '?';
      if (!label.has(raw)) label.set(raw, `화자${label.size + 1}`);
      return { start: Math.max(0, Number(s.start) || 0), speaker: label.get(raw), text: str(s.text, 2000), summary: str(s.summary, 25) };
    })
    .sort((a, b) => a.start - b.start);
  return json({ segments });
}

const P_SUGGEST = `너는 수업 전사에서 교사가 기록하지 못한, 눈여겨볼 만한 학생 발언 구간을 고르는 도구다.
기준(criteria는 아래 이름 그대로): ${CRITERIA.join(' / ')}.
- teacherSpeaker 화자의 구간은 절대 고르지 않는다.
- 학생이 누구인지(이름·번호·성별 등) 추정하지 않는다. 화자 표기만 쓴다.
- sum은 그 발언 내용을 25자 이내 명사형으로 요약한다. "훌륭함·뛰어남·우수함" 같은 평가어는 쓰지 않는다.
- cat은 categories 배열의 번호(0~3) 중 가장 맞는 것, score는 0~1 사이 중요도다.
- 단순 대답·잡담·짧은 말("네", "몇 쪽이에요" 등)은 고르지 않는다. 최대 max개, segId는 주어진 id 그대로.`;

async function aiSuggest(req, env) {
  const body = await readJson(req, 2_000_000);
  if (!Array.isArray(body.segments)) fail(400, 'bad_segments');
  const teacher = str(body.teacherSpeaker, 40);
  const cats = (Array.isArray(body.categories) ? body.categories : []).slice(0, 4).map((c) => str(c, 20));
  while (cats.length < 4) cats.push(CATS[cats.length]);
  const max = clampInt(body.max, 1, 30, 10);
  const byId = new Map();
  const segments = []; // 정해진 필드만 보낸다(이름 등 다른 필드는 버림)
  for (const s of body.segments.slice(0, 3000)) {
    if (!s || s.id == null || typeof s.text !== 'string') continue;
    const seg = { id: str(s.id, 64), t0: Number(s.t0) || 0, speaker: str(s.speaker, 40), text: str(s.text, 600) };
    byId.set(seg.id, { orig: s.id, speaker: seg.speaker });
    segments.push(seg);
  }
  if (!segments.length) return json({ items: [] });
  const out = await gemini(env, P_SUGGEST, [{ text: JSON.stringify({ unit: str(body.unit, 100), categories: cats, teacherSpeaker: teacher, max, segments }) }],
    obj({ items: S('ARRAY', { items: obj({ segId: S('STRING'), criteria: S('STRING', { enum: CRITERIA }), cat: S('INTEGER'), score: S('NUMBER'), sum: S('STRING') }) }) }));
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(out?.items) ? out.items : []) {
    const id = str(it?.segId, 64), hit = byId.get(id);
    if (!hit || seen.has(id) || (teacher && hit.speaker === teacher)) continue; // 모르는 id·교사 발언 제외
    seen.add(id);
    items.push({
      segId: hit.orig,
      criteria: CRITERIA.includes(it.criteria) ? it.criteria : CRITERIA[0],
      cat: clampInt(it.cat, 0, 3, 0),
      score: Math.min(1, Math.max(0, Number(it.score) || 0)),
      sum: str(it.sum, 40),
    });
  }
  items.sort((a, b) => b.score - a.score);
  return json({ items: items.slice(0, max) });
}

const P_DRAFT = `너는 교사가 체크한 관찰 기록만으로 학교생활기록부 교과 세부능력 및 특기사항(세특) 문장을 쓰는 도구다.
- 모든 문장은 명사형으로 끝낸다(~함, ~임, ~보임 등). 학생 이름·번호는 쓰지 않는다.
- records에 있는 사실만 쓴다. 지어내거나 과장하지 않는다.
- 문장마다 근거가 된 기록 id를 evidence에 넣는다. 근거 없는 문장은 쓰지 않는다.
- 대회·수상·자격증·어학시험·사교육·부모(가정 배경)·교외 활동은 쓰지 않는다.
- 성취기준(standards) 설명과 연결해 쓰고, 전체 길이는 나이스 기준 limit 바이트(한글 3바이트) 안으로 한다.
- level(학교급), subject(과목), guide(교사 지침)를 따른다.`;

async function aiDraft(req, env) {
  const body = await readJson(req, 1_000_000);
  if (!Array.isArray(body.records)) fail(400, 'bad_records');
  const byId = new Map();
  const records = [];
  for (const r of body.records.slice(0, 300)) {
    if (!r || r.id == null || typeof r.text !== 'string' || !r.text.trim()) continue;
    const rec = {
      id: str(r.id, 64), text: str(r.text, 600), cat: clampInt(r.cat, 0, 3, 0),
      std: (Array.isArray(r.std) ? r.std : []).slice(0, 10).map((c) => str(c, 40)), date: str(r.date, 10),
    };
    byId.set(rec.id, r.id);
    records.push(rec);
  }
  if (!records.length) return json({ sentences: [] });
  const standards = {};
  for (const [k, v] of Object.entries(body.standards && typeof body.standards === 'object' ? body.standards : {}).slice(0, 60)) standards[str(k, 40)] = str(v, 400);
  const input = { records, standards, limit: clampInt(body.limit, 100, 6000, 1500), level: str(body.level, 20), guide: str(body.guide, 1500), subject: str(body.subject, 60) };
  const out = await gemini(env, P_DRAFT, [{ text: JSON.stringify(input) }],
    obj({ sentences: S('ARRAY', { items: obj({ text: S('STRING'), evidence: S('ARRAY', { items: S('STRING') }) }) }) }));
  const sentences = [];
  for (const s of Array.isArray(out?.sentences) ? out.sentences : []) {
    const text = str(s?.text, 1000);
    const ev = [...new Set((Array.isArray(s?.evidence) ? s.evidence : []).map((e) => str(e, 64)))];
    // 근거가 없거나 요청에 없는 id를 댄 문장, 금지 내용이 든 문장은 버린다.
    if (!text || !ev.length || ev.some((e) => !byId.has(e)) || FORBIDDEN.some((w) => text.includes(w))) continue;
    sentences.push({ text, evidence: ev.map((e) => byId.get(e)) });
  }
  return json({ sentences });
}

// ---------- 학교 정보 (나이스 · 특일 정보) ----------
const TT_SERVICE = { high: 'hisTimetable', middle: 'misTimetable', elem: 'elsTimetable', special: 'spsTimetable' };
function kindOf(s) {
  s = String(s || '');
  if (/초등|elem/i.test(s)) return 'elem';
  if (/중학|middle/i.test(s)) return 'middle';
  if (/특수|special/i.test(s)) return 'special';
  if (/고등|high/i.test(s)) return 'high';
  return '';
}
function ymd(s) {
  const v = String(s || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(v)) fail(400, 'bad_date');
  return v;
}
const dash = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

async function neis(env, service, params, maxPages = 5) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({ KEY: env.NEIS_KEY, Type: 'json', pIndex: String(page), pSize: '1000', ...params });
    const r = await fetch(`https://open.neis.go.kr/hub/${service}?${q}`).catch(() => null);
    if (!r || !r.ok) fail(502, 'neis_failed');
    const d = await r.json().catch(() => null);
    const block = d?.[service];
    if (!block) { if (d?.RESULT?.CODE === 'INFO-200') break; fail(502, 'neis_failed'); } // INFO-200: 자료 없음
    const got = block.find((b) => b.row)?.row || [];
    rows.push(...got);
    const total = Number(block[0]?.head?.[0]?.list_total_count) || 0;
    if (got.length < 1000 || rows.length >= total) break;
  }
  return rows;
}

async function schoolSearch(url, env) {
  const name = str(url.searchParams.get('name'), 40);
  if (name.length < 2) fail(400, 'bad_name');
  const rows = await neis(env, 'schoolInfo', { SCHUL_NM: name }, 1);
  const schools = rows.slice(0, 50).map((r) => ({
    name: r.SCHUL_NM, code: r.SD_SCHUL_CODE, office: r.ATPT_OFCDC_SC_CODE, officeName: r.ATPT_OFCDC_SC_NM,
    kind: kindOf(r.SCHUL_KND_SC_NM) || kindOf(r.SCHUL_NM) || 'high', address: str(r.ORG_RDNMA, 200),
  }));
  return json({ schools });
}

async function schoolTimetable(url, env) {
  const q = url.searchParams;
  const service = TT_SERVICE[q.get('kind')];
  if (!service) fail(400, 'bad_kind');
  if (!q.get('office') || !q.get('code')) fail(400, 'bad_school');
  const params = { ATPT_OFCDC_SC_CODE: q.get('office'), SD_SCHUL_CODE: q.get('code'), TI_FROM_YMD: ymd(q.get('from')), TI_TO_YMD: ymd(q.get('to')) };
  if (q.get('grade')) params.GRADE = String(clampInt(q.get('grade'), 1, 6, 1));
  const items = (await neis(env, service, params, 10)).map((r) => ({
    date: dash(String(r.ALL_TI_YMD)), period: Number(r.PERIO), class: `${Number(r.GRADE)}-${Number(r.CLASS_NM) || str(r.CLASS_NM, 10)}`,
    subject: str(r.ITRT_CNTNT, 60).replace(/^-\s*/, ''),
  })).filter((it) => it.period > 0 && it.subject);
  items.sort((a, b) => (a.date + String(a.period).padStart(2, '0')).localeCompare(b.date + String(b.period).padStart(2, '0')) || a.class.localeCompare(b.class));
  return json({ items });
}

// 공공데이터포털 특일 정보: 기간에 걸친 달마다 공휴일을 가져온다(실패한 달은 건너뜀).
async function holidays(env, from, to) {
  if (!env.HOLIDAY_KEY) return [];
  const months = [];
  let y = +from.slice(0, 4), m = +from.slice(4, 6);
  while (y * 100 + m <= +to.slice(0, 6) && months.length < 24) {
    months.push([y, m]);
    if (++m > 12) { m = 1; y++; }
  }
  const lists = await Promise.all(months.map(async ([y, m]) => {
    const q = new URLSearchParams({ serviceKey: env.HOLIDAY_KEY, solYear: String(y), solMonth: String(m).padStart(2, '0'), _type: 'json', numOfRows: '50' });
    try {
      const r = await fetch(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?${q}`);
      let it = (await r.json())?.response?.body?.items?.item;
      if (!it) return [];
      if (!Array.isArray(it)) it = [it];
      return it.filter((h) => h.isHoliday === 'Y').map((h) => ({ date: String(h.locdate), reason: str(h.dateName, 40) }));
    } catch { return []; }
  }));
  return lists.flat().filter((h) => h.date >= from && h.date <= to);
}

async function schoolCalendar(url, env) {
  const q = url.searchParams;
  if (!q.get('office') || !q.get('code')) fail(400, 'bad_school');
  const from = ymd(q.get('from')), to = ymd(q.get('to'));
  const [rows, hol] = await Promise.all([
    neis(env, 'SchoolSchedule', { ATPT_OFCDC_SC_CODE: q.get('office'), SD_SCHUL_CODE: q.get('code'), AA_FROM_YMD: from, AA_TO_YMD: to }),
    holidays(env, from, to),
  ]);
  const days = new Map();
  for (const r of rows) {
    if (r.SBTR_DD_SC_NM !== '휴업일' && r.SBTR_DD_SC_NM !== '공휴일') continue;
    const d = String(r.AA_YMD);
    if (!days.has(d)) days.set(d, str(r.EVENT_NM, 40) || r.SBTR_DD_SC_NM);
  }
  for (const h of hol) if (!days.has(h.date)) days.set(h.date, h.reason);
  return json({ days: [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([d, reason]) => ({ date: dash(d), reason })) });
}

// ---------- 웨일 스페이스 로그인 (엔드포인트·필드 미검증) ----------
function returnAllowed(ret, env) {
  let u;
  try { u = new URL(ret); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false; // file: 등 거부
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true; // 개발용
  const allowed = String(env.ALLOWED_RETURN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return allowed.includes(u.origin);
}

async function wsStart(url, env) {
  const ret = url.searchParams.get('return') || '';
  if (!returnAllowed(ret, env)) fail(400, 'bad_return');
  if (!env.WHALE_CLIENT_ID || !env.TOKEN_SECRET) fail(503, 'whalespace_off');
  const state = randHex(16);
  await env.NUGA_KV.put(`st:${state}`, JSON.stringify({ return: ret }), { expirationTtl: STATE_TTL });
  const q = new URLSearchParams({
    client_id: env.WHALE_CLIENT_ID, redirect_uri: `${url.origin}/auth/whalespace/callback`,
    response_type: 'code', state, scope: env.WHALE_SCOPE || 'openid profile',
  });
  return redirect(`${env.WHALE_AUTH_URL || 'https://auth.whalespace.io/oauth2/v1.1/authorize'}?${q}`);
}

// userinfo 응답 모양이 확정되지 않아 여러 이름을 너그럽게 받는다.
// 사용자 이름·반·번호는 읽지 않는다 (학생 정보는 교사 기기에만 둔다는 원칙). 학교 정보와 교사 여부만 본다.
function mapUser(raw) {
  const d = raw?.data ?? raw?.user ?? raw?.result ?? raw ?? {};
  const pick = (o, ...ks) => { for (const k of ks) { const v = o?.[k]; if (v != null && v !== '') return v; } return undefined; };
  const typeRaw = String(pick(d, 'userType', 'user_type', 'memberType', 'type', 'role', 'position') ?? '').toLowerCase();
  const type = /stu|학생/.test(typeRaw) ? 'stu' : /tea|교사|교원|staff|faculty/.test(typeRaw) ? 'tea' : '';
  const so = pick(d, 'school', 'organization', 'org');
  const s = so && typeof so === 'object' ? so : d;
  const sName = s === d ? pick(d, 'schoolName', 'school_name', 'orgName') : pick(s, 'schoolName', 'name', 'orgName');
  const school = {
    name: str(sName, 60),
    code: str(pick(s, 'schoolCode', 'school_code', 'SD_SCHUL_CODE', 'code', 'orgCode'), 20),
    office: str(pick(s, 'officeCode', 'eduOfficeCode', 'office', 'ATPT_OFCDC_SC_CODE'), 20),
    kind: kindOf(pick(s, 'schoolKind', 'school_kind', 'schoolType', 'school_type', 'schoolLevel', 'SCHUL_KND_SC_NM')) || kindOf(sName),
  };
  return { id: str(pick(d, 'userId', 'user_id', 'id', 'sub', 'uid', 'email'), 200), type, school };
}

async function wsCallback(url, env) {
  const state = url.searchParams.get('state') || '';
  const key = `st:${state}`;
  const saved = /^[0-9a-f]{32}$/.test(state) ? await env.NUGA_KV.get(key, 'json') : null;
  if (!saved) fail(400, 'bad_state');
  await env.NUGA_KV.delete(key); // 한 번만 쓴다
  const back = (o) => redirect(`${saved.return.split('#')[0]}#ws=${b64uJson(o)}`);
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) return back({ error: 'cancelled' });
  let info;
  try {
    const redirect_uri = `${url.origin}/auth/whalespace/callback`;
    const tr = await fetch(env.WHALE_TOKEN_URL || 'https://auth.whalespace.io/oauth2/v1.1/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id: env.WHALE_CLIENT_ID, client_secret: env.WHALE_CLIENT_SECRET || '' }),
    });
    const access = (await tr.json())?.access_token;
    if (!tr.ok || !access) throw new Error('token');
    const ur = await fetch(env.WHALE_USERINFO_URL || 'https://www.whalespaceapis.com/v1/users/me', { headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' } });
    if (!ur.ok) throw new Error('userinfo');
    info = await ur.json();
  } catch { return back({ error: 'login_failed' }); }
  const u = mapUser(info);
  if (!u.id) return back({ error: 'login_failed' });
  const exp = Date.now() + TOKEN_MS;
  if (u.type !== 'tea') return back({ error: 'wrong_role' }); // 교사만 로그인한다
  const sid = (await sha256hex(u.id)).slice(0, 16); // 원래 아이디는 내보내지 않는다
  const token = await signToken(env, { t: 'tea', sc: u.school.code, sid, exp });
  return back({ userType: 'tea', sid, token, exp, school: u.school });
}

// ---------- 길 찾기 ----------
async function route(req, env, url) {
  const m = req.method, p = url.pathname.replace(/\/+$/, '') || '/';
  const only = (method) => { if (m !== method) fail(405, 'method_not_allowed'); };
  if (p === '/health') { only('GET'); return health(env); }

  const box = /^\/box\/([^/]+)(\/ack)?$/.exec(p);
  if (box) {
    const ch = box[1];
    if (!/^[0-9a-f]{32}$/.test(ch)) fail(400, 'bad_channel');
    if (box[2]) { only('POST'); return boxAck(req, env, ch); }
    if (m === 'POST') return boxPost(req, env, ch);
    only('GET'); return boxGet(env, ch);
  }

  const ai = { '/ai/transcribe': aiTranscribe, '/ai/suggest': aiSuggest, '/ai/draft': aiDraft }[p];
  if (ai) { only('POST'); await aiGate(req, env); return ai(req, env); }

  const school = { '/school/search': schoolSearch, '/school/timetable': schoolTimetable, '/school/calendar': schoolCalendar }[p];
  if (school) { only('GET'); if (!env.NEIS_KEY) fail(503, 'neis_off'); return school(url, env); }

  if (p === '/auth/whalespace') { only('GET'); return wsStart(url, env); }
  if (p === '/auth/whalespace/callback') { only('GET'); return wsCallback(url, env); }
  fail(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env, new URL(request.url));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
};
