import React, { useEffect, useMemo } from "react";
import { CATEGORY_NONE, lessonFor, nowIso, resolveNow } from "@nuga/core";
import { studentName, studentsOf, useStore } from "../store";
import { StudentDetail } from "../pages/RecordsPage";
import { IS_WHALE, SUB_WINDOW, draftTabUrl, openWhaleSidebar } from "../lib/windows";
import { WHALE_AREA, currentCard, exitWhale, feedbackCard, useWhale, whaleFrom } from "../lib/whale";
import whaleLogo from "../assets/whale-logo.png";
import "./whale.css";

/**
 * 웨일 모드 둘러보기: '웨일 스페이스와 함께 쓰는 하루' 6장면. 왼쪽은 언제나 진짜 앱 화면(데모 영역)이고,
 * 오른쪽 밤의 칸이 장면을 설명한다. 웨일 쪽 화면은 누가 디자인으로 그린 '연계 예시'이며 누른 결과는 데모 영역에 그대로 남는다.
 * 웨일 브라우저의 실제 기능은 사이드바(모바일 화면) · 듀얼탭(생기부 생성)으로 여는 것 두 가지다.
 */

/** 웨일 클래스 퀴즈 응답 (합성). 번호는 반 명단에 있는 학생으로 맞춘다 */
const QUIZ = [
  { no: 8, kind: "1차 오답 → 2차 정답", text: "다시 보니 반응물과 생성물의 양이 같은 게 아니라 정반응과 역반응의 속도가 같은 거였어요.", criteria: "스스로 고침" },
  { no: 17, kind: "질문 남김", text: "그럼 촉매를 넣으면 평형 위치도 바뀌나요?", criteria: "깊이 있는 질문" },
  { no: 22, kind: "서술형", text: "지난 단원에서 배운 증발과 응축처럼 포화 소금물도 녹는 것과 석출이 같은 속도로 일어나는 동적 평형이에요.", criteria: "개념 연결" },
];
const FROM: Record<string, { href: string; label: string }> = {
  landing: { href: "https://dacisosl.github.io/NUGA/", label: "소개 페이지로" },
};

