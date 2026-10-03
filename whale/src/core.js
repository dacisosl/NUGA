'use strict';
/* core.js — 유틸 · 상태 · 시계 · 시간표 · 저장 · IndexedDB · API · 암호화 */

/* ---------- DOM ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);
const pad2 = (n) => String(n).padStart(2, '0');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* 아이콘 (인라인 SVG) */
const ICON = {
  lesson: 'M4 5h16v11H4zM8 20h8M12 16v4',
  review: 'M5 12l4 4L19 6',
  class: 'M4 6h16M4 12h16M4 18h10',
  feedback: 'M4 5h16v10H9l-5 4z',
  draft: 'M5 19h4L19 9l-4-4L5 15zM13 7l4 4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  mic: 'M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  watch: 'M8 3h8l1 4H7zM7 17h10l-1 4H8zM6 7h12v10H6z',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  play: 'M7 5l12 7-12 7z',
};
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICON[name] || ''); s.appendChild(p);
  return s;
}

/* ---------- 알림 ---------- */
function toast(text, opt = {}) {
  const box = $('#toasts'); if (!box) return;
  const t = h('div', { class: 'toast' }, h('span', null, text),
    opt.action ? h('button', { onclick: () => { opt.action.fn(); t.remove(); } }, opt.action.label) : null);
  box.appendChild(t);
  setTimeout(() => t.remove(), opt.ms || (opt.action ? 6000 : 3200));
}

/* ---------- 시계 (데모는 데모 시계) ---------- */
let S = null; // 현재 상태
function nowMs() { return S && S.mode === 'demo' && S.demoClock ? S.demoClock + (Date.now() - (S.demoSetAt || Date.now())) : Date.now(); }
function now() { return new Date(nowMs()); }
function setDemoClock(ms) { S.demoClock = ms; S.demoSetAt = Date.now(); save(); }
/** 기기 시간대 기준 YYYY-MM-DD (ISO 앞 10자는 UTC 라 쓰지 않는다) */
function ymd(d) { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function recDay(r) { return ymd(new Date(r.time)); }
function hm(d) { d = d instanceof Date ? d : new Date(d); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function hms(d) { d = d instanceof Date ? d : new Date(d); return `${hm(d)}:${pad2(d.getSeconds())}`; }
function minOf(d) { return d.getHours() * 60 + d.getMinutes(); }
function toMin(s) { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); }
function fromMin(m) { return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }
function dateAt(day, min, sec = 0) { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, Math.floor(min / 60), min % 60, sec); }
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function koDate(day) { const d = new Date(day + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; }
function addDays(day, n) { const d = new Date(day + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); }

/* ---------- 상태 ---------- */
const CATS = { elem: ['학습태도', '발표', '관계', '생활'], middle: ['질문', '발표', '협동', '탐구'], high: ['질문', '발표', '협동', '탐구'] };
function defaultState(mode = 'real') {
  return {
    v: 1, mode, setupDone: false,
    settings: {
      level: 'high', subject: '', categories: CATS.high.slice(), numberOnly: false,
      bell: { start: '08:50', len: 50, brk: 10, lunchAfter: 4, lunchLen: 60, periods: 7 },
      recording: { enabled: false, checklist: false, ttlHours: 24, items: { approve: false, privacy: false, consent: false, transfer: false } },
      popup: { enabled: true, maxSuggestions: 3, quietMin: 2, presence: false, notify: false },
      server: { url: '' }, ai: { mode: 'relay', key: '' },
      length: { limit: 1500, target: [0.96, 1.0] }, teacherGuide: '', theme: 'auto',
    },
    account: { provider: 'none' },
    school: null,
    classes: [], timetable: [], timetableDated: [], extraLessons: [], skipLessons: [], skipDays: [],
    progress: [], standards: {},
    records: [], lessons: {}, transcripts: {}, suggestions: [],
    feedbackSent: {}, feedbackEdits: {}, drafts: {}, watchExtra: {},
    sync: { role: null, key: null, channel: null, devices: [], outbox: [] },
    demoClock: null, demoSetAt: null,
  };
}
const MODE_KEY = 'nuga.mode';
const stateKey = (m) => `nuga.state.${m}.v1`;
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } }
function loadState(mode) {
  const raw = lsGet(stateKey(mode));
  const base = defaultState(mode);
  if (!raw) return base;
  try {
    const s = JSON.parse(raw);
    // 새 설정 항목이 생겨도 깨지지 않게 기본값과 합친다
    s.settings = { ...base.settings, ...s.settings, bell: { ...base.settings.bell, ...(s.settings || {}).bell }, recording: { ...base.settings.recording, ...(s.settings || {}).recording }, popup: { ...base.settings.popup, ...(s.settings || {}).popup }, length: { ...base.settings.length, ...(s.settings || {}).length } };
    return { ...base, ...s, sync: { ...base.sync, ...s.sync } };
  } catch { return base; }
}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 120); }
function saveNow() {
  clearTimeout(saveTimer);
  if (!S) return;
  if (!lsSet(stateKey(S.mode), JSON.stringify(S))) toast('브라우저 저장 공간이 부족합니다. 설정 → 백업으로 내려받아 두세요.');
}
function switchMode(mode) { saveNow(); lsSet(MODE_KEY, mode); S = loadState(mode); }

