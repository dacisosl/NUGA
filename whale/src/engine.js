'use strict';
/* engine.js — 데모 데이터 · 발언 후보 · 놓친 발언 추천 · 문장 변환 · 피드백 · 세특 점검 */

/* ---------- 재현 가능한 난수 ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/* ---------- 데모 (합성 데이터 · 번호만) ---------- */
const DEMO_UNITS = [
  { from: '2026-09-01', to: '2026-09-18', unit: '화학 결합', standards: ['[예시 2-1]', '[예시 2-2]'], words: ['이온 결합', '공유 결합', '전기 음성도', '결합의 극성', '분자 모형'] },
  { from: '2026-09-21', to: '2026-10-09', unit: '산과 염기', standards: ['[예시 3-1]', '[예시 3-2]'], words: ['중화 반응', '지시약', 'pH', '중화 적정', '양적 관계'] },
  { from: '2026-10-12', to: '2026-10-30', unit: '화학 평형', standards: ['[예시 4-1]', '[예시 4-2]'], words: ['가역 반응', '동적 평형', '르샤틀리에 원리', '농도 변화', '온도 변화'] },
];
const DEMO_STANDARDS = {
  '[예시 2-1]': '(예시) 화학 결합의 종류를 구분하고 물질의 성질과 관련지어 설명한다.',
  '[예시 2-2]': '(예시) 전기 음성도를 이용해 결합의 극성을 설명한다.',
  '[예시 3-1]': '(예시) 산과 염기의 중화 반응을 실험으로 확인한다.',
  '[예시 3-2]': '(예시) 중화 적정 결과로 양적 관계를 설명한다.',
  '[예시 4-1]': '(예시) 가역 반응에서 동적 평형 상태를 설명한다.',
  '[예시 4-2]': '(예시) 조건 변화에 따른 평형 이동을 예측한다.',
};
/** 카테고리별 관찰 메모 틀 ({w} = 단원 낱말) */
const DEMO_NOTES = [
  ['{w}에서 예외가 생기는 이유를 질문함', '{w}의 조건이 바뀌면 결과가 어떻게 되는지 질문함', '{w:을/를} 지난 단원 개념과 비교해 질문함', '실험 오차가 생긴 까닭을 질문함'],
  ['{w:을/를} 그림으로 그려 반 전체에 설명함', '모둠 실험 결과를 표로 정리해 발표함', '{w} 문제 풀이 과정을 칠판에서 발표함', '{w}의 일상 예를 들어 발표함'],
  ['모둠원에게 {w:을/를} 다시 설명해 도움', '실험 역할을 나누고 기록을 맡음', '모둠 토의에서 친구 의견을 이어받아 정리함', '실험 기구 정리를 먼저 챙김'],
  ['{w} 실험 결과를 그래프로 그려 경향을 찾음', '{w:과/와} 생활 현상을 연결해 설명함', '자기 풀이의 잘못된 부분을 스스로 찾아 고침', '{w} 자료에서 근거를 들어 결론을 냄'],
];
/** 기록 편중 재현 (2-3반) */
const DEMO_WEIGHT = { '2-3': { 7: 0.02, 14: 0.02, 21: 0.02, 3: 0.35, 9: 0.35, 2: 2.6, 5: 2.4, 12: 2.6, 16: 2.2 } };
const DEMO_TT = [
  { weekday: 2, period: 2, class: '2-3' }, { weekday: 4, period: 3, class: '2-3' }, { weekday: 5, period: 4, class: '2-3' },
  { weekday: 1, period: 3, class: '2-5' }, { weekday: 3, period: 2, class: '2-5' }, { weekday: 5, period: 2, class: '2-5' },
];
/** 2026-10-13(화) 2교시 2-3반 합성 전사 22구간 (실존 인물·실제 수업 아님) */
const DEMO_TRANSCRIPT = [
  ['09:50:40', '화자1', '자, 지난 시간에 가역 반응을 배웠죠. 오늘은 동적 평형을 이어서 봅시다.', '동적 평형 도입'],
  ['09:52:10', '화자1', '밀폐된 병에 든 탄산음료는 왜 기포가 계속 나오지 않을까요? 모둠별로 30초 이야기해 보세요.', '탄산음료 질문'],
  ['09:53:05', '화자3', '기체가 녹는 것과 빠져나오는 게 같이 일어나서 겉으로 멈춘 것처럼 보이는 거 아닐까요?', '정반응·역반응 동시 진행 추론'],
  ['09:54:30', '화자1', '좋아요. 정반응과 역반응의 속도가 같아진 상태를 동적 평형이라고 합니다.', '개념 정리'],
  ['10:04:40', '화자4', '저희 모둠은 증발이랑 응축이 같은 속도로 일어나서 물 높이가 그대로라고 정리했어요.', '증발·응축 예로 설명'],
  ['10:06:20', '화자1', '증발과 응축, 지난 단원에서 본 것과 연결했네요. 그래프를 같이 봅시다.', '그래프 안내'],
  ['10:07:55', '화자5', '그래프 보면 농도가 처음엔 변하다가 어느 순간부터 일정해져요.', '그래프에서 일정 구간 찾음'],
  ['10:09:30', '화자1', '맞아요. 그 지점부터가 평형 상태예요. 그런데 이때 반응이 멈춘 걸까요?', '평형 상태 확인 질문'],
  ['10:11:45', '화자6', '그럼 평형 상태에서는 반응물이랑 생성물 양이 항상 같은 건가요?', '양이 같은지 질문'],
  ['10:12:30', '화자1', '많이들 헷갈리는 부분이에요. 속도가 같다는 거지 양이 같다는 뜻은 아니에요.', '오개념 짚기'],
  ['10:13:40', '화자6', '아, 다시 보니 제가 잘못 생각했어요. 양이 아니라 변하지 않는다는 게 핵심이네요.', '자기 생각 고침'],
  ['10:15:10', '화자1', '이제 활동지 1번을 모둠별로 풀어 봅시다. 역할을 나눠서 해 보세요.', '활동지 안내'],
  ['10:16:30', '화자7', '나 그래프 읽는 거 잘 모르겠는데 어디부터 봐야 해?', '도움 요청'],
  ['10:17:05', '화자4', '가로축이 시간이고 두 선이 만나는 데를 찾으면 돼. 같이 보자.', '친구에게 설명'],
  ['10:20:40', '화자8', '제가 결과 정리해 줄게요. 너는 그래프 그리는 역할 해 줄래?', '역할 나눠 정리'],
  ['10:22:15', '화자1', '2번은 일상생활에서 동적 평형의 예를 찾는 거예요. 교과서에 없는 예면 더 좋아요.', '2번 안내'],
  ['10:23:50', '화자9', '혈액 속 산소랑 헤모글로빈 결합도 비슷한 원리 아니에요? 높은 산에서 숨이 찬 거랑 같은.', '생활 현상과 연결'],
  ['10:25:20', '화자3', '포화 소금물도 녹는 것과 생기는 게 같이 일어나니까 동적 평형이라고 볼 수 있어요.', '포화 용액 예'],
  ['10:26:40', '화자1', '좋은 예예요. 네, 화장실 다녀와도 돼요.', '수업 진행'],
  ['10:30:10', '화자5', '앞에서 말한 거에 덧붙이면, 평형이 깨지면 다시 맞춰지는 방향으로 움직일 것 같아요.', '평형 이동 예측'],
  ['10:34:18', '화자10', '근데 촉매를 넣으면 평형 위치도 바뀌나요?', '촉매와 평형 위치 질문'],
  ['10:36:30', '화자1', '좋은 질문이에요. 다음 시간에 평형 이동과 함께 확인합시다. 오늘 정리합시다.', '정리'],
];
const DEMO_DAY = '2026-10-13';
const DEMO_KEY = '2026-10-13_2-3_2';

