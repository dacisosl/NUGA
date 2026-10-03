'use strict';
/* ui2.js — 정리 · 반 · 피드백 · 세특 · 설정 · 처음 설정 · 학생 화면 · 기기 연결 · 시작 */

function classTabs(onPick) {
  if (!UI.classSel || !classOf(UI.classSel)) UI.classSel = UI.cls && classOf(UI.cls) ? UI.cls : classIds()[0] || null;
  return h('div', { class: 'seg', role: 'tablist' }, classIds().map((id) => h('button', { class: UI.classSel === id ? 'on' : '', onclick: () => { UI.classSel = id; onPick && onPick(id); render(); } }, `${id}반`)));
}
function copyText(text, msg = '복사했어요') {
  const done = () => toast(msg);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); else fallbackCopy(text, done);
}
function fallbackCopy(text, done) { const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text); document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch { toast('복사하지 못했어요'); } t.remove(); }
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- 정리 ---------- */
function viewReview() {
  const day = ymd(now());
  const queue = reviewQueue();
  const proc = Object.entries(S.lessons).filter(([, st]) => st.processing || st.aiPending).map(([k, st]) => ({ l: lessonByKey(k), st })).filter((x) => x.l);
  const queueKeys = new Set(queue.map((l) => l.key));
  const pending = S.records.filter((r) => r.status === 'pending' && !queueKeys.has(r.lessonKey) && !(currentLesson()?.key === r.lessonKey)).sort((a, b) => b.time.localeCompare(a.time));
  const inbox = new Map(); for (const k of new Set(S.suggestions.map((x) => x.lessonKey))) { const list = suggestionsFor(k); if (list.length) inbox.set(k, list); }
  return h('div', { class: 'page' },
    h('div', { class: 'page-h' }, h('h1', null, '정리')),
    h('div', { class: 'card' }, h('h2', null, `정리 대기 수업 ${queue.length}`),
      queue.length ? h('div', { class: 'col' }, queue.map((l) => h('div', { class: 'row wrap' },
        h('b', null, `${l.date === day ? '' : koDate(l.date) + ' '}${perLabel(l.period)} ${l.class}반`),
        h('span', { class: 'small muted' }, `기록 ${S.records.filter((r) => r.lessonKey === l.key && r.status === 'pending').length} · 추천 ${suggestionsFor(l.key).length}`),
        h('span', { class: 'grow' }), h('button', { class: 'btn primary sm', onclick: () => Popup.show(l.key) }, '지금 정리'))))
        : h('div', { class: 'muted small' }, '정리할 수업이 없어요. 수업이 끝나고 자리에 돌아오면 정리 창이 저절로 열려요.')),
    proc.length ? h('div', { class: 'card' }, h('h2', null, '녹음 정리'), h('div', { class: 'col' }, proc.map(({ l, st }) => h('div', { class: 'row wrap' },
      h('b', null, `${koDate(l.date)} ${perLabel(l.period)} ${l.class}반`), h('span', { class: 'small muted' }, st.processing ? '정리 중…' : '대기 · 서버 연결 시 2분마다 다시 시도'),
      h('span', { class: 'grow' }), st.aiPending && !st.processing ? h('button', { class: 'btn sm', onclick: () => { st.retryAt = 0; processAudio(l.key); } }, '다시 시도') : null)))) : null,
    h('div', { class: 'card' }, h('h2', null, `보완 대기 기록 ${pending.length}`),
      pending.length ? h('div', { class: 'col' }, pending.slice(0, 30).map((r) => {
        const inp = h('input', { type: 'text', placeholder: '한 줄 보완', 'aria-label': '보완' });
        return h('div', { class: 'row wrap' }, h('span', { class: 'small num muted' }, `${koDate(recDay(r))} ${hm(r.time)}`), h('b', null, `${r.class} ${studentLabel(r.class, r.no)}`), h('span', { class: `chip c${r.cat}` }, S.settings.categories[r.cat]),
          h('div', { class: 'grow', style: { minWidth: '200px' } }, inp),
          h('button', { class: 'btn sm primary', onclick: () => { r.note = inp.value.trim(); r.status = 'confirmed'; save(); render(); } }, '저장'),
          h('button', { class: 'btn sm ghost', onclick: () => { r.status = 'skipped'; save(); render(); } }, '건너뛰기'));
      })) : h('div', { class: 'muted small' }, '없어요.')),
    h('div', { class: 'card' }, h('h2', null, '추천함'), h('div', { class: 'muted small' }, '확인하지 않은 놓친 발언이에요. 정리 창에서 누구였는지 번호를 고르거나 지울 수 있어요.'),
      inbox.size ? h('div', { class: 'col mt8' }, [...inbox].map(([key, list]) => { const l = lessonByKey(key); return l ? h('div', { class: 'row wrap' },
        h('b', null, `${koDate(l.date)} ${perLabel(l.period)} ${l.class}반`), h('span', { class: 'small muted' }, `${list.length}개 · ${list.slice(0, 2).map((g) => `“${g.text.slice(0, 24)}…”`).join(' ')}`),
        h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => Popup.show(key) }, '정리 창 열기')) : null; })) : h('div', { class: 'muted small mt8' }, '비어 있어요.')));
}

/* ---------- 반 ---------- */
function viewClass() {
  const tabs = classTabs(); const cls = UI.classSel; const c = classOf(cls);
  if (!c) return h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h1', null, '반')), h('div', { class: 'card empty' }, '반이 없어요. 설정에서 넣어 주세요.'));
  const watch = watchListFor(cls);
  const recs = S.records.filter((r) => r.class === cls && r.status !== 'skipped');
  const low = c.students.filter((s) => recs.filter((r) => r.no === s.no).length <= 1).length;
  return h('div', { class: 'page' },
    h('div', { class: 'page-h' }, h('h1', null, '반'), tabs),
    h('div', { class: 'card' },
      h('div', { class: 'row wrap between' }, h('h2', null, `${cls}반 기록 편중`), h('span', { class: 'small muted' }, `기록 ${recs.length}건 · 1건 이하 ${low}명 (주황 테두리)`)),
      h('div', { class: 'row wrap small muted mt8' }, S.settings.categories.map((n, i) => h('span', { class: 'row gap4' }, h('span', { class: `dot c${i}` }), n))),
      h('div', { class: 'class-grid mt12' }, c.students.map((s) => {
        const mine = recs.filter((r) => r.no === s.no);
        return h('button', { class: `stu ${mine.length <= 1 ? 'low' : ''}`, onclick: () => openSheet(() => studentSheet(cls, s.no)) },
          h('span', { class: 'n' }, studentLabel(cls, s.no), watch.includes(s.no) ? ' ★' : ''),
          h('span', { class: 'dots' }, mine.slice(-16).map((r) => h('span', { class: `dot c${r.cat}` }))),
          h('span', { class: 'c' }, `${mine.length}건`));
      }))));
}
function studentSheet(cls, no) {
  const recs = S.records.filter((r) => r.class === cls && r.no === no && r.status !== 'skipped').sort((a, b) => b.time.localeCompare(a.time));
  const ex = S.watchExtra[cls] || []; const on = ex.includes(no);
  return sheet(`${cls}반 ${studentLabel(cls, no)}`, h('div', { class: 'col' },
    h('div', { class: 'row' }, h('span', { class: 'small muted grow' }, `기록 ${recs.length}건`),
      h('button', { class: `btn sm ${on ? '' : 'primary'}`, onclick: () => { S.watchExtra[cls] = on ? ex.filter((x) => x !== no) : [...ex, no]; save(); closeSheet(); toast(on ? '눈여겨볼 학생에서 뺐어요' : '수업 화면의 눈여겨볼 학생에 올렸어요'); } }, on ? '눈여겨볼 학생 해제' : '눈여겨볼 학생 지정')),
    recs.length ? h('div', { class: 'rec-list' }, recs.map((r) => h('div', { class: 'rec-item' }, h('span', { class: 't' }, koDate(recDay(r))), h('span', { class: `chip c${r.cat}` }, S.settings.categories[r.cat]), h('span', { class: 'note-t', style: { whiteSpace: 'normal' } }, r.note || '(내용 없음)')))) : h('div', { class: 'empty' }, '기록이 없어요. 다음 수업 관찰 대상에 올려 보세요.')));
}