/* ---------- 공휴일 (2026, 직접 추가 가능) ---------- */
const HOLIDAYS_2026 = {
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-03-01': '삼일절', '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일(부처님오신날)', '2026-06-03': '전국동시지방선거', '2026-06-06': '현충일',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일(광복절)', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴', '2026-09-28': '대체공휴일(추석)',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일(개천절)', '2026-10-09': '한글날', '2026-12-25': '성탄절',
};
/** 쉬는 날 이유: 직접 추가한 쉬는 날 → 공휴일 → 주말 */
function skipReason(day) {
  const own = S.skipDays.find((x) => x.date === day); if (own) return own.reason || '쉬는 날';
  if (HOLIDAYS_2026[day]) return HOLIDAYS_2026[day];
  const w = new Date(day + 'T00:00').getDay(); if (w === 0 || w === 6) return '주말';
  return null;
}

/* ---------- 시간표 ---------- */
/** 교시별 시작·끝(분). 점심은 lunchAfter 교시 뒤 */
function periodTimes(bell = S.settings.bell) {
  const out = []; let t = toMin(bell.start);
  for (let p = 1; p <= bell.periods; p++) {
    out.push({ no: p, start: t, end: t + bell.len });
    t += bell.len + (p === bell.lunchAfter ? bell.lunchLen : bell.brk);
  }
  return out;
}
function lessonKey(day, cls, period) { return `${day}_${cls}_${period}`; }
function perLabel(p) { return typeof p === 'number' || /^\d+$/.test(String(p)) ? `${p}교시` : '수업'; }
/** 그날의 수업: 쉬는 날이면 직접 시작한 수업만, 아니면 나이스 날짜별 시간표 → 주간 시간표. "이번 시간 아님"은 뺀다 */
function lessonsOn(day) {
  const pt = periodTimes();
  const out = [];
  if (!skipReason(day)) {
    const dated = S.timetableDated.filter((x) => x.date === day);
    const wd = new Date(day + 'T00:00').getDay();
    const src = dated.length ? dated : S.timetable.filter((x) => x.weekday === wd);
    for (const x of src) {
      const p = pt.find((q) => q.no === Number(x.period)); if (!p) continue;
      out.push({ key: lessonKey(day, x.class, x.period), date: day, class: x.class, period: Number(x.period), start: p.start, end: p.end });
    }
  }
  for (const x of S.extraLessons) if (x.date === day) out.push({ key: x.key, date: day, class: x.class, period: '수동', start: x.start, end: x.end, manual: true });
  return out.filter((l) => !S.skipLessons.includes(l.key)).sort((a, b) => a.start - b.start);
}
function currentLesson(t = now()) { const m = minOf(t); return lessonsOn(ymd(t)).find((l) => m >= l.start && m < l.end) || null; }
function nextLesson(t = now()) {
  const m = minOf(t); const d = ymd(t);
  const today = lessonsOn(d).find((l) => l.start > m); if (today) return today;
  for (let i = 1; i <= 14; i++) { const ls = lessonsOn(addDays(d, i)); if (ls.length) return ls[0]; }
  return null;
}
function lessonByKey(key) {
  const day = key.slice(0, 10);
  return lessonsOn(day).find((l) => l.key === key) || (() => {
    // 시간표가 바뀌어 사라진 수업도 키로 되살린다
    const [, cls, per] = key.split('_'); const p = periodTimes().find((q) => q.no === Number(per));
    return p ? { key, date: day, class: cls, period: Number(per), start: p.start, end: p.end } : null;
  })();
}
/** 기록 시각으로 수업 찾기 (폰·워치 기록을 본체 수업에 붙일 때) */
function lessonAt(cls, t) {
  const m = minOf(t);
  return lessonsOn(ymd(t)).find((l) => l.class === cls && m >= l.start - 5 && m < l.end + 10) || null;
}
/** 반을 모를 때(폰·워치 기록): 그 시각에 걸친 수업 */
function lessonAtAny(t) {
  const m = minOf(t);
  const ls = lessonsOn(ymd(t)).filter((l) => m >= l.start - 5 && m < l.end + 10);
  return ls.find((l) => m >= l.start && m < l.end) || ls[0] || null;
}
/**
 * 폰·워치(보조 기기) → 본체: 카테고리와 시각만 보낸다. 반·번호·이름·메모는 보내지 않는다.
 * 누구였는지는 교사가 본체의 정리 창에서 기억에 의존해 번호를 고른다.
 */
