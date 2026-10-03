'use strict';
/* ui1.js — 틀 · 상태 줄 · 데모 바 · 수업 화면 · 녹음 · 자리 감지 · 정리 팝업 · 가상 워치 */

const UI = { view: 'lesson', cat: 0, kb: 'cat', cls: null, typed: '', watch: null, sheet: null, fbRange: null, draft: { cls: null, no: null }, classSel: null };
const VIEWS = [
  { id: 'lesson', label: '수업', icon: 'lesson' },
  { id: 'review', label: '정리', icon: 'review' },
  { id: 'class', label: '반', icon: 'class' },
  { id: 'feedback', label: '피드백', icon: 'feedback' },
  { id: 'draft', label: '세특', icon: 'draft' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

/* ---------- 그리기 ---------- */
function render() {
  applyTheme();
  const app = $('#app'); if (!app) return;
  const scroll = $('.main')?.scrollTop || 0;
  app.replaceChildren();
  if (location.hash.startsWith('#student')) { app.appendChild(renderStudent()); return; }
  if (!S.setupDone) { app.appendChild(renderOnboarding()); return; }
  const pending = reviewQueue().length + [...new Set(S.suggestions.map((x) => x.lessonKey))].reduce((n, k) => n + suggestionsFor(k).length, 0);
  const views = { lesson: viewLesson, review: viewReview, class: viewClass, feedback: viewFeedback, draft: viewDraft, settings: viewSettings };
  const main = h('main', { class: 'main' }, (views[UI.view] || viewLesson)());
  app.appendChild(h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('div', { class: 'logo' }, h('i', null, h('b'), h('b'), h('b')), h('span', { class: 'name' }, '누가')),
      h('div', { class: 'status', id: 'status' }, statusLine()),
      S.mode === 'demo' ? h('span', { class: 'demo-tag' }, '합성 데이터 · 실제 학생 정보 없음') : null),
    h('nav', { class: 'nav', 'aria-label': '메뉴' }, VIEWS.map((v) => h('button', { class: UI.view === v.id ? 'active' : '', onclick: () => go(v.id), 'aria-current': UI.view === v.id ? 'page' : null },
      icon(v.icon), h('span', null, v.label), v.id === 'review' && pending ? h('span', { class: 'badge' }, pending) : null))),
    main));
  main.scrollTop = scroll;
  if (S.mode === 'demo') app.appendChild(renderDemoBar());
  if (UI.watch) app.appendChild(renderWatchSim());
  if (UI.sheet) app.appendChild(UI.sheet());
  if (Popup.key) Popup.mount();
}
function go(view) { UI.view = view; $('.main') && ($('.main').scrollTop = 0); render(); }
function applyTheme() { const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
function openSheet(fn) { UI.sheet = fn; render(); }
function closeSheet() { UI.sheet = null; render(); }
function sheet(title, body, opt = {}) {
  return h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === e.currentTarget) closeSheet(); } },
    h('div', { class: `sheet ${opt.wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-h' }, h('h2', null, title), h('button', { class: 'x', onclick: closeSheet, 'aria-label': '닫기' }, '×')), body));
}

/* ---------- 상태 한 줄 ---------- */
function reviewQueue() {
  const t = now(); const m = minOf(t); const day = ymd(t);
  return lessonsOn(day).filter((l) => l.end <= m && !(S.lessons[l.key] || {}).popupDone && (S.records.some((r) => r.lessonKey === l.key && r.status === 'pending') || suggestionsFor(l.key).length));
}
function statusLine() {
  const t = now(); const parts = [];
  const why = skipReason(ymd(t));
  const cur = currentLesson(t);
  if (cur) parts.push(h('span', { class: 'on' }, `${perLabel(cur.period)} ${cur.class}반 수업 중`));
  else if (why && !cur) parts.push(`오늘 쉼 · ${why}`);
  else { const n = nextLesson(t); parts.push(n ? `다음 ${n.date === ymd(t) ? '' : koDate(n.date) + ' '}${perLabel(n.period)} ${n.class}반 ${fromMin(n.start)}` : '오늘 수업 없음'); }
  if (Recorder.active || (cur && (S.lessons[cur.key] || {}).recordingDemo)) parts.push(h('span', { class: 'live' }, '● 녹음 중'));
  const proc = Object.values(S.lessons).some((x) => x.processing);
  if (proc) parts.push('녹음 정리 중');
  if (S.sync.devices.some((d) => d.kind === 'watch')) parts.push('워치 연결됨');
  else if (S.sync.role === 'main' && S.sync.channel) parts.push('폰 연결됨');
  if (S.sync.role === 'satellite') parts.push('보조 기기');
  const q = reviewQueue().length; if (q) parts.push(`정리 대기 ${q}`);
  if (S.account.provider && S.account.provider !== 'none') parts.push('웨일 스페이스');
  const out = []; parts.forEach((p, i) => { if (i) out.push(' · '); out.push(p); });
  return out;
}
function renderStatus() { const el = $('#status'); if (el) el.replaceChildren(...statusLine()); const c = $('#demo-clock'); if (c) c.textContent = demoClockText(); }

/* ---------- 데모 바 ---------- */
function demoClockText() { const t = now(); return `${t.getMonth() + 1}/${t.getDate()}(${WD[t.getDay()]}) ${hm(t)}`; }
function renderDemoBar() {
  if (UI.demoFold) return h('div', { class: 'demobar no-print', role: 'toolbar', 'aria-label': '데모' }, h('span', { class: 'tag' }, '데모'), h('span', { class: 'clock', id: 'demo-clock' }, demoClockText()), h('button', { onclick: () => { UI.demoFold = false; render(); }, 'aria-label': '데모 바 펼치기' }, '▸'));
  return h('div', { class: 'demobar no-print', role: 'toolbar', 'aria-label': '데모' },
    h('span', { class: 'tag' }, '데모'), h('span', { class: 'clock', id: 'demo-clock' }, demoClockText()),
    h('button', { class: 'hl', onclick: demoEndLesson }, '수업 끝내고 자리로 ▶'),
    h('button', { onclick: () => { UI.watch = UI.watch ? null : { step: 'cat', cat: 0, no: 1 }; render(); } }, '가상 워치'),
    h('button', { onclick: () => { setDemoClock(dateAt('2026-10-09', 9 * 60 + 55).getTime()); toast('10/9(금) 한글날로 옮겼어요. 시간표 수업은 쉬고, [수업 시작]은 할 수 있어요.'); render(); } }, '한글날(공휴일)로'),
    h('button', { onclick: () => { S = buildDemoState(); saveNow(); Popup.close(); UI.watch = null; UI.view = 'lesson'; render(); toast('데모를 처음 상태로 되돌렸어요'); } }, '처음부터'),
    h('button', { onclick: endDemo }, '데모 끝내기'),
    h('button', { onclick: () => { UI.demoFold = true; render(); }, 'aria-label': '데모 바 접기', title: '접기' }, '▾'));
}
/** [수업 끝내고 자리로 ▶]: 수업 끝 + 3분 → 녹음 정리 → "자리에 앉았어요" → 팝업 */
function demoEndLesson() {
  const cur = currentLesson() || lessonsOn(ymd(now())).filter((l) => S.lessons[l.key]?.started && !S.lessons[l.key]?.ended).pop();
  if (!cur) { toast('지금 진행 중인 수업이 없어요. [처음부터]를 누르면 10:29 수업 중으로 돌아가요.'); return; }
  setDemoClock(dateAt(cur.date, cur.end + 3).getTime());
  Popup.hold = true; // 전환하는 동안 팝업 보류
  tick();
  toast('수업이 끝났어요. 녹음을 정리하는 중…');
  setTimeout(() => { Popup.hold = false; toast('자리에 앉았어요 (데모: 입력 감지)'); Popup.check('input'); }, 1600);
}
function endDemo() {
  Popup.close(); UI.watch = null; switchMode('real'); UI.view = 'lesson'; render();
  toast('데모를 끝냈어요. 실제 사용 데이터는 데모와 따로 저장됩니다.');
}

/* ---------- 기록 ---------- */
function stdFor(cls, day) { const p = progressAt(cls, day); return { unit: p?.unit || '', std: p?.standards?.slice(0, 1) || [] }; }
function addRecord(cls, no, cat, opt = {}) {
  const t = opt.time ? new Date(opt.time) : now();
  const lesson = opt.lessonKey ? lessonByKey(opt.lessonKey) : (currentLesson(t) || lessonAt(cls, t));
  const { unit, std } = stdFor(cls, ymd(t));
  const rec = { id: opt.id || uid(), class: cls, no, cat, time: t.toISOString(), lessonKey: lesson ? lesson.key : null, unit, std, note: opt.note || '', noteSource: opt.noteSource || 'typed', source: opt.source || 'direct', device: opt.device || 'whalebook', status: opt.status || 'pending', transcriptRef: opt.transcriptRef || null };
  S.records.push(rec);
  if (S.sync.role === 'satellite') S.sync.outbox.push(rec.id);
  save();
  return rec;
}
function undoRecord(id) { S.records = S.records.filter((r) => r.id !== id); S.sync.outbox = S.sync.outbox.filter((x) => x !== id); save(); render(); toast('되돌렸어요'); }
function quickRecord(no) {
  const cls = UI.cls; if (!cls) return;
  const rec = addRecord(cls, no, UI.cat); UI.lastRec = rec.id;
  const cat = S.settings.categories[UI.cat];
  toast(`${cls} ${studentLabel(cls, no)} · ${cat}`, { action: { label: '되돌리기', fn: () => undoRecord(rec.id) } });
  render();
  const b = document.querySelector(`[data-no="${no}"]`); if (b) b.classList.add('flash');
}

/* ---------- 수업 화면 ---------- */
function viewLesson() {
  const t = now(); const day = ymd(t);
  const cur = currentLesson(t);
  const why = skipReason(day);
  if (cur) UI.cls = cur.class;
  if (!UI.cls || !classOf(UI.cls)) UI.cls = classIds()[0] || null;
  const cls = UI.cls; const c = classOf(cls);
  const prog = cls ? progressAt(cls, day) : null;
  const ls = cur ? S.lessons[cur.key] || {} : {};
  const head = h('div', { class: 'card' },
    h('div', { class: 'lesson-head' },
      h('div', { class: 'grow' },
        cur ? h('div', { class: 'big' }, `${perLabel(cur.period)} · ${cur.class}반`) : h('div', { class: 'big' }, why ? `오늘 쉼 · ${why}` : '지금은 수업 시간이 아니에요'),
        h('div', { class: 'muted small' }, cur ? `${fromMin(cur.start)}–${fromMin(cur.end)}` : (() => { const n = nextLesson(t); return n ? `다음 수업 ${n.date === day ? '' : koDate(n.date) + ' '}${perLabel(n.period)} ${n.class}반 ${fromMin(n.start)}` : '시간표를 넣으면 수업 시각에 저절로 시작해요'; })(),
          prog ? ` · ${prog.unit} ${prog.standards.join(' ')}` : '')),
      !cur ? h('div', { class: 'row' },
        h('select', { 'aria-label': '반', onchange: (e) => { UI.cls = e.target.value; render(); } }, classIds().map((id) => h('option', { value: id, selected: id === cls }, `${id}반`))),
        h('button', { class: 'btn primary', onclick: () => startManualLesson(cls), disabled: !cls }, '수업 시작')) : null),
    cur ? h('div', { class: `recbar mt12 ${Recorder.active || ls.recordingDemo ? 'live' : ''}` },
      Recorder.active || ls.recordingDemo ? [h('span', { class: 'dot rec' }), ls.recordingDemo ? '녹음 중 (데모: 합성 음성)' : `녹음 중 · ${Recorder.elapsed()}`]
        : [icon('mic'), S.settings.recording.enabled ? (ls.skipRecording ? '이번 수업은 녹음 쉬기' : '녹음 대기') : '녹음 꺼짐 (설정에서 켤 수 있어요)'],
      h('span', { class: 'grow' }),
      Recorder.active ? h('button', { class: 'btn sm', onclick: () => { Recorder.stop(cur.key); render(); } }, '녹음 멈춤') : null,
      cur.manual ? h('button', { class: 'btn sm', onclick: () => endManualLesson(cur.key) }, '수업 끝') : null) : null);
  if (!cls) return h('div', { class: 'page' }, head, h('div', { class: 'card empty' }, '설정에서 반·명단을 넣어 주세요.', h('div', { class: 'mt12' }, h('button', { class: 'btn primary', onclick: () => go('settings') }, '설정으로'))));

  const watch = watchListFor(cls);
  const counts = new Map(); for (const r of S.records) if (r.class === cls && r.status !== 'skipped') counts.set(r.no, (counts.get(r.no) || 0) + 1);
  const cats = S.settings.categories.map((name, i) => h('button', { class: `cat c${i} ${UI.cat === i ? 'on' : ''}`, onclick: () => { UI.cat = i; render(); }, 'aria-pressed': UI.cat === i }, h('kbd', null, i + 1), name));
  const nums = h('div', { class: 'nums', role: 'group', 'aria-label': '번호' }, (c?.students || []).map((s) => h('button', {
    class: `num-btn ${watch.includes(s.no) ? 'watch' : ''}`, 'data-no': s.no, onclick: () => quickRecord(s.no),
    title: watch.includes(s.no) ? '눈여겨볼 학생' : '',
  }, h('b', null, s.no), !S.settings.numberOnly && s.name ? h('small', null, s.name) : null, h('span', { class: 'cnt' }, counts.get(s.no) || ''))));
  const today = S.records.filter((r) => r.class === cls && recDay(r) === day).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6);
  return h('div', { class: 'page' }, head,
    h('div', { class: 'card' },
      h('div', { class: 'row between wrap' }, h('h2', null, `${cls}반 기록`), h('span', { class: 'muted xs' }, '키보드: 카테고리 1~4 → 번호 → Enter · Ctrl+Z 되돌리기')),
      watch.length ? h('div', { class: 'row wrap mt8 small' }, h('span', { class: 'muted' }, '눈여겨볼 학생'), h('div', { class: 'watchlist' }, watch.map((no) => h('span', { class: 'chip warn' }, studentLabel(cls, no))))) : null,
      h('div', { class: 'cats mt12' }, cats),
      h('div', { class: 'mt12' }, nums),
      UI.kb === 'num' ? h('div', { class: 'info mt8' }, `키보드: ${S.settings.categories[UI.cat]} · 번호 ${UI.typed || '_'} → Enter (Esc 취소)`) : null),
    h('div', { class: 'card' }, h('h2', null, '오늘 기록'),
      today.length ? h('div', { class: 'rec-list' }, today.map(recRow)) : h('div', { class: 'empty' }, '아직 없어요. 카테고리를 고르고 번호를 누르세요.')));
}
const DEVICE = { whalebook: '웨일북', phone: '폰', watch: '워치' };
function recRow(r) {
  return h('div', { class: 'rec-item' },
    h('span', { class: 't num' }, hm(r.time)), h('span', { class: 'who' }, studentLabel(r.class, r.no)),
    h('span', { class: `chip c${r.cat}` }, S.settings.categories[r.cat]),
    h('span', { class: 'note-t' }, r.note || (r.status === 'pending' ? '정리 대기' : '')),
    h('span', { class: 'xs muted' }, DEVICE[r.device] || ''),
    r.source === 'suggestion' ? h('span', { class: 'chip ok' }, '추천') : null);
}
function startManualLesson(cls) {
  const t = now(); const m = minOf(t);
  const key = `${ymd(t)}_${cls}_수동${hm(t).replace(':', '')}`;
  S.extraLessons.push({ key, date: ymd(t), class: cls, period: '수동', start: m, end: m + S.settings.bell.len });
  S.lessons[key] = { started: true, startedAt: t.toISOString() };
  save(); onLessonStart(lessonByKey(key)); render();
  toast(`${cls}반 수업을 시작했어요 (${S.settings.bell.len}분)`);
}
function endManualLesson(key) {
  const x = S.extraLessons.find((l) => l.key === key); if (x) x.end = Math.min(x.end, minOf(now()));
  save(); tick(); render();
}

/* ---------- 키보드 ---------- */
document.addEventListener('keydown', (e) => {
  if (!S || !S.setupDone || UI.view !== 'lesson' || UI.sheet || Popup.key) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (UI.lastRec && S.records.some((r) => r.id === UI.lastRec)) { e.preventDefault(); const id = UI.lastRec; UI.lastRec = null; undoRecord(id); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // 키보드: 카테고리 숫자(1~4) → 번호 → Enter. 저장하면 다시 카테고리부터
  if (/^[0-9]$/.test(e.key)) {
    if (UI.kb !== 'num') { if (/^[1-4]$/.test(e.key)) { UI.cat = Number(e.key) - 1; UI.kb = 'num'; UI.typed = ''; render(); } return; }
    UI.typed = (UI.typed + e.key).slice(-2); render(); return;
  }
  if (e.key === 'Backspace') { if (UI.typed) UI.typed = UI.typed.slice(0, -1); else UI.kb = 'cat'; render(); return; }
  if (e.key === 'Escape') { UI.typed = ''; UI.kb = 'cat'; render(); return; }
  if (e.key === 'Enter' && UI.typed) {
    const no = Number(UI.typed); UI.typed = ''; UI.kb = 'cat';
    if (classOf(UI.cls)?.students.some((s) => s.no === no)) quickRecord(no); else { toast(`${no}번 학생이 없어요`); render(); }
  }
});

/* ---------- 녹음 ---------- */
const Recorder = {
  active: false, key: null, media: null, chunks: [], startedAt: 0, lock: null,
  elapsed() { const s = Math.floor((Date.now() - this.startedAt) / 1000); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; },
  ready() { const r = S.settings.recording; return r.enabled && r.checklist && Object.values(r.items).every(Boolean); },
  async start(lesson) {
    if (this.active || S.mode === 'demo') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined);
      this.chunks = []; mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      mr.start(10000);
      Object.assign(this, { active: true, key: lesson.key, media: mr, startedAt: Date.now() });
      try { this.lock = await navigator.wakeLock?.request('screen'); } catch { /* 화면 켜짐 유지 실패 */ }
      renderStatus();
    } catch (e) {
      toast('마이크를 쓸 수 없어요. 브라우저 마이크 권한을 확인해 주세요.');
      const l = S.lessons[lesson.key] || (S.lessons[lesson.key] = {}); l.skipRecording = true; save();
    }
  },
  stop(key) {
    if (!this.active || (key && key !== this.key)) return Promise.resolve(null);
    const mr = this.media; const lessonKey = this.key;
    this.active = false; this.key = null;
    try { this.lock?.release(); } catch { /* 무시 */ }
    return new Promise((res) => {
      mr.onstop = async () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' });
        const ttl = S.settings.recording.ttlHours * 3600e3;
        try { await audioPut({ key: lessonKey, blob, createdAt: Date.now(), deleteAt: Date.now() + ttl, startedAt: this.startedAt }); } catch { toast('음성을 저장하지 못했어요'); }
        res(lessonKey);
      };
      mr.stop();
    });
  },
};
function onLessonStart(lesson) {
  if (!lesson) return;
  const st = S.lessons[lesson.key] || (S.lessons[lesson.key] = {});
  st.started = true; st.startedAt = st.startedAt || now().toISOString();
  if (S.mode !== 'demo' && Recorder.ready() && !st.skipRecording) Recorder.start(lesson);
  save();
}
async function onLessonEnd(lesson) {
  const st = S.lessons[lesson.key] || (S.lessons[lesson.key] = {});
  st.ended = true; st.endedAt = now().toISOString(); save();
  if (S.mode === 'demo') { if (st.recordingDemo) processAudio(lesson.key); return; }
  if (Recorder.active && Recorder.key === lesson.key) { await Recorder.stop(lesson.key); processAudio(lesson.key); }
}

/* ---------- 녹음 정리 ---------- */
async function processAudio(key) {
  const st = S.lessons[key] || (S.lessons[key] = {}); const lesson = lessonByKey(key);
  if (!lesson || st.processing) return;
  st.processing = true; save(); renderStatus(); Popup.refreshIf(key);
  try {
    if (S.mode === 'demo') {
      await new Promise((r) => setTimeout(r, 1200));
      S.transcripts[key] = demoTranscript();
      ensureSuggestions(key);
    } else {
      if (!serverUrl()) { st.aiPending = true; st.retryAt = Date.now() + 120e3; toast('누가 서버를 연결하면 녹음이 정리됩니다'); return; }
      const a = await audioGet(key); if (!a) { st.aiPending = false; return; }
      const fd = new FormData(); fd.append('audio', a.blob, 'lesson.webm');
      const r = await api('/ai/transcribe', { body: fd, timeout: 300000 });
      const base = new Date(st.startedAt || dateAt(lesson.date, lesson.start)).getTime();
      S.transcripts[key] = { id: uid(), lessonKey: key, source: 'ai', segments: (r.segments || []).map((g, i) => ({ id: `s${i + 1}`, t0: hms(new Date(base + (Number(g.start) || 0) * 1000)), speaker: g.speaker, text: g.text, sum: g.summary || '' })) };
      const tr = S.transcripts[key];
      try {
        const sg = await api('/ai/suggest', { body: { segments: tr.segments.map((g) => ({ id: g.id, t0: g.t0, speaker: g.speaker, text: g.text })), teacherSpeaker: teacherSpeaker(tr), unit: progressAt(lesson.class, lesson.date)?.unit || '', categories: S.settings.categories, max: 10 } });
        const items = (sg.items || []).map((x) => { const seg = tr.segments.find((g) => g.id === x.segId); return seg ? { id: uid(), lessonKey: key, segId: seg.id, t0: seg.t0, speaker: seg.speaker, text: seg.text, sum: x.sum || seg.sum, criteria: x.criteria, cat: clamp(Number(x.cat) || 0, 0, 3), score: Number(x.score) || 0.5, status: 'new', recordId: null } : null; }).filter(Boolean);
        if (items.length) S.suggestions.push(...items); else ensureSuggestions(key);
      } catch { ensureSuggestions(key); }
      st.aiPending = false;
    }
  } catch (e) {
    st.aiPending = true; st.retryAt = Date.now() + 120e3;
    toast(`녹음 정리를 2분 뒤 다시 시도해요 (${e.message || '오류'})`);
  } finally {
    st.processing = false; save(); renderStatus(); Popup.refreshIf(key);
  }
}

/* ---------- 5초 주기 ---------- */
let lastLessonKey = null;
function tick() {
  if (!S || !S.setupDone) return;
  const t = now(); const m = minOf(t); const day = ymd(t);
  const cur = currentLesson(t);
  if (cur && !(S.lessons[cur.key] || {}).started) onLessonStart(cur);
  // 다음 수업 1분 전 녹음 안내 (실사용 · 녹음 켬)
  if (S.mode === 'real' && Recorder.ready()) {
    const n = nextLesson(t);
    if (n && n.date === day && n.start - m <= 1 && n.start - m >= 0) {
      const st = S.lessons[n.key] || (S.lessons[n.key] = {});
      if (!st.noticed) { st.noticed = true; save(); toast(`곧 ${perLabel(n.period)} ${n.class}반 녹음을 시작합니다`, { action: { label: '이번엔 쉬기', fn: () => { st.skipRecording = true; save(); } }, ms: 15000 }); }
    }
  }
  for (const l of lessonsOn(day)) {
    const st = S.lessons[l.key];
    if (st && st.started && !st.ended && m >= l.end) onLessonEnd(l);
  }
  for (const [key, st] of Object.entries(S.lessons)) if (st.aiPending && !st.processing && (st.retryAt || 0) <= Date.now() && serverUrl()) processAudio(key);
  const key = cur ? cur.key : null;
  if (key !== lastLessonKey) { lastLessonKey = key; if (!Popup.key && UI.view === 'lesson' && !UI.sheet) render(); }
  renderStatus();
  Popup.check('tick');
}

/* ---------- 자리 감지 ---------- */
const Presence = {
  last: 0, idle: null,
  mark(reason) { this.last = Date.now(); if (reason) Popup.check(reason); },
  recent(ms = 45000) { return Date.now() - this.last < ms; },
  init() {
    let lastMove = 0;
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, () => this.mark('input'), { passive: true });
    window.addEventListener('pointermove', () => { if (Date.now() - lastMove > 4000) { lastMove = Date.now(); this.mark('input'); } }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.mark('visible'); });
    window.addEventListener('focus', () => this.mark('focus'));
    if (S.settings.popup.presence) this.startIdle();
  },
  /** 화면 잠금 해제 감지 (IdleDetector, 사용자가 켰을 때만) */
  async startIdle() {
    if (!('IdleDetector' in window)) { toast('이 브라우저는 자리 감지(IdleDetector)를 지원하지 않아요. 입력·화면 전환으로 감지합니다.'); return false; }
    try {
      if ((await IdleDetector.requestPermission()) !== 'granted') return false;
      const d = new IdleDetector(); this.idle = d;
      d.addEventListener('change', () => { if (d.userState === 'active' && d.screenState === 'unlocked') this.mark('idle'); });
      await d.start({ threshold: 60000 });
      return true;
    } catch { return false; }
  },
};

/* ---------- 정리 팝업 ---------- */
const Popup = {
  key: null, hold: false, st: null,
  /** 뜰 조건: 팝업 켬 · 수업 중 아님 · 다음 수업까지 여유 · 끝난 수업에 정리할 것 · 자리 신호 */
  check(reason) {
    if (!S || !S.setupDone || this.key || this.hold || UI.sheet || location.hash.startsWith('#student')) return;
    const p = S.settings.popup; if (!p.enabled) return;
    const t = now(); if (currentLesson(t)) return;
    const n = nextLesson(t); if (n && n.date === ymd(t) && n.start - minOf(t) < p.quietMin) return;
    const target = reviewQueue().find((l) => ((S.lessons[l.key] || {}).snoozeUntil || 0) <= nowMs());
    if (!target) return;
    const signal = reason === 'input' || reason === 'visible' || reason === 'focus' || reason === 'idle' || Presence.recent();
    if (document.hidden) {
      const st = S.lessons[target.key] || (S.lessons[target.key] = {});
      if (p.notify && !st.notified && 'Notification' in window && Notification.permission === 'granted') {
        st.notified = true; save();
        try { new Notification(`${perLabel(target.period)} ${target.class}반 정리 · 1분`, { body: '자리에 돌아오면 정리 창이 열려요' }); } catch { /* 무시 */ }
      }
      return;
    }
    if (signal) this.show(target.key);
  },
  show(key) { this.key = key; this.st = { picks: {}, notes: {}, skip: {}, assign: null, more: false, done: {} }; this.mount(); },
  close() { this.key = null; this.st = null; $('#rv')?.remove(); },
  refreshIf(key) { if (this.key === key) this.mount(); },
  mount() {
    const key = this.key; const lesson = lessonByKey(key); if (!lesson) { this.close(); return; }
    const old = $('#rv'); const scroll = old?.querySelector('.rv-b')?.scrollTop || 0;
    // 입력 중인 값을 지킨다
    old?.querySelectorAll('input[data-rid]').forEach((i) => { this.st.notes[i.dataset.rid] = i.value; });
    const el = this.build(lesson); old ? old.replaceWith(el) : document.body.appendChild(el);
    const b = el.querySelector('.rv-b'); if (b) b.scrollTop = scroll;
  },
  build(lesson) {
    const key = lesson.key; const st = this.st; const ls = S.lessons[key] || {};
    const tr = S.transcripts[key];
    const recs = S.records.filter((r) => r.lessonKey === key && (r.status === 'pending' || st.done[r.id])).sort((a, b) => a.time.localeCompare(b.time));
    const sugs = suggestionsFor(key);
    const handled = recs.filter((r) => st.done[r.id] || st.skip[r.id]).length;
    const total = recs.length + Math.min(sugs.length, S.settings.popup.maxSuggestions);
    const prog = progressAt(lesson.class, lesson.date);
    const recState = ls.processing ? '녹음 정리 중' : tr ? '녹음 정리됨' : ls.aiPending ? '녹음 정리 대기' : (ls.recordingDemo || ls.startedAt) && S.settings.recording.enabled ? '녹음 없음' : '녹음 꺼짐';
    // 후보: 늦게 생겨도 첫 후보로 채운다 (교사가 직접 쓴 문구는 유지)
    const recCards = recs.map((r) => {
      const cands = candidatesFor(r, tr, lesson);
      if (st.picks[r.id] === undefined || (st.picks[r.id] === -1 && cands.length)) st.picks[r.id] = cands.length ? 0 : -1;
      const c = cands[st.picks[r.id]];
      if (st.notes[r.id] === undefined && c) st.notes[r.id] = c.seg.sum || '';
      const done = st.done[r.id]; const skip = st.skip[r.id];
      return h('div', { class: `rv-rec ${done || skip ? 'done' : ''}` },
        h('div', { class: 'row wrap' }, h('b', null, studentLabel(r.class, r.no)), h('span', { class: `chip c${r.cat}` }, S.settings.categories[r.cat]),
          h('span', { class: 'xs muted' }, `${hms(r.time)} · ${DEVICE[r.device] || ''}`), h('span', { class: 'grow' }),
          skip ? h('span', { class: 'xs muted' }, '건너뜀') : done ? h('span', { class: 'xs muted' }, '저장됨') : null),
        c ? h('div', { class: 'rv-quote' }, h('span', { class: 'meta' }, `${c.seg.t0} · ${c.seg.speaker}`), `“${c.seg.text}”`)
          : h('div', { class: 'xs muted' }, ls.processing ? '녹음을 정리하는 중이에요. 끝나면 이 시각의 발언이 여기에 골라져요.' : tr ? '이 시각 앞뒤 발언 후보가 없어요. 한 줄로 적어 주세요.' : '녹음이 없어요. 한 줄로 적어 주세요.'),
        done || skip ? null : h('input', { type: 'text', 'data-rid': r.id, value: st.notes[r.id] || '', placeholder: '한 줄 보완 (예: 촉매와 평형 위치의 관계를 질문함)', 'aria-label': `${r.no}번 보완` }),
        done || skip ? null : h('div', { class: 'row wrap gap4' },
          h('div', { class: 'rv-chips' }, chipWords(r.cat).map((w) => h('button', { onclick: (e) => { const i = e.target.closest('.rv-rec').querySelector('input'); i.value = (i.value.trim() ? i.value.trim() + ' ' : '') + w; st.notes[r.id] = i.value; i.focus(); } }, w))),
          h('span', { class: 'grow' }),
          cands.length > 1 ? h('button', { class: 'btn xs', onclick: () => { st.picks[r.id] = (st.picks[r.id] + 1) % cands.length; st.notes[r.id] = cands[st.picks[r.id]].seg.sum || ''; this.mount(); } }, `다른 후보 (${cands.length})`) : null,
          h('button', { class: 'btn xs ghost', onclick: () => { st.skip[r.id] = true; this.mount(); } }, '건너뛰기')));
    });
    const left = recs.filter((r) => !st.done[r.id] && !st.skip[r.id]).length;
    const shown = st.more ? sugs : sugs.slice(0, S.settings.popup.maxSuggestions);
    const sugCards = shown.map((g) => h('div', { class: 'rv-sug' },
      h('div', { class: 'row wrap' }, h('span', { class: 'xs muted num' }, `${g.t0} · ${g.speaker}`), h('span', { class: 'chip out' }, g.criteria), h('span', { class: `chip c${g.cat}` }, S.settings.categories[g.cat])),
      h('div', null, `“${g.text}”`),
      st.assign === g.id ? h('div', { class: 'col' }, h('div', { class: 'xs muted' }, '누구의 발언이었는지 번호를 고르세요. 화자 라벨과 학생은 연결해 저장하지 않아요.'),
        h('div', { class: 'rv-pick' }, (classOf(lesson.class)?.students || []).map((s) => h('button', { onclick: () => this.assign(g, s.no) }, s.no))),
        h('div', null, h('button', { class: 'btn xs ghost', onclick: () => { st.assign = null; this.mount(); } }, '취소')))
        : h('div', { class: 'row wrap gap4' },
          h('button', { class: 'btn sm primary', onclick: () => { st.assign = g.id; this.mount(); } }, '누구였는지 번호 고르기'),
          h('button', { class: 'btn sm', onclick: () => { g.status = 'dismissed'; save(); this.mount(); } }, '아니요'),
          h('button', { class: 'btn sm ghost', onclick: () => replay(key, g) }, '다시 듣기'))));
    return h('div', { class: 'rv-back', id: 'rv', role: 'dialog', 'aria-label': '수업 정리' },
      h('div', { class: 'rv' },
        h('div', { class: 'rv-h' },
          h('div', { class: 'row wrap' }, h('span', { class: 'ttl' }, `${perLabel(lesson.period)} · ${lesson.class}반 정리`), h('span', { class: 'chip' }, '정리 약 1분'), h('span', { class: 'grow' }), h('button', { class: 'x', onclick: () => this.later(), 'aria-label': '나중에' }, '×')),
          h('div', { class: 'small muted' }, [prog?.unit, `${fromMin(lesson.start)}–${fromMin(lesson.end)}`, recState].filter(Boolean).join(' · ')),
          h('div', { class: 'rv-prog' }, h('i', { style: { width: `${total ? (handled / total) * 100 : 100}%` } }))),
        h('div', { class: 'rv-b' },
          h('section', { class: 'rv-sec' }, h('h3', null, `① 내 기록 ${recs.length}건`), recs.length ? h('div', { class: 'col' }, recCards) : h('div', { class: 'xs muted' }, '이 수업에 남긴 기록이 없어요.'),
            left ? h('div', { class: 'row mt8' }, h('button', { class: 'btn primary', onclick: () => this.saveAll() }, `${left}건 한 번에 저장`)) : null),
          h('section', { class: 'rv-sec' }, h('h3', null, '② 놓친 발언'),
            ls.processing && !sugs.length ? h('div', { class: 'info' }, '녹음을 정리하는 중이에요. 잠시 뒤 놓친 발언이 여기에 나타나요.') : null,
            !ls.processing && !sugs.length ? h('div', { class: 'xs muted' }, tr ? '추천할 발언이 없어요.' : '녹음이 있으면 기록할 만한 발언을 골라 드려요.') : null,
            h('div', { class: 'col' }, sugCards),
            sugs.length > shown.length ? h('button', { class: 'btn xs ghost mt8', onclick: () => { st.more = true; this.mount(); } }, `더 보기 (${sugs.length - shown.length})`) : null)),
        h('div', { class: 'rv-f' },
          h('span', { class: 'xs muted' }, 'AI는 누가 말했는지 추정하지 않아요. 번호는 선생님이 고릅니다.'), h('span', { class: 'grow' }),
          h('button', { class: 'btn', onclick: () => this.later() }, '나중에'),
          h('button', { class: 'btn primary', onclick: () => this.finish() }, '끝'))));
  },
  saveAll() {
    const lesson = lessonByKey(this.key); const tr = S.transcripts[this.key]; let n = 0;
    $('#rv')?.querySelectorAll('input[data-rid]').forEach((i) => { this.st.notes[i.dataset.rid] = i.value; });
    for (const r of S.records.filter((x) => x.lessonKey === this.key && x.status === 'pending')) {
      if (this.st.skip[r.id]) { r.status = 'skipped'; continue; }
      const cands = candidatesFor(r, tr, lesson); const c = cands[this.st.picks[r.id]];
      const note = (this.st.notes[r.id] || '').trim() || (c ? c.seg.sum : '');
      r.note = note; r.noteSource = c && note === (c.seg.sum || '') ? 'transcript' : 'typed';
      r.transcriptRef = c ? { transcriptId: tr.id, segId: c.seg.id } : null;
      r.status = 'confirmed'; this.st.done[r.id] = true; n++;
    }
    save(); toast(`${n}건 저장했어요`); this.mount(); renderStatus();
  },
  assign(g, no) {
    const lesson = lessonByKey(this.key); const tr = S.transcripts[this.key];
    const seg = tr?.segments.find((x) => x.id === g.segId);
    const time = seg ? segTime(lesson, seg) : now();
    const rec = addRecord(lesson.class, no, g.cat, { time: time.toISOString(), lessonKey: this.key, note: g.sum || '', noteSource: 'transcript', source: 'suggestion', status: 'confirmed', transcriptRef: { transcriptId: tr?.id, segId: g.segId } });
    g.status = 'recorded'; g.recordId = rec.id; this.st.assign = null; save();
    toast(`${studentLabel(lesson.class, no)} 기록으로 저장 (추천)`, { action: { label: '되돌리기', fn: () => { g.status = 'new'; g.recordId = null; undoRecord(rec.id); this.refreshIf(lesson.key); } } });
    this.mount();
  },
  later() {
    const st = S.lessons[this.key] || (S.lessons[this.key] = {});
    const n = nextLesson(); st.snoozeUntil = n && n.date === ymd(now()) ? dateAt(n.date, n.end).getTime() : nowMs() + 30 * 60e3;
    save(); this.close(); toast('다음 빈 시간에 다시 열게요'); render();
  },
  finish() {
    const key = this.key; const lesson = lessonByKey(key);
    const left = S.records.filter((r) => r.lessonKey === key && r.status === 'pending').length;
    if (left) { this.saveAll(); }
    const st = S.lessons[key] || (S.lessons[key] = {}); st.popupDone = true; save();
    const sug = suggestionsFor(key).length;
    const low = (classOf(lesson.class)?.students || []).filter((s) => S.records.filter((r) => r.class === lesson.class && r.no === s.no && r.status !== 'skipped').length <= 1).length;
    this.close(); render();
    toast([sug ? `남은 추천 ${sug}개는 정리 → 추천함에 있어요.` : '정리를 마쳤어요.', low ? `${lesson.class}반 기록 1건 이하 학생 ${low}명` : ''].filter(Boolean).join(' '));
  },
};
function chipWords(cat) {
  return [['질문함', '조건을 질문함', '예외를 질문함'], ['설명함', '근거를 들어 발표함', '정리해 발표함'], ['도와줌', '역할을 맡음', '의견을 이어 정리함'], ['연결해 설명함', '근거를 찾음', '스스로 고침']][cat] || [];
}
/** 다시 듣기: 그 구간 근처부터 재생 (음성은 기기에만, 24시간) */
async function replay(key, g) {
  if (S.mode === 'demo') { toast('데모에는 실제 음성이 없어요 (합성 전사)'); return; }
  const a = await audioGet(key).catch(() => null); if (!a) { toast('음성이 없거나 보관 기간(24시간)이 지났어요'); return; }
  const lesson = lessonByKey(key); const tr = S.transcripts[key]; const seg = tr?.segments.find((x) => x.id === g.segId);
  const audio = new Audio(URL.createObjectURL(a.blob));
  const off = seg && a.startedAt ? Math.max(0, (segTime(lesson, seg).getTime() - a.startedAt) / 1000 - 3) : 0;
  audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = off; } catch { /* 무시 */ } audio.play(); });
  setTimeout(() => audio.pause(), 20000);
}

/* ---------- 가상 워치 ---------- */
function renderWatchSim() {
  const w = UI.watch; const cur = currentLesson(); const cls = cur ? cur.class : UI.cls || classIds()[0];
  const size = classOf(cls)?.students.length || 30;
  const colors = ['#4C7BFF', '#1FA89E', '#9B6BD6', '#5C606B'];
  const body = w.step === 'cat'
    ? [h('div', { class: 'wtop' }, cls ? `${cls}반 ${cur ? perLabel(cur.period) : ''}` : '반 없음'),
      h('div', { class: 'wcats' }, S.settings.categories.map((c, i) => h('button', { style: { background: colors[i] }, onclick: () => { w.cat = i; w.step = 'num'; w.no = w.no || 1; render(); } }, c)))]
    : [h('div', { class: 'wtop' }, `${cls}반 · ${S.settings.categories[w.cat]}`),
      h('div', { class: 'wrow' }, h('button', { onclick: () => { w.no = w.no > 1 ? w.no - 1 : size; render(); }, 'aria-label': '이전 번호' }, '−'), h('div', { class: 'wnum' }, w.no), h('button', { onclick: () => { w.no = w.no < size ? w.no + 1 : 1; render(); }, 'aria-label': '다음 번호' }, '+')),
      h('button', { class: 'wsave', onclick: () => {
        const no = w.no; const cat = w.cat; const t = now().toISOString(); w.step = 'cat'; render();
        toast(`워치: ${no}번 ${S.settings.categories[cat]} 저장`);
        setTimeout(() => { addRecord(cls, no, cat, { device: 'watch', time: t }); toast(`워치 기록 1건 도착 · ${cls} ${no}번`); render(); }, 900);
      } }, '저장')];
  return h('div', { class: 'watch-sim no-print', role: 'group', 'aria-label': '가상 워치' }, h('button', { class: 'wclose', onclick: () => { UI.watch = null; render(); }, 'aria-label': '워치 닫기' }, '×'), body);
}