/* ---------- 피드백 ---------- */
function viewFeedback() {
  const tabs = classTabs(() => { UI.fbRange = null; }); const cls = UI.classSel;
  if (!classOf(cls)) return h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h1', null, '피드백')), h('div', { class: 'card empty' }, '반이 없어요.'));
  const ranges = periodRanges(cls); const range = ranges.find((r) => r.id === UI.fbRange) || ranges[0]; UI.fbRange = range.id;
  const cards = classOf(cls).students.map((s) => feedbackFor(cls, s.no, range));
  const ok = cards.filter((c) => !c.none);
  const sent = ok.filter((c) => S.feedbackSent[`${cls}_${c.no}_${range.id}`]).length;
  const mx = stdMatrix(cls, range);
  const slips = () => {
    for (const c of ok) S.feedbackSent[`${cls}_${c.no}_${range.id}`] = { at: now().toISOString(), period: range.label };
    save(); printSlips(cls, ok, range);
  };
  return h('div', { class: 'page' },
    h('div', { class: 'page-h' }, h('h1', null, '피드백'), tabs),
    h('div', { class: 'card no-print' },
      h('div', { class: 'row wrap' }, h('div', { class: 'seg' }, ranges.map((r) => h('button', { class: r.id === range.id ? 'on' : '', onclick: () => { UI.fbRange = r.id; render(); } }, r.label))), h('span', { class: 'grow' }),
        h('span', { class: 'small muted' }, `카드 ${ok.length}명 · 근거 없음 ${cards.length - ok.length}명${sent ? ` · 쪽지 ${sent}명` : ''}`)),
      h('div', { class: 'row wrap mt12' },
        h('button', { class: 'btn', onclick: () => copyText(ok.map((c) => `[${studentLabel(cls, c.no)}] ${feedbackText(c)}`).join('\n\n'), `${ok.length}명 카드를 복사했어요`) }, icon('copy'), '전체 복사'),
        h('button', { class: 'btn', onclick: () => download(`누가_피드백_${cls}_${ymd(now())}.csv`, '﻿' + ['번호,잘한 장면,다음 도전,근거', ...ok.map((c) => [c.no, c.good, c.next, c.evidence.join(' / ')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv') }, 'CSV'),
        h('button', { class: 'btn primary', onclick: slips, disabled: !ok.length }, `학생용 QR 쪽지 ${ok.length}명`)),
      h('div', { class: 'xs muted mt8' }, '학생은 쪽지의 QR을 찍어 자기 카드를 봐요. 카드 내용은 QR 안에만 있고 서버에 저장되지 않아요. 반·번호·이름은 QR에 넣지 않아요.')),
    h('div', { class: 'fb-grid' }, cards.map((c) => c.none
      ? h('div', { class: 'fb none' }, h('div', { class: 'who' }, studentLabel(cls, c.no)), h('div', { class: 'small muted' }, '이 기간 근거 기록이 없어요.'),
        h('button', { class: 'btn sm no-print', onclick: () => { const ex = S.watchExtra[cls] || []; if (!ex.includes(c.no)) S.watchExtra[cls] = [...ex, c.no]; save(); toast('다음 수업 관찰 대상에 올렸어요'); } }, '다음 수업 관찰 대상에 올리기'))
      : h('div', { class: 'fb' },
        h('div', { class: 'who' }, studentLabel(cls, c.no), S.feedbackSent[`${cls}_${c.no}_${range.id}`] ? h('span', { class: 'chip ok' }, '쪽지') : null, h('span', { class: 'grow' }),
          h('button', { class: 'btn xs ghost no-print', onclick: () => copyText(cardLink(c, range), '학생용 링크를 복사했어요 (반·번호·이름 없음)') }, '링크'),
          h('button', { class: 'btn xs ghost no-print', onclick: () => openSheet(() => fbEditSheet(cls, c, range)) }, '고치기')),
        h('div', { class: 'good' }, c.good), h('div', { class: 'next' }, h('b', null, '다음 도전 '), c.next), h('div', { class: 'ev' }, `근거: ${c.evidence.join(' · ')}`)))),
    mx.codes.length ? h('div', { class: 'card no-print' }, h('h2', null, '성취기준별 관찰 근거'), h('div', { class: 'small muted' }, '0칸은 이 기간에 그 성취기준 기록이 없는 학생이에요.'),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl matrix mt8' },
        h('thead', null, h('tr', null, h('th', null, '학생'), mx.codes.map((c) => h('th', { title: S.standards[c] || '' }, c)))),
        h('tbody', null, mx.rows.map((r) => h('tr', null, h('td', null, studentLabel(cls, r.no)), r.counts.map((n) => h('td', { class: n ? 'v' : 'z' }, n)))))))) : null);
}
function fbEditSheet(cls, c, range) {
  const g = h('textarea', { rows: 3 }, c.good); const n = h('textarea', { rows: 2 }, c.next);
  return sheet(`${studentLabel(cls, c.no)} 피드백 고치기`, h('div', { class: 'col' },
    h('label', { class: 'field' }, h('span', null, '잘한 장면'), g), h('label', { class: 'field' }, h('span', null, '다음 도전'), n),
    h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => { delete S.feedbackEdits[`${cls}_${c.no}_${range.id}`]; save(); closeSheet(); } }, '처음 문장으로'),
      h('button', { class: 'btn primary', onclick: () => { S.feedbackEdits[`${cls}_${c.no}_${range.id}`] = { good: g.value.trim(), next: n.value.trim() }; save(); closeSheet(); } }, '저장'))));
}

/* ---------- 세특 ---------- */
const draftCheck = {};
function viewDraft() {
  const tabs = classTabs(() => { UI.draft.no = null; }); const cls = UI.classSel; const c = classOf(cls);
  if (!c) return h('div', { class: 'page' }, h('div', { class: 'page-h' }, h('h1', null, '세특')), h('div', { class: 'card empty' }, '반이 없어요.'));
  if (!c.students.some((s) => s.no === UI.draft.no)) UI.draft.no = c.students[0]?.no;
  const no = UI.draft.no; const key = `${cls}_${no}`;
  const recs = S.records.filter((r) => r.class === cls && r.no === no && r.status !== 'skipped' && cleanNote(r.note)).sort((a, b) => a.time.localeCompare(b.time));
  if (!draftCheck[key]) draftCheck[key] = new Set(recs.map((r) => r.id));
  const checked = draftCheck[key];
  const groups = new Map(); for (const r of recs) { const k = (r.std && r.std[0]) || '성취기준 없음'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const d = S.drafts[key] || { text: '', sentences: [] };
  const ta = h('textarea', { rows: 10, 'aria-label': '세특 초안', placeholder: '[초안 정리]를 누르면 체크한 기록으로 문장을 만들어요. 직접 고쳐 쓰세요.', oninput: () => { S.drafts[key] = { ...(S.drafts[key] || {}), text: ta.value, sentences: (S.drafts[key] || {}).sentences || [] }; save(); updateMeta(); } }, d.text);
  const meta = h('div', { class: 'col' });
  const others = Object.entries(S.drafts).filter(([k, v]) => k.startsWith(cls + '_') && k !== key && v.text).map(([, v]) => v.text);
  const name = c.students.find((s) => s.no === no)?.name || '';
  function updateMeta() {
    const text = ta.value; const b = neisBytes(text); const lim = S.settings.length.limit;
    const checks = checkDraft(text, { name, records: recs.filter((r) => checked.has(r.id)), others });
    const sents = (S.drafts[key] || {}).sentences || [];
    meta.replaceChildren(
      h('div', { class: `bytes ${b > lim ? 'over' : ''}` }, `${b.toLocaleString()} / ${lim.toLocaleString()} B`, h('span', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (b / lim) * 100)}%`, background: b > lim ? 'var(--warn)' : b >= lim * S.settings.length.target[0] ? 'var(--ok)' : 'var(--accent)' } })), `약 ${[...text].length}자 · 목표 ${Math.round(lim * S.settings.length.target[0]).toLocaleString()}~${lim.toLocaleString()}B`),
      text.trim() ? h('div', { class: 'checks' }, h('h3', null, '점검 6가지'), h('ul', null, checks.map((x) => h('li', null, h('span', { class: x.ok ? 'ok' : 'bad' }, x.ok ? '✓' : '!'), h('span', null, x.label), h('span', { class: 'muted small' }, x.detail))))) : null,
      sents.length && text.trim() ? h('div', null, h('h3', { class: 'small muted' }, '문장별 근거'), sents.map((s) => h('div', { class: 'sent' }, h('span', { class: 'grow' }, s.text), h('span', { class: 'ev' }, s.evidence.map((id) => { const r = recs.find((x) => x.id === id); return r ? `${koDate(recDay(r))} ${S.settings.categories[r.cat]}` : ''; }).filter(Boolean).join(', '))))) : null);
  }
  updateMeta();
  const organize = async () => {
    const use = recs.filter((r) => checked.has(r.id));
    if (!use.length) { toast('체크한 기록이 없어요'); return; }
    let out = null;
    if (aiOn()) {
      try {
        // 반·번호·이름은 보내지 않는다. 기록 내용만 (메모 속 이름도 지움)
        const r = await api('/ai/draft', { body: { records: use.map((x) => ({ id: x.id, text: scrubNames(x.note), cat: x.cat, std: x.std, date: recDay(x) })), standards: S.standards, limit: S.settings.length.limit, level: S.settings.level, guide: S.settings.teacherGuide, subject: S.settings.subject } });
        if (r.sentences && r.sentences.length) out = { text: r.sentences.map((s) => s.text).join(' '), sentences: r.sentences };
      } catch (e) { toast(`${e.message} — 규칙으로 정리했어요`); }
    }
    if (!out) out = draftFromRecords(use);
    S.drafts[key] = { text: out.text, sentences: out.sentences, savedAt: now().toISOString() }; save();
    ta.value = out.text; updateMeta(); toast(`문장 ${out.sentences.length}개로 정리했어요${aiOn() ? '' : ' (규칙)'}`);
  };
  return h('div', { class: 'page' },
    h('div', { class: 'page-h' }, h('h1', null, '세특'), tabs,
      h('select', { 'aria-label': '학생', onchange: (e) => { UI.draft.no = Number(e.target.value); render(); } }, c.students.map((s) => h('option', { value: s.no, selected: s.no === no }, `${studentLabel(cls, s.no)} · ${S.records.filter((r) => r.class === cls && r.no === s.no && r.status !== 'skipped').length}건`)))),
    h('div', { class: 'draft-wrap' },
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, '근거 기록'), h('span', { class: 'small muted' }, `${checked.size}/${recs.length} 사용`)),
        recs.length ? [...groups].map(([code, list]) => h('div', { class: 'ev-group' }, h('h3', { title: S.standards[code] || '' }, `${code}${S.standards[code] ? ' ' + S.standards[code].slice(0, 30) : ''}`),
          list.map((r) => h('label', { class: 'ev-item' }, h('input', { type: 'checkbox', checked: checked.has(r.id), onchange: (e) => { e.target.checked ? checked.add(r.id) : checked.delete(r.id); updateMeta(); } }),
            h('span', null, h('span', { class: 'xs muted' }, `${koDate(recDay(r))} ${S.settings.categories[r.cat]} `), r.note)))))
          : h('div', { class: 'empty' }, '내용이 있는 기록이 없어요.')),
      h('div', { class: 'card col' },
        h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, `${cls}반 ${studentLabel(cls, no)}`),
          h('button', { class: 'btn primary', onclick: organize }, '초안 정리'),
          h('button', { class: 'btn', onclick: () => copyText(promptFor(recs.filter((r) => checked.has(r.id))), '프롬프트를 복사했어요 (이름 없음)') }, '프롬프트 복사'),
          h('button', { class: 'btn', onclick: () => copyText(ta.value, '세특을 복사했어요. 나이스에 붙여 넣으세요.') }, '복사')),
        ta, meta,
        h('div', { class: 'xs muted' }, '체크한 기록만 근거로 씁니다. 최종 작성과 나이스 입력은 선생님이 합니다.'))));
}

/* ---------- 설정 ---------- */
function section(title, ...kids) { return h('div', { class: 'card' }, h('h2', null, title), h('div', { class: 'col mt8' }, kids)); }
function viewSettings() {
  const s = S.settings;
  const set = (fn) => { fn(); save(); render(); };
  return h('div', { class: 'page' },
    h('div', { class: 'page-h' }, h('h1', null, '설정')),
    settingsAccount(),
    section('학교급 · 과목 · 기록 방식',
      S.school ? h('div', { class: 'small' }, `학교: ${S.school.name}${S.school.source === 'whalespace' ? ' (웨일 스페이스)' : S.school.source === 'neis' ? ' (나이스)' : ''}`) : null,
      h('div', { class: 'seg' }, [['elem', '초등학교'], ['middle', '중학교'], ['high', '고등학교']].map(([k, l]) => h('button', { class: s.level === k ? 'on' : '', onclick: () => set(() => { s.level = k; s.categories = CATS[k].slice(); }) }, l))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, '과목'), h('input', { value: s.subject, onchange: (e) => set(() => { s.subject = e.target.value.trim(); }) })),
        h('label', { class: 'field' }, h('span', null, '카테고리 4개 (쉼표)'), h('input', { value: s.categories.join(', '), onchange: (e) => set(() => { const v = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); if (v.length === 4) s.categories = v; else toast('카테고리는 4개예요'); }) }))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.numberOnly, onchange: (e) => set(() => { s.numberOnly = e.target.checked; }) }), h('span', null, '번호만 보기 (화면에 이름을 띄우지 않음)')),
      h('label', { class: 'field' }, h('span', null, '교사 지침 (세특 정리·프롬프트에 들어감)'), h('textarea', { rows: 2, onchange: (e) => { s.teacherGuide = e.target.value; save(); } }, s.teacherGuide)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, '세특 바이트 한도'), h('input', { type: 'number', value: s.length.limit, onchange: (e) => set(() => { s.length.limit = Math.max(300, Number(e.target.value) || 1500); }) })),
        h('label', { class: 'field' }, h('span', null, '화면'), h('select', { onchange: (e) => set(() => { s.theme = e.target.value; }) }, [['auto', '시스템 따라'], ['light', '밝게'], ['dark', '어둡게']].map(([k, l]) => h('option', { value: k, selected: s.theme === k }, l)))))),
    settingsClasses(),
    settingsTimetable(),
    settingsProgress(),
    settingsRecording(),
    section('자리 정리 팝업',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.popup.enabled, onchange: (e) => set(() => { s.popup.enabled = e.target.checked; }) }), h('span', null, '수업이 끝나고 자리에 돌아오면 정리 창 열기')),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', null, '놓친 발언 처음 보여 줄 개수'), h('input', { type: 'number', min: 1, max: 10, value: s.popup.maxSuggestions, onchange: (e) => set(() => { s.popup.maxSuggestions = clamp(Number(e.target.value) || 3, 1, 10); }) })),
        h('label', { class: 'field' }, h('span', null, '다음 수업까지 최소 여유(분)'), h('input', { type: 'number', min: 0, max: 20, value: s.popup.quietMin, onchange: (e) => set(() => { s.popup.quietMin = clamp(Number(e.target.value) || 0, 0, 20); }) }))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: async () => { if (await Presence.startIdle()) set(() => { s.popup.presence = true; toast('화면 잠금 해제도 자리 신호로 써요'); }); } }, s.popup.presence ? '자리 감지 켜짐' : '자리 감지 켜기'),
        h('button', { class: 'btn sm', onclick: async () => { if (!('Notification' in window)) return toast('알림을 지원하지 않아요'); const p = await Notification.requestPermission(); set(() => { s.popup.notify = p === 'granted'; }); } }, s.popup.notify ? '알림 허용됨' : '창이 숨어 있으면 알림 보내기')),
      h('div', { class: 'xs muted' }, '키보드·마우스 입력, 화면 다시 보임, 창 포커스(선택: 화면 잠금 해제)만 봐요. 카메라나 화면 내용은 쓰지 않아요.')),
    settingsDevices(),
    settingsServer(),
    section('백업',
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => { const copy = JSON.parse(JSON.stringify(S)); copy.settings.ai.key = ''; copy.sync.key = null; copy.account = { provider: 'none' }; download(`누가_백업_${ymd(now())}.json`, JSON.stringify(copy, null, 1), 'application/json'); } }, '백업 내려받기'),
        h('label', { class: 'btn' }, '백업 불러오기', h('input', { type: 'file', accept: '.json,application/json', class: 'sr', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (j.v !== 1 || !Array.isArray(j.records)) throw new Error('누가 백업이 아니에요'); j.mode = S.mode; S = { ...defaultState(S.mode), ...j, sync: S.sync, account: S.account }; saveNow(); render(); toast('불러왔어요'); } catch (err) { toast(err.message); } } }))),
      h('div', { class: 'xs muted' }, '백업 파일에는 AI 키·기기 연결 열쇠·로그인 정보를 넣지 않아요. 학생 이름이 들어 있으니 안전한 곳에 두세요.')),
    section('데모',
      h('div', { class: 'row wrap' }, S.mode === 'demo'
        ? h('button', { class: 'btn', onclick: endDemo }, '데모 끝내기')
        : h('button', { class: 'btn', onclick: startDemo }, '데모로 써 보기'),
        h('button', { class: 'btn warn', onclick: () => { if (confirm(`${S.mode === 'demo' ? '데모' : '실제 사용'} 데이터를 모두 지울까요?`)) { lsDel(stateKey(S.mode)); S = defaultState(S.mode); saveNow(); render(); } } }, '이 모드 데이터 지우기')),
      h('div', { class: 'xs muted' }, '데모는 번호만 쓰는 합성 데이터이고, 실제 사용 데이터와 따로 저장돼요.')));
}

function settingsAccount() {
  const a = S.account;
  const logged = a.provider && a.provider !== 'none';
  return section('웨일 스페이스',
    logged ? h('div', { class: 'row wrap' }, h('span', { class: 'chip ok' }, a.provider === 'whalespace-demo' ? '데모 로그인' : '로그인됨'), h('span', { class: 'small' }, S.school?.name || ''), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => { S.account = { provider: 'none' }; save(); render(); } }, '로그아웃'))
      : h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: () => whaleLogin('teacher') }, '웨일 스페이스로 로그인'), h('span', { class: 'small muted' }, '교사 계정으로 학교가 저절로 잡히고, 서버 AI를 쓸 수 있어요.')),
    h('div', { class: 'xs muted' }, '교사만 로그인해요. 학생 계정·반·번호·이름은 서버로 받지 않아요. App Console 연동 승인 전에는 데모 로그인으로 흐름을 볼 수 있어요.'));
}
function whaleLogin(role) {
  if (!serverUrl()) {
    openSheet(() => sheet('웨일 스페이스 로그인', h('div', { class: 'col' },
      h('div', { class: 'small' }, '로그인은 누가 서버를 거쳐 웨일 스페이스 계정으로 합니다. 아직 서버가 연결되지 않았어요(연동 승인 전).'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: closeSheet }, '닫기'),
        h('button', { class: 'btn primary', onclick: () => { closeSheet(); demoLogin(role); } }, '데모 로그인으로 흐름 보기')))));
    return;
  }
  const ret = location.href.split('#')[0];
  location.href = `${serverUrl()}/auth/whalespace?return=${encodeURIComponent(ret)}`;
}
function demoLogin() {
  S.account = { provider: 'whalespace-demo', userType: 'tea', sid: 'demo' };
  if (!S.school) S.school = { name: '해밀고등학교', code: 'DEMO', office: '', kind: 'high', source: 'demo' };
  save(); render(); toast('데모 로그인: 실제 계정 정보는 쓰지 않아요');
}

function settingsClasses() {
  const add = h('input', { placeholder: '반 이름 (예: 2-3)' });
  return section('반 · 명단',
    S.classes.length ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '반'), h('th', null, '학생'), h('th', null, ''))),
      h('tbody', null, S.classes.map((c) => h('tr', null, h('td', null, h('b', null, c.id)), h('td', { class: 'small' }, `${c.students.length}명 · ${c.students.slice(0, 5).map((s) => studentLabel(c.id, s.no)).join(', ')}${c.students.length > 5 ? ' …' : ''}`),
        h('td', null, h('div', { class: 'row gap4' }, h('button', { class: 'btn xs', onclick: () => openSheet(() => rosterSheet(c.id)) }, '명단'), h('button', { class: 'btn xs ghost warn', onclick: () => { if (confirm(`${c.id}반을 지울까요? 기록은 남아요.`)) { S.classes = S.classes.filter((x) => x.id !== c.id); save(); render(); } } }, '삭제'))))))) : h('div', { class: 'small muted' }, '반이 없어요.'),
    h('div', { class: 'row' }, add, h('button', { class: 'btn', onclick: () => { const id = add.value.trim(); if (!id) return; if (classOf(id)) return toast('이미 있는 반이에요'); S.classes.push({ id, students: [] }); save(); openSheet(() => rosterSheet(id)); } }, '반 추가')));
}
function parseRoster(text, start = 1) {
  const out = []; let next = start;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    const m = t.match(/^(\d{1,5})[\s.,)\t-]+(.*)$/);
    let no, name;
    if (m) { no = Number(m[1].length >= 4 ? m[1].slice(-2) : m[1]); name = m[2].trim(); }
    else if (/^\d+$/.test(t)) { no = Number(t); name = ''; }
    else { no = next; name = t; }
    next = no + 1; out.push({ no, name });
  }
  return out;
}
function rosterSheet(id) {
  const c = classOf(id);
  const ta = h('textarea', { rows: 10, placeholder: '한 줄에 한 명: "3 홍길동" 또는 이름만 (번호는 차례로)\n번호만 쓰려면 인원 수만 넣어도 돼요' }, c.students.map((s) => `${s.no} ${s.name}`.trim()).join('\n'));
  const cnt = h('input', { type: 'number', min: 1, max: 60, placeholder: '예: 25' });
  return sheet(`${id}반 명단`, h('div', { class: 'col' }, ta,
    h('div', { class: 'row' }, h('span', { class: 'small muted' }, '번호만'), h('div', { style: { width: '90px' } }, cnt), h('button', { class: 'btn sm', onclick: () => { const n = Number(cnt.value); if (n > 0) ta.value = Array.from({ length: n }, (_, i) => String(i + 1)).join('\n'); } }, '번호 채우기')),
    h('div', { class: 'xs muted' }, '학생 이름은 이 브라우저에만 저장돼요. 서버·폰으로 보내지 않아요.'),
    h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => { c.students = parseRoster(ta.value).sort((a, b) => a.no - b.no); save(); closeSheet(); toast(`${id}반 ${c.students.length}명`); } }, '저장'))), { wide: true });
}

function settingsTimetable() {
  const pt = periodTimes(); const b = S.settings.bell;
  const cell = (wd, p) => {
    const x = S.timetable.find((t) => t.weekday === wd && t.period === p);
    return h('td', null, h('select', { 'aria-label': `${WD[wd]} ${p}교시`, onchange: (e) => { S.timetable = S.timetable.filter((t) => !(t.weekday === wd && t.period === p)); if (e.target.value) S.timetable.push({ weekday: wd, period: p, class: e.target.value }); save(); } },
      h('option', { value: '' }, '—'), classIds().map((id) => h('option', { value: id, selected: x?.class === id }, id))));
  };
  const bellIn = (k, label, type = 'number') => h('label', { class: 'field' }, h('span', null, label), h('input', { type, value: b[k], onchange: (e) => { b[k] = type === 'number' ? Number(e.target.value) : e.target.value; save(); render(); } }));
  const skipIn = h('input', { type: 'date' }); const skipWhy = h('input', { placeholder: '이유 (예: 체육대회)' });
  return section('시간표 · 종 시간 · 쉬는 날',
    h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '교시'), [1, 2, 3, 4, 5].map((wd) => h('th', null, WD[wd])))),
      h('tbody', null, pt.map((p) => h('tr', null, h('td', { class: 'small' }, `${p.no}교시 ${fromMin(p.start)}`), [1, 2, 3, 4, 5].map((wd) => cell(wd, p.no))))))),
    S.school && S.school.code !== 'DEMO' ? h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: importNeis }, '나이스 시간표·학사일정 가져오기'), S.timetableDated.length ? h('span', { class: 'small muted' }, `나이스 날짜별 시간표 ${S.timetableDated.length}칸 (주간 시간표보다 먼저 씀)`) : null) : null,
    h('div', { class: 'grid3' }, bellIn('start', '1교시 시작', 'time'), bellIn('len', '수업(분)'), bellIn('brk', '쉬는 시간(분)'), bellIn('lunchAfter', '점심 (몇 교시 뒤)'), bellIn('lunchLen', '점심(분)'), bellIn('periods', '교시 수')),
    h('div', { class: 'row wrap' }, h('div', { style: { width: '170px' } }, skipIn), h('div', { class: 'grow' }, skipWhy), h('button', { class: 'btn sm', onclick: () => { if (!skipIn.value) return; S.skipDays.push({ date: skipIn.value, reason: skipWhy.value.trim() || '쉬는 날' }); save(); render(); } }, '쉬는 날 추가')),
    S.skipDays.length ? h('div', { class: 'row wrap gap4' }, S.skipDays.map((d) => h('span', { class: 'chip out' }, `${koDate(d.date)} ${d.reason} `, h('button', { class: 'btn xs ghost', onclick: () => { S.skipDays = S.skipDays.filter((x) => x !== d); save(); render(); }, 'aria-label': '삭제' }, '×')))) : null,
    h('div', { class: 'xs muted' }, '2026년 공휴일은 들어 있어요. 쉬는 날에도 수업 화면의 [수업 시작]으로 보강 수업을 기록할 수 있어요.'));
}
async function importNeis() {
  const sc = S.school; if (!serverUrl()) return toast('누가 서버가 필요해요');
  try {
    const from = ymd(now()); const to = addDays(from, 34);
    const grades = [...new Set(classIds().map((id) => id.split('-')[0]).filter((g) => /^\d+$/.test(g)))];
    const items = [];
    for (const g of grades.length ? grades : ['']) {
      const r = await api(`/school/timetable?office=${sc.office}&code=${sc.code}&kind=${sc.kind}&from=${from}&to=${to}&grade=${g}`);
      items.push(...(r.items || []).filter((x) => classOf(x.class)));
    }
    S.timetableDated = items.map((x) => ({ date: x.date, period: x.period, class: x.class }));
    const cal = await api(`/school/calendar?office=${sc.office}&code=${sc.code}&from=${from}&to=${to}`);
    for (const d of cal.days || []) if (!S.skipDays.some((x) => x.date === d.date)) S.skipDays.push({ date: d.date, reason: d.reason });
    save(); render(); toast(`나이스 시간표 ${items.length}칸, 쉬는 날 ${(cal.days || []).length}일을 가져왔어요`);
  } catch (e) { toast(`가져오지 못했어요: ${e.message}`); }
}

function settingsProgress() {
  const std = h('textarea', { rows: 3, placeholder: '[코드] 성취기준 문장 — 한 줄에 하나' }, Object.entries(S.standards).map(([k, v]) => `${k} ${v}`).join('\n'));
  return section('진도 · 성취기준',
    S.progress.length ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '기간'), h('th', null, '단원'), h('th', null, '성취기준'), h('th', null, ''))),
      h('tbody', null, S.progress.map((p) => h('tr', null, h('td', { class: 'small' }, `${koDate(p.from)}~${koDate(p.to)}${p.class !== '*' ? ` · ${p.class}` : ''}`), h('td', null, p.unit), h('td', { class: 'small' }, p.standards.join(' ')),
        h('td', null, h('button', { class: 'btn xs ghost warn', onclick: () => { S.progress = S.progress.filter((x) => x !== p); save(); render(); } }, '삭제')))))) : h('div', { class: 'small muted' }, '진도가 없어요. 단원을 넣으면 기록에 단원·성취기준이 붙어요.'),
    h('button', { class: 'btn sm', onclick: () => openSheet(progressSheet) }, '단원 추가'),
    h('label', { class: 'field' }, h('span', null, '성취기준 (교육과정 원문)'), std),
    h('div', { class: 'row' }, h('span', { class: 'grow xs muted' }, '데모의 "[예시 …]"는 실제 교육과정 원문이 아니에요.'), h('button', { class: 'btn sm', onclick: () => { const m = {}; for (const line of std.value.split(/\r?\n/)) { const x = line.trim().match(/^(\[[^\]]+\]|\S+)\s+(.+)$/); if (x) m[x[1]] = x[2]; } S.standards = m; save(); render(); toast(`성취기준 ${Object.keys(m).length}개`); } }, '성취기준 저장')));
}
function progressSheet() {
  const from = h('input', { type: 'date', value: ymd(now()) }); const to = h('input', { type: 'date', value: addDays(ymd(now()), 14) });
  const unit = h('input', { placeholder: '단원 (예: 화학 평형)' }); const codes = h('input', { placeholder: '성취기준 코드 (쉼표)' });
  const cls = h('select', null, h('option', { value: '*' }, '모든 반'), classIds().map((id) => h('option', { value: id }, `${id}반`)));
  return sheet('단원 추가', h('div', { class: 'col' }, h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, '시작'), from), h('label', { class: 'field' }, h('span', null, '끝'), to)),
    h('label', { class: 'field' }, h('span', null, '단원'), unit), h('label', { class: 'field' }, h('span', null, '성취기준 코드'), codes), h('label', { class: 'field' }, h('span', null, '반'), cls),
    h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => { if (!unit.value.trim()) return toast('단원을 넣어 주세요'); S.progress.push({ class: cls.value, from: from.value, to: to.value, unit: unit.value.trim(), standards: codes.value.split(/[,，\s]+/).filter(Boolean) }); S.progress.sort((a, b) => a.from.localeCompare(b.from)); save(); closeSheet(); } }, '추가'))));
}

function settingsRecording() {
  const r = S.settings.recording;
  const items = [['approve', '학교장 승인을 받았어요'], ['privacy', '학교 개인정보 보호책임자가 검토했어요'], ['consent', '학생·보호자에게 목적·보관 기간(음성 24시간)을 안내하고 필요한 동의를 받았어요'], ['transfer', '음성을 외부 AI로 보내 정리하는 것(처리 위탁·국외 이전)을 검토했어요']];
  const all = items.every(([k]) => r.items[k]);
  return section('수업 녹음 (기본 꺼짐)',
    h('div', { class: 'col' }, items.map(([k, label]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.items[k], onchange: (e) => { r.items[k] = e.target.checked; r.checklist = items.every(([x]) => r.items[x]); if (!r.checklist) r.enabled = false; save(); render(); } }), h('span', null, label)))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.enabled, disabled: !all, onchange: (e) => { r.enabled = e.target.checked && all; save(); render(); if (r.enabled) toast('시간표 수업 시각에 저절로 녹음해요. 1분 전에 알려 드려요.'); } }), h('span', null, h('b', null, '시간표 수업 시각에 저절로 녹음'), all ? '' : ' — 위 4가지를 모두 확인해야 켤 수 있어요')),
    h('div', { class: 'small muted' }, `음성은 이 기기에만 ${r.ttlHours}시간 보관 후 지워요. 서버는 음성을 저장하지 않아요. AI는 화자를 "화자1·화자2"로만 나누고 누구인지 추정하지 않아요.`),
    h('div', { class: 'note' }, '이 확인은 법률 자문이 아니며 학교·교육청 확인이 필요해요.'));
}

function settingsServer() {
  const url = h('input', { type: 'url', value: S.settings.server.url, placeholder: 'https://nuga-server.example.workers.dev' });
  const stat = h('span', { class: 'small muted' });
  return section('누가 서버 · AI 처리',
    h('div', { class: 'row' }, url, h('button', { class: 'btn', onclick: async () => {
      S.settings.server.url = url.value.trim().replace(/\/+$/, ''); save();
      if (!S.settings.server.url) { stat.textContent = '서버 없이 씁니다 (규칙 엔진)'; return; }
      try { const r = await api('/health', { timeout: 8000 }); const f = r.features || {}; stat.textContent = `연결됨 · AI ${f.ai ? '켜짐' : '꺼짐'} · 나이스 ${f.neis ? '켜짐' : '꺼짐'} · 웨일 스페이스 ${f.whalespace ? '켜짐' : '꺼짐'} · AI 출입 ${r.aiAccess === 'open' ? '공개(하루 한도)' : '교사 로그인'}`; }
      catch (e) { stat.textContent = `연결 실패: ${e.message}`; }
    } }, '연결 확인')), stat,
    h('div', { class: 'seg' }, [['relay', 'AI 처리 켬 (서버 경유)'], ['off', 'AI 끔 (규칙 엔진만)']].map(([k, l]) => h('button', { class: S.settings.ai.mode === k ? 'on' : '', onclick: () => { S.settings.ai.mode = k; save(); render(); } }, l))),
    h('div', { class: 'xs muted' }, '교사는 AI 키를 넣지 않아요. 서버가 Gemini를 대신 부르고, 학생 이름은 보내지 않아요. 서버 없이도 규칙 엔진으로 모든 화면이 동작해요.'));
}

/* ---------- 기기 연결 ---------- */
function settingsDevices() {
  const sy = S.sync;
  return section('기기 연결 (폰 · 워치)',
    sy.role === 'satellite' ? h('div', { class: 'col' }, h('div', { class: 'info' }, `이 기기는 보조 기기예요. 기록은 암호화되어 본체로 보내져요. 보낼 기록 ${sy.outbox.length}건.`),
      h('button', { class: 'btn sm warn', onclick: () => { if (confirm('연결을 끊을까요?')) { S.sync = defaultState().sync; save(); render(); } } }, '연결 끊기'))
      : h('div', { class: 'col' },
        sy.devices.length ? h('div', { class: 'row wrap gap4' }, sy.devices.map((d) => h('span', { class: 'chip ok' }, d.name))) : null,
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: pairMain }, '폰 연결하기'),
          h('button', { class: 'btn', onclick: () => openSheet(acceptSheet) }, '이 기기를 보조 기기로 (연결 코드 넣기)'),
          sy.channel ? h('button', { class: 'btn ghost warn', onclick: () => { S.sync = { ...defaultState().sync, devices: [] }; save(); render(); } }, '연결 끊기') : null),
        h('div', { class: 'xs muted' }, '폰·워치 기록은 연결 열쇠로 종단간 암호화되어 서버 전달함을 거쳐요. 서버는 내용을 읽을 수 없어요. 학생 이름은 보내지 않아요.')));
}
async function pairMain() {
  if (!serverUrl()) return toast('기기 연결에는 누가 서버(전달함)가 필요해요');
  const key = S.sync.key && S.sync.role === 'main' ? S.sync.key : newKey();
  S.sync.role = 'main'; S.sync.key = key; S.sync.channel = await channelOf(key); save();
  const code = b64uText(JSON.stringify({ k: key, s: serverUrl(), c: S.classes.map((c) => [c.id, c.students.length]), tt: S.timetable, b: S.settings.bell, cats: S.settings.categories, lv: S.settings.level }));
  const link = `${location.href.split('#')[0]}#pair=${code}`;
  const isHttps = location.protocol === 'https:';
  const qr = h('div', { style: { display: 'flex', justifyContent: 'center', minHeight: isHttps ? '200px' : '0' } });
  openSheet(() => sheet('폰 연결하기', h('div', { class: 'col' },
    isHttps ? h('div', { class: 'small' }, '폰 카메라로 QR을 찍으면 웨일에서 열리고 연결돼요.') : h('div', { class: 'small' }, `${location.protocol === 'file:' ? '파일로 연 앱이라' : 'https 주소가 아니라'} QR 대신 연결 코드를 복사해 폰의 누가 → 설정 → [이 기기를 보조 기기로]에 붙여 넣어 주세요.`),
    qr, h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => copyText(isHttps ? link : code, '연결 코드를 복사했어요') }, isHttps ? '연결 링크 복사' : '연결 코드 복사')),
    h('div', { class: 'xs muted' }, '코드에는 암호화 열쇠·서버 주소·반 인원·시간표만 들어 있어요. 학생 이름은 없어요. 다른 사람에게 보여 주지 마세요.'))));
  if (isHttps) loadQr().then((QR) => { if (QR) new QR(qr, { text: link, width: 200, height: 200 }); }).catch(() => {});
}
function loadQr() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  return new Promise((res) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = () => res(window.QRCode); s.onerror = () => res(null); document.head.appendChild(s); });
}
function acceptSheet() {
  const ta = h('textarea', { rows: 4, placeholder: '본체의 연결 코드' });
  return sheet('연결 코드 넣기', h('div', { class: 'col' }, ta, h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => { closeSheet(); acceptPair(ta.value.trim()); } }, '연결'))));
}
async function acceptPair(code) {
  try {
    const j = JSON.parse(unb64uText(code.replace(/^.*#pair=/, '')));
    if (!j.k || !j.s) throw new Error('연결 코드가 아니에요');
    if (S.mode === 'demo') switchMode('real');
    S.sync = { role: 'satellite', key: j.k, channel: await channelOf(j.k), devices: [], outbox: [] };
    S.settings.server.url = j.s;
    S.classes = (j.c || []).map(([id, n]) => ({ id, students: Array.from({ length: n }, (_, i) => ({ no: i + 1, name: '' })) }));
    if (j.tt) S.timetable = j.tt; if (j.b) S.settings.bell = j.b; if (j.cats) S.settings.categories = j.cats; if (j.lv) S.settings.level = j.lv;
    S.settings.numberOnly = true; S.setupDone = true; save(); UI.view = 'lesson'; render();
    toast('본체와 연결했어요. 이 기기에서 남긴 기록은 본체로 보내져요.');
  } catch (e) { toast(`연결하지 못했어요: ${e.message}`); }
}
let syncBusy = false;
async function syncLoop() {
  if (syncBusy || !S || S.mode === 'demo' || !S.sync.channel || !serverUrl()) return;
  syncBusy = true;
  try {
    if (S.sync.role === 'satellite') {
      for (const id of [...S.sync.outbox]) {
        const r = S.records.find((x) => x.id === id); if (!r) { S.sync.outbox = S.sync.outbox.filter((x) => x !== id); continue; }
        const dev = /Mobi|Android/i.test(navigator.userAgent) ? 'phone' : r.device;
        await api(`/box/${S.sync.channel}`, { body: { msg: await seal(S.sync.key, { ...r, device: dev === 'whalebook' ? 'phone' : dev }) } });
        S.sync.outbox = S.sync.outbox.filter((x) => x !== id);
      }
      save();
    } else if (S.sync.role === 'main') {
      const r = await api(`/box/${S.sync.channel}`);
      const ids = []; let n = 0;
      for (const it of r.items || []) {
        ids.push(it.id);
        try {
          const rec = await unseal(S.sync.key, it.msg);
          if (S.records.some((x) => x.id === rec.id)) continue;
          // 본체가 모르는 수업 키면 기록 시각으로 본체 수업에 붙인다 (직접 시작한 수업 대응)
          if (!rec.lessonKey || !lessonsOn(rec.lessonKey.slice(0, 10)).some((l) => l.key === rec.lessonKey)) { const l = lessonAt(rec.class, new Date(rec.time)); rec.lessonKey = l ? l.key : rec.lessonKey; }
          const { unit, std } = stdFor(rec.class, recDay(rec));
          S.records.push({ ...rec, unit: rec.unit || unit, std: rec.std && rec.std.length ? rec.std : std, status: 'pending' });
          const kind = rec.device === 'watch' ? 'watch' : 'phone';
          if (!S.sync.devices.some((d) => d.kind === kind)) S.sync.devices.push({ name: kind === 'watch' ? '워치' : '폰', kind });
          n++;
        } catch { /* 열쇠가 맞지 않는 항목은 버린다 */ }
      }
      if (ids.length) await api(`/box/${S.sync.channel}/ack`, { body: { ids } });
      if (n) { save(); toast(`폰·워치 기록 ${n}건 도착`); if (!Popup.key && !UI.sheet) render(); }
    }
  } catch { /* 다음 주기에 다시 */ } finally { syncBusy = false; }
}

/* ---------- 처음 설정 ---------- */
const ONB = { step: 0, level: 'high', subject: '', cls: '', roster: '', tt: [] };
function renderOnboarding() {
  const go2 = (n) => { ONB.step = n; render(); };
  if (ONB.step === 0) {
    return h('div', { class: 'onb' }, h('div', { class: 'onb-box' },
      h('div', { class: 'onb-hero' }, h('div', { class: 'logo' }, h('i', null, h('b'), h('b'), h('b')), '누가'),
        h('div', { class: 'lead' }, '수업 중 10초 관찰 기록을', h('br'), '피드백과 세특 근거로'),
        h('div', { class: 'muted' }, '수업 중엔 카테고리와 번호만 누르세요. 자리에 앉으면 1분 정리 창이 열리고, 기록은 학생 피드백과 세특 근거로 쌓여요.')),
      h('div', { class: 'choice' },
        h('button', { class: 'main', onclick: startDemo }, h('b', null, '데모로 바로 써 보기'), h('span', { class: 'small muted' }, '설치·로그인·키 없이 3분. 합성 학급(번호만)과 데모 시계로 수업 → 정리 → 피드백 → 세특까지.')),
        h('button', { onclick: () => whaleLogin('teacher') }, h('b', null, '웨일 스페이스로 로그인'), h('span', { class: 'small muted' }, '학교가 저절로 잡혀요. (App Console 연동 승인 필요)')),
        h('button', { onclick: () => go2(1) }, h('b', null, '직접 시작하기'), h('span', { class: 'small muted' }, '학교급·과목 → 반·명단 → 시간표. 약 3분.'))),
      h('div', { class: 'xs muted' }, '학생 이름은 이 브라우저에만 저장돼요. 녹음은 기본 꺼짐이에요.')));
  }
  const steps = h('div', { class: 'steps' }, ['1. 학교급·과목', '2. 반·명단', '3. 시간표'].map((t, i) => h('span', { class: ONB.step === i + 1 ? 'on' : '' }, t)));
  let body;
  if (ONB.step === 1) {
    body = h('div', { class: 'col' },
      h('div', { class: 'seg' }, [['elem', '초등학교'], ['middle', '중학교'], ['high', '고등학교']].map(([k, l]) => h('button', { class: ONB.level === k ? 'on' : '', onclick: () => { ONB.level = k; render(); } }, l))),
      h('label', { class: 'field' }, h('span', null, '과목 (초등은 비워도 돼요)'), h('input', { value: ONB.subject, oninput: (e) => { ONB.subject = e.target.value; } })),
      h('div', { class: 'small muted' }, `카테고리: ${CATS[ONB.level].join(' · ')}`),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go2(0) }, '이전'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => go2(2) }, '다음')));
  } else if (ONB.step === 2) {
    const cls = h('input', { value: ONB.cls, placeholder: '반 이름 (예: 2-3) — 여러 반이면 쉼표', oninput: (e) => { ONB.cls = e.target.value; } });
    const ta = h('textarea', { rows: 8, placeholder: '첫 반 명단을 붙여 넣으세요 (한 줄에 한 명). 번호만 쓰려면 인원 수만 (예: 25)', oninput: (e) => { ONB.roster = e.target.value; } }, ONB.roster);
    body = h('div', { class: 'col' }, cls, ta, h('div', { class: 'xs muted' }, '이름은 이 브라우저에만 저장돼요. 나머지 반 명단은 설정에서 넣어도 돼요.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go2(1) }, '이전'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => { if (!ONB.cls.trim()) return toast('반 이름을 넣어 주세요'); go2(3); } }, '다음')));
  } else {
    const ids = ONB.cls.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    const pt = periodTimes(defaultState().settings.bell);
    body = h('div', { class: 'col' }, h('div', { class: 'small muted' }, '수업이 있는 칸에 반을 고르세요. 이 시각에 수업 화면이 저절로 열려요.'),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '교시'), [1, 2, 3, 4, 5].map((wd) => h('th', null, WD[wd])))),
        h('tbody', null, pt.map((p) => h('tr', null, h('td', { class: 'small' }, `${p.no}교시`), [1, 2, 3, 4, 5].map((wd) => h('td', null, h('select', { 'aria-label': `${WD[wd]} ${p.no}교시`, onchange: (e) => { ONB.tt = ONB.tt.filter((t) => !(t.weekday === wd && t.period === p.no)); if (e.target.value) ONB.tt.push({ weekday: wd, period: p.no, class: e.target.value }); } },
          h('option', { value: '' }, '—'), ids.map((id) => h('option', { value: id, selected: ONB.tt.some((t) => t.weekday === wd && t.period === p.no && t.class === id) }, id)))))))))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go2(2) }, '이전'), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: finishOnboarding }, '시작하기')));
  }
  return h('div', { class: 'onb' }, h('div', { class: 'onb-box' }, h('div', { class: 'logo' }, h('i', null, h('b'), h('b'), h('b')), '누가'), steps, h('div', { class: 'card' }, body)));
}
function finishOnboarding() {
  if (S.mode === 'demo') switchMode('real');
  const ids = ONB.cls.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  const t = ONB.roster.trim();
  const first = /^\d+$/.test(t) ? Array.from({ length: Number(t) }, (_, i) => ({ no: i + 1, name: '' })) : parseRoster(t);
  S.settings.level = ONB.level; S.settings.categories = CATS[ONB.level].slice(); S.settings.subject = ONB.subject.trim();
  S.classes = ids.map((id, i) => ({ id, students: i === 0 ? first : [] }));
  if (/^\d+$/.test(t)) S.settings.numberOnly = true;
  S.timetable = ONB.tt.slice(); S.setupDone = true; saveNow(); UI.view = 'lesson'; render();
  toast('준비됐어요. 시간표 수업 시각에 수업 화면이 저절로 열려요.');
}
function startDemo() {
  switchMode('demo'); S = buildDemoState(); saveNow(); UI.view = 'lesson'; UI.cls = '2-3'; render();
  toast('데모: 10/13(화) 10:29, 2교시 2-3반 수업 중이에요. 위쪽 [수업 끝내고 자리로 ▶]를 눌러 보세요.', { ms: 7000 });
}