function buildDemoState() {
  const s = defaultState('demo');
  const r = rng(20261013);
  s.setupDone = true;
  s.school = { name: '해밀고등학교', code: 'DEMO', office: '', kind: 'high', source: 'demo' };
  Object.assign(s.settings, { level: 'high', subject: '화학Ⅰ', categories: CATS.high.slice(), numberOnly: true, teacherGuide: '탐구 과정과 개념 연결을 중심으로, 한 문장은 60자 안팎으로.' });
  s.settings.recording = { enabled: true, checklist: true, ttlHours: 24, items: { approve: true, privacy: true, consent: true, transfer: true } };
  s.classes = ['2-3', '2-5'].map((id) => ({ id, students: Array.from({ length: 25 }, (_, i) => ({ no: i + 1, name: '' })) }));
  s.timetable = DEMO_TT.map((x) => ({ ...x }));
  s.progress = DEMO_UNITS.map((u) => ({ class: '*', from: u.from, to: u.to, unit: u.unit, standards: u.standards.slice() }));
  s.standards = { ...DEMO_STANDARDS };
  s.account = { provider: 'none' };
  s.sync = { role: 'main', key: null, channel: null, devices: [{ name: '가상 워치', kind: 'watch' }, { name: '폰', kind: 'phone' }], outbox: [] };
  // 수업마다 기록 5~8건 (9/1 ~ 10/12)
  const prev = S; S = s; // periodTimes·lessonsOn 이 S 를 쓰므로 잠시 바꾼다
  try {
    for (let day = '2026-09-01'; day <= '2026-10-12'; day = addDays(day, 1)) {
      for (const l of lessonsOn(day)) {
        const unit = DEMO_UNITS.find((u) => u.from <= day && day <= u.to);
        const n = 5 + Math.floor(r() * 4);
        const w = DEMO_WEIGHT[l.class] || {};
        const pool = []; for (let no = 1; no <= 25; no++) { const k = w[no] ?? 1; for (let i = 0; i < Math.round(k * 10); i++) pool.push(no); }
        for (let i = 0; i < n; i++) {
          const no = pick(r, pool); const cat = Math.floor(r() * 4);
          const minute = l.start + 3 + Math.floor(r() * (l.end - l.start - 6));
          const t = dateAt(day, minute, Math.floor(r() * 60));
          const word = pick(r, unit ? unit.words : ['개념']);
          const note = r() < 0.9 ? pick(r, DEMO_NOTES[cat]).replace(/\{w(?::([^}]+))?\}/g, (_, pair) => (pair ? josa(word, pair) : word)) : '';
          s.records.push({ id: uid(), class: l.class, no, cat, time: t.toISOString(), lessonKey: l.key, unit: unit?.unit || '', std: unit ? [pick(r, unit.standards)] : [], note, noteSource: 'typed', source: 'direct', device: pick(r, ['whalebook', 'whalebook', 'phone', 'watch']), status: 'confirmed' });
        }
        s.lessons[l.key] = { started: true, ended: true, popupDone: true };
      }
    }
    // 오늘 수업 중 기록 3건 (보완 대기)
    const u = DEMO_UNITS[2];
    const today = [[12, 1, '10:05:02', 'whalebook'], [5, 0, '10:12:08', 'watch'], [18, 2, '10:21:05', 'phone']];
    for (const [no, cat, t, device] of today) {
      const [hh, mm, ss] = t.split(':').map(Number);
      s.records.push({ id: uid(), class: '2-3', no, cat, time: dateAt(DEMO_DAY, hh * 60 + mm, ss).toISOString(), lessonKey: DEMO_KEY, unit: u.unit, std: [u.standards[0]], note: '', noteSource: 'typed', source: 'direct', device, status: 'pending' });
    }
    s.lessons[DEMO_KEY] = { started: true, startedAt: dateAt(DEMO_DAY, 9 * 60 + 50).toISOString(), recordingDemo: true };
  } finally { S = prev; }
  s.demoClock = dateAt(DEMO_DAY, 10 * 60 + 29).getTime(); s.demoSetAt = Date.now();
  return s;
}
function demoTranscript() {
  return { id: uid(), lessonKey: DEMO_KEY, source: 'demo', segments: DEMO_TRANSCRIPT.map(([t0, speaker, text, sum], i) => ({ id: `s${i + 1}`, t0, speaker, text, sum })) };
}