/** 받침이 있으면 '이', 없으면 '가' */
const josaIGa = (word: string) => { const c = word.charCodeAt(word.length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? "이" : "가"; };

interface Scene { when: string; title: string; lead: string; why: string; enter(): void; Body: () => React.ReactElement }

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wt-ex">
      <div className="wt-ex-h"><span>{title}</span><span className="wt-tag">연계 예시 · 데모 데이터</span></div>
      <div className="wt-ex-b">{children}</div>
    </div>
  );
}
function Real({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="wt-real wt-dark"><span className="wt-real-chip">웨일에서 실제 동작</span><span className="grow">{text}</span>{children}</div>;
}

/* ---------- 장면 ---------- */

function SceneLogin() {
  const doc = useStore((s) => s.doc);
  const cur = resolveNow(doc.settings, new Date()).current;
  const classes = doc.settings.classes.map((c) => c.class).join(" · ");
  const rows: [string, string][] = [
    ["교사 계정 확인", "학생 계정은 들어올 수 없어요"],
    ["학교 · 해밀고등학교", "학교 코드만 받아요"],
    ["나이스 시간표 · 학사일정", `${classes}반 주 ${doc.settings.timetable.length}시간 · 공휴일은 저절로 쉬어요`],
  ];
  return (
    <>
      <Frame title="웨일 스페이스 로그인">
        <div className="wt-login"><span className="wt-avatar" aria-hidden>교</span><div><b>교사 계정으로 로그인</b><div className="wt-sub">학교에서 받은 웨일 스페이스 계정</div></div></div>
        <ul className="wt-checks">
          {rows.map(([a, b], i) => <li key={a} style={{ ["--i" as string]: i }}><span className="ok">✓</span><span><b>{a}</b><span className="wt-sub">{b}</span></span></li>)}
          <li className="go" style={{ ["--i" as string]: 3 }}><span className="ok">→</span><span>{cur ? `종이 치자 ${cur.class} · ${cur.period}교시 현황판이 열렸어요` : "종이 치면 그 반 현황판이 저절로 열려요"}</span></li>
        </ul>
      </Frame>
      <div className="wt-two">
        <div className="wt-box"><span className="wt-sub">누가가 받는 것</span><b>교사인지 · 학교 코드</b></div>
        <div className="wt-box"><span className="wt-sub">받지 않는 것</span><b>이름 · 반·번호 · 학생 명단</b></div>
      </div>
    </>
  );
}

function SceneMonitor() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const addRecord = useStore((s) => s.addRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const toast = useStore((s) => s.toast);
  const picked = useWhale((s) => s.picked);
  const students = studentsOf(doc, cls);
  const tap = (no: number) => {
    if (picked[no]) return;
    const t = nowIso(); const supp = doc.settings.supplementEnabled;
    // 수업 중엔 번호만: 카테고리(0 = 미정)와 한 줄은 쉬는 시간 기록 창에서
    const rec = addRecord({ class: cls, no, category: CATEGORY_NONE, time: t, lesson: lessonFor(doc.settings.progress, cls, t), memo: "", voiceMemo: null, note: "", status: supp ? "pending" : "confirmed", source: "pc" });
    useWhale.setState((s) => ({ picked: { ...s.picked, [no]: rec.id } }));
    toast({ text: `수업관리에서 기록 · ${cls} · ${no}번 ${studentName(doc, cls, no)}`, action: { label: "취소", onClick: () => { deleteRecord(rec.id); useWhale.setState((s) => { const p = { ...s.picked }; delete p[no]; return { picked: p }; }); } } });
  };
  return (
    <>
      <Frame title={`웨일북 수업관리 · ${cls}반 ${students.length}명 화면`}>
        <div className="wt-tiles">
          {students.map((s) => (
            <button key={s.no} className={`wt-tile ${picked[s.no] ? "on" : ""}`} onClick={() => tap(s.no)} aria-label={`${s.no}번 ${s.name} 화면 · 눌러서 기록`}>
              <span className="scr" aria-hidden><i /><i /><i /></span>
              <span className="who"><b className="num">{s.no}</b>{s.name}</span>
              {picked[s.no] && <span className="tick" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
        <div className="wt-note">누가로 넘어가는 건 번호뿐이에요. 분류와 한 줄은 쉬는 시간에 PC에서 채워요. 학생 화면 내용은 넘어가지 않아요.</div>
      </Frame>
      {IS_WHALE
        ? <Real text="누가 모바일 화면(번호 릴)을 웨일 사이드바에 띄워 두면 수업 화면 옆에서 바로 기록돼요."><button className="btn sm" onClick={openWhaleSidebar}>사이드바로 열기</button></Real>
        : <Real text="웨일 브라우저에서는 누가 모바일 화면(번호 릴)을 사이드바에 띄워 수업 화면과 나란히 쓸 수 있어요." />}
    </>
  );
}

function SceneClass() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const addRecord = useStore((s) => s.addRecord);
  const openInbox = useStore((s) => s.openInbox);
  const quiz = useWhale((s) => s.quiz);
  const picked = useWhale((s) => s.picked);
  const roster = studentsOf(doc, cls).map((s) => s.no);
  const items = QUIZ.map((q, i) => ({ ...q, no: roster.includes(q.no) ? q.no : roster[i * 7] ?? roster[0] }));
  const send = (q: typeof items[number]) => {
    const t = nowIso();
    const rec = addRecord({ class: cls, no: q.no, category: CATEGORY_NONE, time: t, lesson: lessonFor(doc.settings.progress, cls, t), memo: `웨일 클래스 퀴즈 · ${q.kind}: “${q.text}”`, voiceMemo: null, note: "", status: "pending", source: "pc" });
    useWhale.setState((s) => ({ quiz: { ...s.quiz, [q.no]: rec.id } }));
  };
  const sent = Object.values(quiz).filter((v) => v !== "no");
  const open = () => openInbox({ records: [...sent, ...Object.values(picked)] });
  return (
    <>
      <Frame title="웨일 클래스 · 오늘 수업 확인 퀴즈">
        <div className="wt-sub">{cls}반 제출 · 누가가 눈여겨볼 응답 {items.length}개를 골랐어요</div>
        {items.map((q) => {
          const st = quiz[q.no];
          return (
            <div key={q.no} className={`wt-quiz ${st ? "done" : ""}`}>
              <div className="flex wrap"><b className="num">{q.no}</b><b>{studentName(doc, cls, q.no)}</b><span className="wt-sub">{q.kind}</span><span className="grow" /><span className="chip outline">{q.criteria}</span></div>
              <div className="wt-quote">“{q.text}”</div>
              {st === "no" ? <div className="wt-sub">넘겼어요. 기록으로 남지 않아요.</div>
                : st ? <div className="wt-okline">쉬는 시간 기록으로 보냈어요</div>
                : <div className="flex"><button className="btn sm primary" onClick={() => send(q)}>근거 후보로 보내기</button><button className="btn sm ghost" onClick={() => useWhale.setState((s) => ({ quiz: { ...s.quiz, [q.no]: "no" } }))}>넘기기</button></div>}
            </div>
          );
        })}
      </Frame>
      <div className="wt-act wt-dark">
        <button className="btn primary" disabled={!sent.length && !Object.keys(picked).length} onClick={open}>쉬는 시간 기록 열기</button>
        <span className="wt-sub">보낸 응답{Object.keys(picked).length ? "과 수업 중 번호 기록" : ""}을 선생님이 확인해 한 줄로 남겨요.</span>
      </div>
    </>
  );
}

function SceneFeedback() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const { phone, acceptedAt, card: sent } = useWhale();
  const live = useMemo(() => feedbackCard(doc, cls), [doc.records, cls]);
  const card = sent || live;
  if (!card) return <div className="wt-sub">이 반에 피드백 카드를 만들 기록이 없어요.</div>;
  const name = studentName(doc, card.cls, card.no);
  const closed = !!acceptedAt && doc.records.some((r) => r.class === card.cls && r.no === card.no && r.createdAt >= acceptedAt && r.status === "confirmed");
  const stage = phone === "idle" ? 0 : phone === "sent" ? 1 : closed ? 3 : 2;
  const body = <><div className="good">{card.good}</div><div className="next"><b>다음 도전</b> {card.next}</div></>;
  return (
    <>
      <ol className="wt-loop" aria-label="피드백 고리">{["피드백", "도전", "관찰", "기록"].map((t, i) => <li key={t} className={i <= stage ? "on" : ""}>{t}</li>)}</ol>
      {phone === "idle" ? (
        <Frame title={`${card.cls} · ${card.no}번 ${name} 피드백 카드`}>
          <div className="wt-card">{body}</div>
          <button className="btn primary" onClick={() => useWhale.setState({ phone: "sent", card })}>학생 웨일로 보내기</button>
        </Frame>
      ) : (
        <Frame title="학생의 웨일 (폰)">
          <div className="wt-phone">
            <div className="wt-noti"><b>새 피드백이 왔어요</b><span>{doc.settings.school.subject.replace(/ · 웨일 데모$/, "")} 선생님</span></div>
            <div className="wt-card">{body}</div>
            {phone === "sent"
              ? <button className="btn primary" onClick={() => useWhale.setState({ phone: "accepted", acceptedAt: nowIso() })}>도전해 볼게요</button>
              : <div className="wt-okline center">✓ 선생님께 전했어요</div>}
          </div>
          <div className="wt-sub">학생 화면에는 반·번호·이름이 없어요. 카드 내용만 가요.</div>
        </Frame>
      )}
      {phone === "accepted" && (
        <div className="wt-call wt-dark">
          <b>{card.no}번 {name}{josaIGa(name)} 다음 도전을 받았어요</b>
          {closed ? <span>✓ 다음 관찰을 기록했어요 · 피드백 고리가 한 바퀴 돌았어요</span>
            : <><span>다음 수업에서 이 학생을 눈여겨보고, 기록 창에 한 줄 남기면 고리가 닫혀요.</span><button className="btn sm primary" onClick={() => useWhale.setState({ detailOpen: true })}>{card.no}번 기록 창 열기</button></>}
        </div>
      )}
    </>
  );
}

function SceneDraft() {
  const sel = useStore((s) => s.selected);
  const doc = useStore((s) => s.doc);
  return (
    <>
      <Frame title="듀얼탭 · 나이스 옆 누가">
        <div className="wt-dual">
          <div className="pane neis"><span className="wt-sub">업무포털 · 나이스</span><b>세부능력 및 특기사항</b><i /><i /><i className="short" /></div>
          <div className="pane nuga"><span className="who">누가 · 생기부 생성</span><span>{sel ? `${sel.class} · ${sel.no}번 ${studentName(doc, sel.class, sel.no)}` : "학생 선택"}</span><span>근거 기록 · 초안 · 검토</span><span className="chip pass">복사 → 붙여 넣기</span></div>
        </div>
      </Frame>
      {IS_WHALE && sel
        ? <Real text="생기부 생성 화면을 듀얼탭으로 열어요. 옆 칸에 업무포털(나이스)을 띄워 나란히 써요."><a className="btn sm" href={draftTabUrl(sel.class, sel.no)} rel="whale-dualtab">듀얼탭으로 열기</a></Real>
        : <Real text="웨일 브라우저에서는 이 화면을 듀얼탭으로 열어, 옆 칸에 업무포털(나이스)을 띄워 나란히 쓸 수 있어요." />}
    </>
  );
}

function SceneScale() {
  return (
    <>
      <div className="col" style={{ gap: 8 }}>
        <div className="wt-box"><b>배포 · 관리자 정책 한 번</b><span className="wt-sub">교육청·학교 관리자가 정책으로 누가를 선생님들의 웨일 사이드바에 넣어 줘요.</span></div>
        <div className="wt-box"><b>AI · 교사 인증이 곧 사용 자격</b><span className="wt-sub">지금은 설정 → AI에 선생님이 키를 넣어요(왼쪽 화면). 웨일 스페이스 교사 인증으로 열면 키 없이 쓰고, 하루 한도는 교육청이 정해요.</span></div>
        <div className="wt-box"><b>개인정보 · 이름은 교사 기기에만</b><span className="wt-sub">AI에는 이름·번호 없이 내용만 가요. 학생 신원은 학교가 관리하는 웨일 스페이스 안에서만 움직여요.</span></div>
      </div>
      <div className="wt-honest">
        <div><b>지금 실제로 되는 것</b><ul><li>누가의 모든 기능 (데모 · 실사용)</li><li>웨일 사이드바 · 듀얼탭으로 열기</li></ul></div>
        <div><b>연계에 필요한 것</b><ul><li>웨일 스페이스 로그인 연동 승인 (App Console)</li><li>웨일북 수업관리 · 웨일 클래스 연동 (웨일 측 협의)</li><li>학생 웨일로 피드백 카드 보내기 (웨일 측 협의)</li></ul></div>
      </div>
    </>
  );
}

const st = () => useStore.getState();
const SCENES: Scene[] = [
  { when: "아침", title: "로그인 한 번이면 설정 0분", Body: SceneLogin,
    lead: "웨일 스페이스 교사 계정으로 들어오면 학교와 시간표가 저절로 잡혀요. 영역·반·시간표를 넣는 처음 설정을 건너뛰고, 종이 치면 그 반 현황판이 열려요.",
    why: "선생님 일은 하나도 늘지 않고, 누가가 아는 학생 정보도 하나도 늘지 않아요.",
    enter() { st().setPage("main"); } },
  { when: "수업 중", title: "수업관리 화면의 학생 칸이 곧 기록 버튼", Body: SceneMonitor,
    lead: "웨일북 수업관리로 학생 화면을 보다가 눈에 띈 학생 칸을 누르면, 그 번호로 누가에 기록돼요. 화면을 바꾸지도, 번호를 다시 찾지도 않아요.",
    why: "10초 기록이 선생님이 이미 보고 있는 화면 안에서 끝나요. 누른 번호는 계단과 미반영에 바로 보여요.",
    enter() { st().setPage("main"); } },
  { when: "쉬는 시간", title: "웨일 클래스 활동이 근거 후보로", Body: SceneClass,
    lead: "웨일 클래스 퀴즈·과제에서 눈여겨볼 응답을 근거 후보로 보내면, 수업 중에 누른 번호와 함께 '쉬는 시간 기록' 창에 모여요. 선생님이 한 줄로 남겨야 기록이 돼요.",
    why: "녹음의 놓친 발언 추천과 같은 '추천 → 선생님 확인' 구조예요. 누가는 점수를 매기거나 평가하지 않아요.",
    enter() { st().setPage("main"); } },
  { when: "방과 후", title: "피드백은 학생의 웨일로, 대답은 다음 관찰로", Body: SceneFeedback,
    lead: "기록으로 만든 '잘한 장면 · 다음 도전' 카드가 학생의 웨일로 가요. 학생이 [도전해 볼게요]를 누르면 다음 수업에서 그 학생을 눈여겨보고 기록해요.",
    why: "피드백이 전달로 끝나지 않고 다음 관찰을 불러요. 피드백 → 도전 → 관찰 → 기록이 한 바퀴 돌아요.",
    enter() { st().setPage("main"); } },
  { when: "학기 말", title: "생기부는 나이스 옆 듀얼탭에서", Body: SceneDraft,
    lead: "누가 생기부 생성 화면을 듀얼탭으로 열고 옆 칸에 업무포털 나이스를 띄워요. 한 학기 동안 쌓인 근거로 초안을 만들고 검토한 뒤 복사해 붙여 넣어요.",
    why: "학기 말 몰아 쓰기가 아니라 쌓인 근거를 옆에 두고 써요. 최종 작성은 선생님이 해요.",
    enter() {
      const s = st(); const card = currentCard(s.doc, s.cls);
      if (card) { s.setClass(card.cls); s.select({ class: card.cls, no: card.no }); }
      s.setMode2p("individual"); s.setPage("draft");
    } },
  { when: "학교 전체", title: "관리자 정책 한 번, AI는 교사 인증으로", Body: SceneScale,
    lead: "교육청·학교 관리자가 정책으로 누가를 선생님들의 웨일에 넣어 주고, AI는 웨일 스페이스 교사 인증으로 열어요.",
    why: "학교 단위로 퍼질 길이 이미 웨일 스페이스 안에 있어요. 무엇이 지금 되고 무엇이 승인을 기다리는지 그대로 밝혀요.",
    enter() { st().setSettingsTab("ai"); st().setPage("settings"); } },
];

/** 오른쪽 밤의 칸 (좁은 화면에서는 아래 시트). 접으면 오른쪽 아래 알약 */
export function WhaleTour() {
  const { on, busy, step, min, detailOpen } = useWhale();
  const areaId = useStore((s) => s.areaId);
  const loaded = useStore((s) => s.loaded);
  const doc = useStore((s) => s.doc);
  // 새로고침해도 데모 영역에 있으면 이어서 켠다. 사용자가 영역을 바꿔 데모 영역을 떠나면 웨일 모드를 끝낸다
  useEffect(() => {
    if (!loaded || busy || SUB_WINDOW) return;
    if (areaId === WHALE_AREA && !on) useWhale.setState({ on: true });
    else if (areaId !== WHALE_AREA && on) void exitWhale();
  }, [loaded, busy, areaId, on]);
  if (!on || SUB_WINDOW) return null;
  const sc = SCENES[step];
  const go = (i: number) => { const n = Math.max(0, Math.min(SCENES.length - 1, i)); useWhale.setState({ step: n }); SCENES[n].enter(); };
  const card = step === 3 ? currentCard(doc, useStore.getState().cls) : null;
  const detailStudent = card ? doc.students.find((s) => s.class === card.cls && s.no === card.no) : undefined;
  const back = FROM[whaleFrom() || ""];
  if (min) return <button className="wt-pill" onClick={() => useWhale.setState({ min: false })}><img className="wt-logo" src={whaleLogo} alt="" />웨일 연계 {step + 1}/{SCENES.length} · {sc.title}</button>;
  // 학생 기록 창(모달)은 칸 밖에 그린다: 칸의 흐림(backdrop-filter)이 모달 덮개를 칸 안에 가두지 않게
  return (
    <>
    <aside className="whale-tour" aria-label="웨일 연계 둘러보기">
      <div className="wt-h wt-dark">
        <img className="wt-logo" src={whaleLogo} alt="" />
        <b className="grow">웨일 스페이스와 함께 쓰는 하루</b>
        {back && <a className="btn ghost sm" href={back.href}>← {back.label}</a>}
        <button className="btn ghost sm icon" onClick={() => useWhale.setState({ min: true })} aria-label="접기" title="접기">–</button>
      </div>
      <ol className="wt-steps">
        {SCENES.map((s, i) => (
          <li key={s.when}><button className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}><b>{String(i + 1).padStart(2, "0")}</b>{s.when}</button></li>
        ))}
      </ol>
      <div className="wt-b" key={step}>
        <div className="wt-idx">{String(step + 1).padStart(2, "0")} · {sc.when}</div>
        <h2>{sc.title}</h2>
        <p className="wt-lead">{sc.lead}</p>
        <sc.Body />
        <p className="wt-why"><b>왜 좋은가</b> {sc.why}</p>
      </div>
      <div className="wt-f wt-dark">
        <button className="btn" disabled={step === 0} onClick={() => go(step - 1)}>이전</button>
        <span className="grow" />
        {step < SCENES.length - 1
          ? <button className="btn primary" onClick={() => go(step + 1)}>다음 · {SCENES[step + 1].when}</button>
          : <button className="btn primary" disabled={busy} onClick={() => void exitWhale()}>웨일 모드 끝내기</button>}
      </div>
    </aside>
    {detailOpen && detailStudent && <StudentDetail student={detailStudent} compose onClose={() => useWhale.setState({ detailOpen: false })} />}
    </>
  );
}