/* ---------- 학생 화면 (QR 쪽지) ----------
 * 주소 # 뒤에 담긴 카드만 보여 준다. # 뒤는 서버로 가지 않고, 이 화면은 아무것도 저장하지 않는다.
 */
function renderStudent() {
  const box = h('div', { class: 'student' }, h('div', { class: 'logo' }, h('i', null, h('b'), h('b'), h('b')), '누가 · 내 피드백'));
  let c = null;
  try { c = JSON.parse(unb64uText(location.hash.slice(6))); } catch { /* 잘못된 쪽지 */ }
  if (!c || c.v !== 1) { box.appendChild(h('div', { class: 'card empty' }, '쪽지를 읽지 못했어요. 선생님께 다시 받아 주세요.')); return box; }
  box.appendChild(h('div', { class: 'fb' },
    h('div', { class: 'small muted' }, [c.s, c.p, c.d && koDate(c.d)].filter(Boolean).join(' · ')),
    h('div', { class: 'good' }, c.g), h('div', { class: 'next' }, h('b', null, '다음 도전 '), c.n)));
  box.appendChild(h('div', { class: 'xs muted' }, '이 카드는 쪽지의 QR 안에만 있어요. 서버에 저장되지 않고, 이름·번호도 들어 있지 않아요.'));
  return box;
}