function outgoingRecord(r) { return { id: r.id, cat: r.cat, time: r.time, device: r.device === 'watch' ? 'watch' : 'phone' }; }
/** 본체가 받은 기록: 시각으로 수업(반)을 찾고, 번호는 비워 둔다 */
function incomingRecord(msg) {
  const t = new Date(msg.time);
  if (!msg.id || Number.isNaN(t.getTime())) return null;
  const l = lessonAtAny(t);
  const cls = l ? l.class : null;
  const p = cls ? progressAt(cls, ymd(t)) : null;
  return { id: String(msg.id), class: cls, no: null, cat: clamp(Number(msg.cat) || 0, 0, 3), time: t.toISOString(), lessonKey: l ? l.key : null, unit: p?.unit || '', std: p?.standards?.slice(0, 1) || [], note: '', noteSource: 'typed', source: 'direct', device: msg.device === 'watch' ? 'watch' : 'phone', status: 'pending', transcriptRef: null };
}
function progressAt(cls, day) {
  return S.progress.find((p) => (p.class === cls || p.class === '*') && p.from <= day && day <= p.to) || null;
}
function classIds() { return S.classes.map((c) => c.id); }
function classOf(id) { return S.classes.find((c) => c.id === id) || null; }
function studentLabel(cls, no) {
  if (no === null || no === undefined) return '번호 미정';
  const st = classOf(cls)?.students.find((x) => x.no === no);
  return S.settings.numberOnly || !st?.name ? `${no}번` : `${no} ${st.name}`;
}

/* ---------- 나이스 바이트 ---------- */
function neisBytes(text) {
  let b = 0;
  for (const ch of String(text).replace(/\r\n?/g, '\n')) b += ch === '\n' ? 2 : ch.charCodeAt(0) < 128 ? 1 : 3;
  return b;
}

/* ---------- IndexedDB (음성) ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('nuga', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio', { keyPath: 'key' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('audio', mode); const st = tx.objectStore('audio');
    const req = fn(st); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
  });
}
const audioPut = (rec) => idbDo('readwrite', (s) => s.put(rec));
const audioGet = (key) => idbDo('readonly', (s) => s.get(key));
const audioDel = (key) => idbDo('readwrite', (s) => s.delete(key));
async function cleanupAudio() {
  try {
    const all = await idbDo('readonly', (s) => s.getAll());
    for (const a of all || []) if (a.deleteAt < Date.now()) await audioDel(a.key);
  } catch { /* IndexedDB 를 못 쓰는 환경 */ }
}