/* ---------- 전사 · 발언 후보 ---------- */
function teacherSpeaker(tr) {
  const m = new Map(); for (const s of tr.segments) m.set(s.speaker, (m.get(s.speaker) || 0) + s.text.length);
  let best = null, max = -1; for (const [k, v] of m) if (v > max) { best = k; max = v; }
  return best;
}
function segTime(lesson, seg) { const [a, b, c] = seg.t0.split(':').map(Number); return dateAt(lesson.date, a * 60 + b, c || 0); }
const RX = {
  q: /\?|까요|나요|가요|는지|은지|을까|ㄹ까/,
  coop: /같이|역할|도와|정리해 줄|할게|알려 줄/,
  inq: /그래프|결과|실험|연결|데이터|보면|원리/,
  chat: /^(네|예|아니요|화장실|몇 쪽|잠깐|선생님 저)/,
};
function catFit(cat, text) {
  if (cat === 0) return RX.q.test(text);
  if (cat === 2) return RX.coop.test(text);
  if (cat === 1) return !RX.q.test(text);
  return RX.inq.test(text);
}
/** 내 기록의 후보 발언: 교사가 아닌 화자, 기록 시각 −60초 ~ +15초, 카테고리 맞으면 +2, 1분당 −1 */
function candidatesFor(rec, tr, lesson) {
  if (!tr || !lesson) return [];
  const teacher = teacherSpeaker(tr); const t = new Date(rec.time).getTime();
  const out = [];
  for (const seg of tr.segments) {
    if (seg.speaker === teacher) continue;
    const d = (segTime(lesson, seg).getTime() - t) / 1000;
    if (d < -60 || d > 15) continue;
    const score = (catFit(rec.cat, seg.text) ? 2 : 0) - Math.abs(d) / 60;
    out.push({ seg, score, d });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ---------- 놓친 발언 추천 (규칙 엔진) ---------- */
const CRITERIA = [
  { name: '깊이 있는 질문', cat: 0, w: 3, re: /(왜|그럼|만약|어떻게|바뀌).*(\?|까요|나요|가요|ㄴ가요)/ },
  { name: '개념 연결', cat: 3, w: 3, re: /배운|지난|비슷|처럼|같은 원리|연결/ },
  { name: '오개념 수정·자기 성찰', cat: 3, w: 3, re: /다시 보니|틀렸|잘못|반대로|수정/ },
  { name: '근거 제시', cat: 3, w: 2.5, re: /그래프|결과|실험|데이터|보면/, plain: true },
  { name: '다른 의견 확장', cat: 1, w: 2.5, re: /덧붙|이어서|말한 거/ },
  { name: '협력·배려', cat: 2, w: 2, re: /같이|정리해 줄|도와|역할|할게/ },
];
function scoreUtterance(text, unitWords = []) {
  if (text.length < 12 || RX.chat.test(text)) return null;
  let best = null;
  for (const c of CRITERIA) {
    if (!c.re.test(text)) continue;
    if (c.plain && RX.q.test(text)) continue;
    if (!best || c.w > best.w) best = c;
  }
  if (!best) return null;
  const words = unitWords.filter((w) => text.includes(w)).length;
  return { criteria: best.name, cat: best.cat, score: best.w + Math.min(1, text.length / 60) + (words ? 0.6 : 0) };
}
function unitWordsFor(lesson) {
  const p = progressAt(lesson.class, lesson.date); if (!p) return [];
  const demo = DEMO_UNITS.find((u) => u.unit === p.unit);
  return demo ? demo.words : p.unit.split(/\s+/);
}
function buildSuggestions(key) {
  const tr = S.transcripts[key]; const lesson = lessonByKey(key); if (!tr || !lesson) return [];
  const teacher = teacherSpeaker(tr);
  const used = new Set(S.records.filter((r) => r.lessonKey === key && r.transcriptRef).map((r) => r.transcriptRef.segId));
  const words = unitWordsFor(lesson);
  const out = [];
  for (const seg of tr.segments) {
    if (seg.speaker === teacher || used.has(seg.id)) continue;
    const sc = scoreUtterance(seg.text, words); if (!sc) continue;
    out.push({ id: uid(), lessonKey: key, segId: seg.id, t0: seg.t0, speaker: seg.speaker, text: seg.text, sum: seg.sum || '', criteria: sc.criteria, cat: sc.cat, score: Math.round(sc.score * 100) / 100, status: 'new', recordId: null });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}
/** 추천이 아직 없으면 규칙으로 만든다 (서버 AI 가 없거나 비었을 때) */
function ensureSuggestions(key) {
  if (S.suggestions.some((x) => x.lessonKey === key)) return;
  S.suggestions.push(...buildSuggestions(key));
}
/** 이미 기록에 쓴 발언은 추천에서 뺀다 (팝업이 그릴 때마다) */
function suggestionsFor(key) {
  const used = new Set(S.records.filter((r) => r.lessonKey === key && r.transcriptRef).map((r) => r.transcriptRef.segId));
  return S.suggestions.filter((x) => x.lessonKey === key && (x.status === 'new' || x.status === 'later') && !used.has(x.segId)).sort((a, b) => b.score - a.score);
}

/* ---------- 문장 변환 ---------- */
const ACTION_NOUNS = ['발표', '질문', '설명', '정리', '참여', '공유', '비교', '계산', '확인', '안내', '해결', '제안', '분석', '탐구', '작성', '제작', '기록', '관찰', '측정', '토의', '토론', '연결', '적용', '활용', '완성', '제출', '조사', '검증', '도출', '추론', '예측', '요약', '발견', '시도', '보완', '수정', '점검', '표현', '설계', '실험', '협력', '발언', '반박', '제시', '조율', '주도'];
function cleanNote(t) { return String(t || '').trim().replace(/[.。\s]+$/, ''); }
/** 학생용 문장: "~함" → "~한 점이 좋았어요." */
function toStudentSentence(note) {
  const t = cleanNote(note); if (!t) return '';
  const rules = [[/찾음$/, '찾아낸'], [/도움$/, '도운'], [/보임$/, '보여 준'], [/냄$/, '낸'], [/줌$/, '준'], [/씀$/, '쓴'], [/맡음$/, '맡은'], [/챙김$/, '챙긴'], [/고침$/, '고친'], [/함$/, '한']];
  for (const [re, rep] of rules) if (re.test(t)) return t.replace(re, rep) + ' 점이 좋았어요.';
  if (ACTION_NOUNS.some((n) => t.endsWith(n))) return `${t}한 점이 좋았어요.`;
  return `${t} 장면이 좋았어요.`;
}
/** 기록 문장(명사형): 이미 ㅁ 받침이면 그대로, 동작 명사면 "~함.", 아니면 "~을 보임." */
function toRecordSentence(note) {
  const t = cleanNote(note); if (!t) return '';
  if (jong(t.slice(-1)) === 16) return t + '.';
  if (ACTION_NOUNS.some((n) => t.endsWith(n))) return t + '함.';
  return josa(t, '을/를') + ' 보임.';
}
const NEXT_CHALLENGE = {
  elem: ['궁금한 점을 손 들어 한 번 물어보기', '내 생각을 친구들 앞에서 한 문장으로 말해 보기', '모둠 친구에게 먼저 도움을 건네 보기', '배운 것을 생활 속 예와 이어 보기'],
  middle: ['수업 중 "왜 그럴까?"를 한 번 질문해 보기', '내 풀이 과정을 근거와 함께 발표해 보기', '모둠 활동에서 역할을 하나 맡아 끝까지 해 보기', '결과를 그래프나 표로 정리해 경향 찾기'],
  high: ['개념의 조건·예외를 묻는 질문을 해 보기', '근거를 들어 내 풀이를 발표해 보기', '모둠 토의에서 친구 의견을 이어 발전시키기', '실험·자료 결과를 다른 단원 개념과 연결하기'],
};

/* ---------- 기간 ---------- */
function periodRanges(cls) {
  const today = ymd(now());
  const cur = progressAt(cls, today) || S.progress.filter((p) => p.from <= today).sort((a, b) => b.from.localeCompare(a.from))[0];
  const done = S.progress.filter((p) => p.to < today && (!cur || p.from < cur.from)).sort((a, b) => b.to.localeCompare(a.to))[0];
  const out = [];
  if (cur) out.push({ id: `unit-${cur.unit}`, label: `진행 중 단원 · ${cur.unit}`, from: cur.from, to: today });
  if (done) out.push({ id: `unit-${done.unit}`, label: `끝난 단원 · ${done.unit}`, from: done.from, to: done.to });
  out.push({ id: `week-${today}`, label: '최근 7일', from: addDays(today, -6), to: today });
  out.push({ id: 'term', label: '학기', from: S.progress[0]?.from || addDays(today, -120), to: today });
  return out;
}
function recordsIn(cls, from, to, no) {
  return S.records.filter((r) => r.class === cls && (no === undefined || r.no === no) && r.status !== 'skipped' && recDay(r) >= from && recDay(r) <= to);
}

/* ---------- 피드백 카드 ---------- */
/** 기간 안 내용 있는 기록 중 카테고리가 다른 2건 → 잘한 장면, 가장 적은 카테고리 → 다음 도전 */
function feedbackFor(cls, no, range) {
  const recs = recordsIn(cls, range.from, range.to, no).filter((r) => cleanNote(r.note)).sort((a, b) => b.time.localeCompare(a.time));
  if (!recs.length) return { none: true, cls, no };
  const picked = [recs[0]];
  const other = recs.find((r) => r.cat !== recs[0].cat); if (other) picked.push(other);
  picked.sort((a, b) => a.time.localeCompare(b.time));
  const all = recordsIn(cls, range.from, range.to, no);
  const counts = [0, 0, 0, 0]; for (const r of all) counts[r.cat]++;
  const least = counts.indexOf(Math.min(...counts));
  const good = picked.map((r) => toStudentSentence(r.note)).join(' ');
  const next = (NEXT_CHALLENGE[S.settings.level] || NEXT_CHALLENGE.high)[least];
  const edit = S.feedbackEdits[`${cls}_${no}_${range.id}`];
  return { cls, no, good: edit?.good ?? good, next: edit?.next ?? next, evidence: picked.map((r) => `${koDate(recDay(r))} ${S.settings.categories[r.cat]}`), records: picked };
}
function feedbackText(card) { return card.none ? '' : `${card.good}\n다음 도전: ${card.next}`; }
/** 성취기준별 관찰 근거표: 학생 × 성취기준 기록 수 */
function stdMatrix(cls, range) {
  const codes = [...new Set(S.progress.filter((p) => p.from <= range.to && p.to >= range.from).flatMap((p) => p.standards))];
  const st = classOf(cls)?.students || [];
  const recs = recordsIn(cls, range.from, range.to);
  return { codes, rows: st.map((s) => ({ no: s.no, counts: codes.map((c) => recs.filter((r) => r.no === s.no && (r.std || []).includes(c)).length) })) };
}

/* ---------- 눈여겨볼 학생 ---------- */
function watchListFor(cls, n = 3) {
  const st = classOf(cls)?.students || []; if (!st.length) return [];
  const day = ymd(now()); const from = addDays(day, -6);
  const extra = (S.watchExtra[cls] || []).filter((no) => st.some((x) => x.no === no));
  const score = st.map((s) => ({ no: s.no, week: S.records.filter((r) => r.class === cls && r.no === s.no && r.status !== 'skipped' && recDay(r) >= from).length, all: S.records.filter((r) => r.class === cls && r.no === s.no && r.status !== 'skipped').length }));
  score.sort((a, b) => a.week - b.week || a.all - b.all || a.no - b.no);
  return [...extra, ...score.map((x) => x.no).filter((no) => !extra.includes(no))].slice(0, Math.max(n, extra.length));
}

/* ---------- 세특 근거 묶음 · 초안 정리 ---------- */
/** 체크한 기록을 성취기준별로 묶어 명사형 문장으로. 비슷한 문장(자카드 ≥ 0.75)은 합치고 근거만 더한다. 바이트 한도를 넘는 문장은 넣지 않는다. */
function draftFromRecords(recs, limit = S.settings.length.limit) {
  const groups = new Map();
  for (const r of [...recs].sort((a, b) => a.time.localeCompare(b.time))) {
    const k = (r.std && r.std[0]) || '기타'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
  }
  const sents = [];
  for (const [, list] of groups) for (const r of list) {
    const t = toRecordSentence(r.note); if (!t) continue;
    const same = sents.find((s) => jaccard(s.text, t) >= 0.75);
    if (same) { same.evidence.push(r.id); continue; }
    sents.push({ text: t, evidence: [r.id] });
  }
  const kept = []; let bytes = 0;
  for (const s of sents) { const b = neisBytes(s.text) + (kept.length ? 1 : 0); if (bytes + b > limit) continue; kept.push(s); bytes += b; }
  return { text: kept.map((s) => s.text).join(' '), sentences: kept };
}
const FORBIDDEN = ['대회', '수상', '입상', '경시', '올림피아드', '공모전', '자격증', '토익', 'TOEIC', '토플', 'TOEFL', '텝스', '어학시험', '학원', '과외', '사교육', '부모', '어머니', '아버지', '교외', '봉사 시간', '논문', '특허', '대학교', '의대'];
function splitSents(text) { return String(text).split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean); }
/** 점검 6가지 */
function checkDraft(text, ctx) {
  const out = [];
  const bytes = neisBytes(text); const limit = S.settings.length.limit;
  out.push({ key: 'bytes', label: '바이트 한도', ok: bytes <= limit, detail: `${bytes.toLocaleString()} / ${limit.toLocaleString()}B` });
  const sents = splitSents(text);
  const bad = sents.filter((s) => { const t = s.replace(/[.\s]+$/, ''); return t && jong(t.slice(-1)) !== 16; });
  out.push({ key: 'nominal', label: '명사형 종결', ok: !bad.length, detail: bad.length ? `${bad.length}문장 확인` : '모든 문장', bad });
  const hit = FORBIDDEN.filter((w) => text.includes(w));
  out.push({ key: 'forbidden', label: '기재 금지어', ok: !hit.length, detail: hit.length ? hit.slice(0, 4).join(', ') : '없음' });
  const name = ctx.name && ctx.name.length >= 2 ? text.includes(ctx.name) : false;
  out.push({ key: 'name', label: '학생 이름', ok: !name, detail: name ? '이름이 들어감' : '없음' });
  const evText = (ctx.records || []).map((r) => r.note).filter(Boolean);
  const weak = sents.filter((s) => !evText.some((e) => jaccard(s, e) >= 0.18));
  out.push({ key: 'evidence', label: '근거 연결', ok: !weak.length, detail: weak.length ? `${weak.length}문장이 기록과 연결 약함` : `${sents.length}문장 연결`, bad: weak });
  const sim = sents.filter((s) => (ctx.others || []).some((o) => splitSents(o).some((x) => jaccard(s, x, 3) > 0.6)));
  out.push({ key: 'similar', label: '다른 학생과 비슷한 문장', ok: !sim.length, detail: sim.length ? `${sim.length}문장` : '없음', bad: sim });
  return out;
}
/** 다른 AI 에 붙여 쓸 요청문 (이름 없이) */
function promptFor(recs) {
  const s = S.settings; const limit = s.length.limit;
  const lines = [
    `너는 교사의 학교생활기록부(${s.subject || '교과'} 세부능력 및 특기사항) 작성을 돕는 보조자다.`,
    '규칙:',
    '- 아래 관찰 기록에 있는 사실만 쓴다. 기록에 없는 행동·역량·진로·감정은 만들지 않는다.',
    '- 모든 문장은 명사형(~함, ~임)으로 끝내고, 학생 이름·주어를 쓰지 않는다.',
    '- 대회·수상·자격증·어학시험·사교육·부모·교외 활동은 쓰지 않는다.',
    `- 나이스 바이트 ${limit}B 이하(한글 3B, 영문·숫자·공백 1B), 목표 ${Math.round(limit * s.length.target[0])}~${limit}B.`,
    s.teacherGuide ? `- 교사 지침: ${s.teacherGuide}` : null,
    '',
    '[관찰 기록] (날짜 | 분류 | 성취기준 | 내용)',
    ...recs.map((r) => `- ${recDay(r)} | ${s.categories[r.cat]} | ${(r.std || []).map((c) => `${c} ${S.standards[c] || ''}`.trim()).join(', ') || '-'} | ${cleanNote(r.note) || '(내용 없음)'}`),
  ].filter((x) => x !== null);
  return lines.join('\n');
}