/** 학생용 QR 쪽지 인쇄: 종이에는 교사가 건넬 수 있게 번호를 적고, QR(링크)에는 내용만 담는다 */
async function printSlips(cls, cards, range) {
  const base = location.href.split('#')[0];
  const local = location.protocol === 'file:' || /^(localhost|127\.)/.test(location.hostname);
  const QR = await loadQr();
  const wrap = h('div', { class: 'slips', id: 'slips' },
    h('div', { class: 'slips-bar no-print' }, h('b', null, `${cls}반 학생용 쪽지 · ${range.label}`), h('span', { class: 'grow' }),
      local ? h('span', { class: 'xs', style: { color: 'var(--warn)' } }, '배포한 https 주소에서 만들어야 학생 폰에서 QR이 열려요') : null,
      h('button', { class: 'btn primary sm', onclick: () => window.print() }, '인쇄'), h('button', { class: 'btn sm', onclick: () => wrap.remove() }, '닫기')),
    h('div', { class: 'slips-grid' }, cards.map((c) => {
      const q = h('div', { class: 'slip-qr' });
      if (QR) new QR(q, { text: cardLink(c, range, base), width: 120, height: 120, correctLevel: QR.CorrectLevel.L });
      return h('div', { class: 'slip' }, h('div', { class: 'slip-no' }, `${cls} · ${c.no}번`),
        h('div', { class: 'slip-body' }, h('div', { class: 'good' }, c.good), h('div', { class: 'next' }, h('b', null, '다음 도전 '), c.next)), q);
    })));
  if (!QR) wrap.querySelector('.slips-bar').appendChild(h('span', { class: 'xs', style: { color: 'var(--warn)' } }, 'QR 도구를 불러오지 못해 글만 인쇄돼요 (인터넷 연결 확인)'));
  document.body.appendChild(wrap);
}

