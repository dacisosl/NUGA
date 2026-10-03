#!/usr/bin/env node
/**
 * core.js · engine.js 규칙 점검 (브라우저·추가 패키지 없이).
 *   node tools/test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const src = ['core.js', 'engine.js'].map((f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
const store = new Map();
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, URL, Blob, Date, Math, JSON, Promise,
  document: { querySelector: () => null, createElement: () => ({}), createElementNS: () => ({ setAttribute() {}, appendChild() {} }) },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  navigator: {}, Node: function Node() {},
});
vm.runInContext(`${src}\n;globalThis.__get = (n) => eval(n); globalThis.__set = (v) => { S = v; };`, ctx);
const g = (name) => ctx.__get(name);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// 1. 나이스 바이트
eq(g('neisBytes')('가나 a'), 8, '바이트(한글 3, 공백 1, 영문 1)');
eq(g('neisBytes')('가\n나'), 8, '줄바꿈 2바이트');

// 2. 조사
eq(g('josa')('이온 결합', '을/를'), '이온 결합을', '을/를 받침');
eq(g('josa')('지시약', '과/와'), '지시약과', '과/와 받침');
eq(g('josa')('pH', '과/와'), 'pH와', '과/와 영문');

// 3. 데모 상태 (매번 같음)
const demo1 = g('buildDemoState')(); const demo2 = g('buildDemoState')();
eq(demo1.records.length, demo2.records.length, '데모 기록 수 재현');
ok(demo1.records.length > 150, `데모 기록 수 충분 (${demo1.records.length})`);
ok(demo1.classes.every((c) => c.students.length === 25 && c.students.every((s) => !s.name)), '데모: 반 2개 25명, 번호만');
ok(!demo1.records.some((r) => /를 그림|를 다시|를 지난/.test(r.note) && /결합를|반응를|평형를/.test(r.note)), '데모 메모 조사');
ctx.__set(demo1);
const cnt = (no) => demo1.records.filter((r) => r.class === '2-3' && r.no === no).length;
ok(cnt(7) + cnt(14) + cnt(21) <= 6 && cnt(12) > cnt(9), `기록 편중 재현 (7·14·21: ${cnt(7)}·${cnt(14)}·${cnt(21)}, 12: ${cnt(12)}, 9: ${cnt(9)})`);

// 4. 쉬는 날·수업
const skip = g('skipReason');
eq(skip('2026-10-03'), '개천절', '개천절(토)은 주말보다 공휴일');
eq(skip('2026-10-09'), '한글날', '한글날');
eq(skip('2026-10-13'), null, '평일');
eq(g('lessonsOn')('2026-10-09').length, 0, '공휴일엔 시간표 수업 없음');
eq(g('lessonsOn')('2026-10-13').map((l) => l.key), ['2026-10-13_2-3_2'], '10/13 수업');
const pt = g('periodTimes')();
eq([g('fromMin')(pt[1].start), g('fromMin')(pt[4].start)], ['09:50', '13:40'], '교시 시각(점심 4교시 뒤)');

// 5. 발언 후보 (−60초 ~ +15초, 카테고리 맞춤)
const tr = g('demoTranscript')(); demo1.transcripts['2026-10-13_2-3_2'] = tr;
const lesson = g('lessonByKey')('2026-10-13_2-3_2');
eq(g('teacherSpeaker')(tr), '화자1', '교사 화자 = 발화량 최대');
const rec5 = demo1.records.find((r) => r.lessonKey === '2026-10-13_2-3_2' && r.no === 5);
const c5 = g('candidatesFor')(rec5, tr, lesson);
eq(c5[0]?.seg.speaker, '화자6', '5번 질문 → 10:11:45 화자6 의문형');
const rec18 = demo1.records.find((r) => r.lessonKey === '2026-10-13_2-3_2' && r.no === 18);
eq(g('candidatesFor')(rec18, tr, lesson)[0]?.seg.text.includes('역할'), true, '18번 협동 → 역할 발언');
ok(g('candidatesFor')({ ...rec5, time: new Date(rec5.time).getTime() + 30 * 60e3 }, tr, lesson).every((c) => c.seg.speaker !== '화자1'), '교사 발언은 후보 아님');

// 6. 놓친 발언 추천
const sg = g('buildSuggestions')('2026-10-13_2-3_2');
ok(sg.length >= 5 && sg.length <= 10, `추천 5~10개 (${sg.length})`);
ok(sg.every((x) => x.speaker !== '화자1'), '추천에 교사 없음');
ok(!sg.some((x) => /화장실/.test(x.text)), '잡담 제외');
ok(sg.some((x) => x.criteria === '깊이 있는 질문' && x.text.includes('촉매')), '촉매 질문 추천');
ok(sg.some((x) => x.criteria === '오개념 수정·자기 성찰'), '자기 성찰 추천');

// 7. 문장 변환
eq(g('toStudentSentence')('그래프로 그려 경향을 찾음'), '그래프로 그려 경향을 찾아낸 점이 좋았어요.', '찾음 → 찾아낸');
eq(g('toStudentSentence')('모둠원에게 다시 설명해 도움'), '모둠원에게 다시 설명해 도운 점이 좋았어요.', '도움 → 도운');
eq(g('toStudentSentence')('근거를 들어 발표함'), '근거를 들어 발표한 점이 좋았어요.', '함 → 한');
eq(g('toRecordSentence')('양이 같은지 질문'), '양이 같은지 질문함.', '동작 명사 → 함');
eq(g('toRecordSentence')('역할을 맡음'), '역할을 맡음.', 'ㅁ 받침 그대로');

// 8. 세특 정리·점검
const recs = demo1.records.filter((r) => r.class === '2-3' && r.no === 12 && r.note);
const d = g('draftFromRecords')(recs, 600);
ok(g('neisBytes')(d.text) <= 600, `바이트 한도 (${g('neisBytes')(d.text)})`);
ok(d.sentences.every((s) => s.evidence.length >= 1), '문장마다 근거');
ok(new Set(d.sentences.map((s) => s.text)).size === d.sentences.length, '같은 문장 합침');
const checks = g('checkDraft')(d.text, { name: '', records: recs, others: [] });
eq(checks.map((c) => c.ok), [true, true, true, true, true, true], `점검 6가지 통과 ${JSON.stringify(checks.filter((c) => !c.ok))}`);
const bad = g('checkDraft')('서울대 진학을 위해 학원에서 열심히 했다. 김민준은 성실함.', { name: '김민준', records: recs, others: [] });
eq(bad.filter((c) => !c.ok).map((c) => c.key).sort(), ['evidence', 'forbidden', 'name', 'nominal'].sort(), '점검: 금지어·이름·명사형·근거');

// 9. 피드백 카드
const fb = g('feedbackFor')('2-3', 12, { id: 'term', from: '2026-09-01', to: '2026-10-13' });
ok(!fb.none && fb.records.length === 2 && fb.records[0].cat !== fb.records[1].cat, '피드백: 카테고리 다른 2건');
ok(/좋았어요/.test(fb.good) && fb.next, '피드백 문장');
ok(g('feedbackFor')('2-3', 7, { id: 'w', from: '2026-10-12', to: '2026-10-13' }).none, '근거 없으면 빈 칭찬 대신 none');

// 10. 암호화 (전달함)
const key = g('newKey')();
const ch = await g('channelOf')(key);
ok(/^[0-9a-f]{32}$/.test(ch), '채널 = SHA-256 앞 16바이트 hex');
const msg = await g('seal')(key, { id: 'r1', class: '2-3', no: 5 });
ok(/^[\w-]+\.[\w-]+$/.test(msg) && !msg.includes('2-3'), "봉한 메시지 'iv.암호문'");
eq((await g('unseal')(key, msg)).no, 5, '풀기');

console.log(`${pass} passed, ${fail} failed`);
console.log(fail ? 'FAIL' : 'ALL PASS');
process.exit(fail ? 1 : 0);