/* ---------- 누가 서버 API ---------- */
function serverUrl() { return (S.settings.server.url || '').replace(/\/+$/, ''); }
async function api(path, opt = {}) {
  const base = serverUrl(); if (!base) throw new Error('누가 서버가 연결되지 않았습니다');
  const headers = {};
  const tok = opt.token || (S.account && S.account.token);
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let body = opt.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), opt.timeout || 60000);
  try {
    const r = await fetch(base + path, { method: opt.method || (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(API_ERR[j.error] || j.error || `HTTP ${r.status}`); e.status = r.status; e.code = j.error; throw e; }
    return j;
  } finally { clearTimeout(timer); }
}
/** 서버 오류 코드 → 쉬운 말 */
const API_ERR = {
  ai_off: '서버에 AI가 꺼져 있어요', login_required: '웨일 스페이스 교사 로그인이 필요해요', bad_token: '로그인이 끝났어요. 다시 로그인해 주세요',
  daily_limit: '오늘 AI 사용 한도를 다 썼어요', neis_off: '서버에 나이스 연결이 꺼져 있어요', ai_failed: 'AI 처리에 실패했어요', neis_failed: '나이스에서 정보를 받지 못했어요',
  too_large: '파일이 너무 커요', box_full: '전달함이 가득 찼어요', teacher_only: '교사만 할 수 있어요', student_only: '학생만 볼 수 있어요', whalespace_off: '서버에 웨일 스페이스 연결이 꺼져 있어요',
};
function aiOn() { return S.settings.ai.mode === 'relay' && !!serverUrl() && S.mode !== 'demo'; }

/* ---------- 암호화 (기기 연결 전달함) ---------- */
function b64u(bytes) { let s = ''; bytes = new Uint8Array(bytes); for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(str) { const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
const enc = new TextEncoder(); const dec = new TextDecoder();
function b64uText(s) { return b64u(enc.encode(s)); }
function unb64uText(s) { return dec.decode(unb64u(s)); }
function newKey() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }
async function channelOf(keyB64) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64u(keyB64)));
  return Array.from(d.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function aesKey(keyB64) { return crypto.subtle.importKey('raw', unb64u(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']); }
/** 봉하기: 'iv.암호문' (b64url) */
async function seal(keyB64, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), enc.encode(JSON.stringify(obj)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
async function unseal(keyB64, msg) {
  const [iv, ct] = String(msg).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await aesKey(keyB64), unb64u(ct));
  return JSON.parse(dec.decode(pt));
}

/* ---------- 학생 정보는 기기 밖으로 나가지 않는다 ----------
 * 학번(반·번호)과 이름은 이 브라우저에만 저장한다. 서버·AI 로 가는 글은 내용만 보내고,
 * 교사가 메모에 이름을 적었거나 수업 중 이름이 불린 경우를 대비해 명단 이름을 ○○ 로 지운다.
 */
function rosterNames() {
  const out = new Set();
  for (const c of S.classes) for (const s of c.students) {
    const n = String(s.name || '').trim(); if (n.length < 2) continue;
    out.add(n); if (n.length >= 3) out.add(n.slice(1)); // 성을 뺀 이름 (지우야 → 지우)
  }
  return [...out].sort((a, b) => b.length - a.length);
}
function scrubNames(text) {
  const names = rosterNames(); let t = String(text || '');
  for (const n of names) t = t.split(n).join('○○');
  return t;
}

/* ---------- 문자열 비교 ---------- */
function grams(s, n = 2) { const t = String(s).replace(/\s+/g, ''); const out = new Set(); for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n)); return out; }
function jaccard(a, b, n = 2) { const A = grams(a, n), B = grams(b, n); if (!A.size || !B.size) return 0; let x = 0; for (const g of A) if (B.has(g)) x++; return x / (A.size + B.size - x); }
/** 받침 */
function jong(ch) { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? c % 28 : -1; }
function josa(word, pair) { const [a, b] = pair.split('/'); const last = String(word).trim().slice(-1); const j = jong(last); return word + (j > 0 && !(pair === '으로/로' && j === 8) ? a : b); }