/* ---------- 주소 # 처리 (연결 코드 · 웨일 스페이스 로그인) ---------- */
function handleHash() {
  const hs = location.hash;
  if (hs.startsWith('#pair=')) { const code = hs.slice(6); history.replaceState(null, '', location.pathname + location.search); acceptPair(code); return; }
  if (hs.startsWith('#card=')) return; // 학생용 쪽지는 render 에서 그린다
  if (hs.startsWith('#ws=')) {
    history.replaceState(null, '', location.pathname + location.search);
    let j; try { j = JSON.parse(unb64uText(hs.slice(4))); } catch { toast('로그인 정보를 읽지 못했어요. 다시 로그인해 주세요.'); return; }
    const ERR = { cancelled: '로그인을 취소했어요.', wrong_role: '교사 계정으로만 로그인할 수 있어요. 학생은 선생님이 준 QR 쪽지로 카드를 봐요.', bad_return: '허용되지 않은 주소예요.', login_failed: '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.' };
    if (j.error) { toast(ERR[j.error] || `로그인 오류: ${j.error}`); return; }
    if (S.mode === 'demo') switchMode('real');
    if (j.userType === 'tea') {
      S.account = { provider: 'whalespace', userType: 'tea', sid: j.sid, token: j.token, exp: j.exp };
      if (j.school) S.school = { name: j.school.name, code: j.school.code, office: j.school.office, kind: j.school.kind, source: 'whalespace' };
      save(); render(); toast(`웨일 스페이스로 로그인했어요${S.school ? ` · ${S.school.name}` : ''}`);
    }
  }
}

/* ---------- 시작 ---------- */
function init() {
  const mode = lsGet(MODE_KEY) === 'demo' ? 'demo' : 'real';
  S = loadState(mode);
  if (mode === 'demo' && !S.setupDone) S = buildDemoState();
  handleHash();
  window.addEventListener('hashchange', () => { handleHash(); render(); });
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  Presence.init();
  render();
  cleanupAudio();
  setInterval(tick, 5000); setTimeout(tick, 300);
  setInterval(syncLoop, 20000); setTimeout(syncLoop, 1500);
}
