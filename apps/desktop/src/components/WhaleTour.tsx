import React, { useEffect, useMemo } from "react";
import { CATEGORY_NONE, lessonFor, nowIso, type Category, type NugaDoc } from "@nuga/core";
import { studentName, studentsOf, useStore } from "../store";
import { StudentDetail } from "../pages/RecordsPage";
import { IS_WHALE, SUB_WINDOW, draftTabUrl, openSidePreview, openWhaleSidebar } from "../lib/windows";
import { isTauri } from "../lib/platform";
import { ROSTER_CLASS, WHALE_AREA, currentCard, exampleRoster, exitWhale, fewestNos, importWhaleRoster, mainClass, useWhale, whaleFrom, whaleKey } from "../lib/whale";
import whaleLogo from "../assets/whale-logo.png";
import "./whale.css";

/**
 * 웨일 모드 둘러보기: 누가와 딱 맞는 웨일 서비스 네 곳을 서비스별로 — 연결(무엇이 어디로) → 가치(전 · 후) → 해 보기.
 * 왼쪽은 언제나 진짜 앱 화면(데모 영역)이고, 오른쪽 밤의 칸이 설명한다. 웨일 쪽 화면은 누가 디자인으로 그린 '연계 예시'이며
 * 누른 결과는 데모 영역에 그대로 남는다. 상태는 연결마다 셋 가운데 하나: 웨일에서 실제 동작(사이드바 · 듀얼탭) · 지금 가능(명단 파일) · 연계 예시(승인·협의 전).
 * 틀의 태그(그림 · 데모)는 상태가 아니라 '그린 화면'이라는 표시다.
 */

type St = "real" | "now" | "plan";
const ST: Record<St, string> = { real: "웨일에서 실제 동작", now: "지금 가능", plan: "연계 예시 · 승인·협의 전" };
const FROM: Record<string, { href: string; label: string }> = {
  landing: { href: "https://dacisosl.github.io/NUGA/", label: "소개 페이지로" },
};
const pad = (n: number) => String(n).padStart(2, "0");
/** 받침이 있으면 '이', 없으면 '가' */
const josaIGa = (word: string) => { const c = word.charCodeAt(word.length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? "이" : "가"; };
const st = () => useStore.getState();
/** 기록(건너뜀 제외)이 하나도 없는 학생 수 = 계단의 출발선 */
const zeroCount = (doc: NugaDoc, cls: string) => studentsOf(doc, cls).filter((s) => !doc.records.some((r) => r.class === cls && r.no === s.no && r.status !== "skipped")).length;

function Chip({ st: s, text }: { st: St; text?: string }) { return <span className={`wt-st ${s}`}>{text || ST[s]}</span>; }
function Frame({ title, tag = "웨일 화면 그림 · 데모 데이터", children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="wt-ex">
      <div className="wt-ex-h"><span>{title}</span><span className="wt-tag">{tag}</span></div>
      <div className="wt-ex-b">{children}</div>
    </div>
  );
}
function Real({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="wt-real wt-dark"><span className="wt-real-chip">웨일에서 실제 동작</span><span className="grow">{text}</span>{children}</div>;
}

/* ---------- 00 한눈에 ---------- */

const MAP: { step: number; name: string; arrow: string; links: [string, St][]; value: string }[] = [
  { step: 1, name: "웨일 스페이스", arrow: "→", links: [["명단 파일 → 반·명단", "now"], ["교사 계정 로그인 → 처음 설정", "plan"]], value: "명단을 옮겨 적지 않아요" },
  { step: 2, name: "웨일 클래스", arrow: "⇄", links: [["퀴즈 응답 → 근거 후보", "plan"], ["피드백 쪽지 → 성적 노트", "plan"]], value: "말이 적은 학생도 근거와 피드백을" },
  { step: 3, name: "팀보드", arrow: "→", links: [["작성자별 노트 → 협동 근거 후보", "plan"], ["보드 옆 사이드바에서 기록", "real"]], value: "모둠 결과물이 아닌 그 학생의 몫만" },
  { step: 4, name: "웨일 브라우저", arrow: "⊃", links: [["사이드바에 번호 릴 (수업 중)", "real"], ["듀얼탭에 생기부 (나이스 옆)", "real"]], value: "보던 화면을 떠나지 않아요" },
];

function SceneMap({ go }: { go: (i: number) => void }) {
  return (
    <>
      <ul className="wt-map">
        {MAP.map((m) => (
          <li key={m.step}>
            <button onClick={() => go(m.step)}>
              <span className="wt-map-h"><b>{m.name}</b><span className="arrow" aria-hidden>{m.arrow}</span><b>누가</b><span className="grow" /><span className="go" aria-hidden>›</span></span>
              {m.links.map(([t, s], i) => <span key={t} className="wt-map-r"><i>{i ? "" : "연결"}</i><span className="grow">{t}</span><Chip st={s} text={s === "plan" ? "연계 예시" : undefined} /></span>)}
              <span className="wt-map-r"><i>가치</i>{m.value}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="wt-box"><b>지키는 것</b><span className="wt-sub">학생 이름은 선생님 PC에만 (명단 파일도 PC에서만 읽어요) · 웨일 쪽으로 보내는 건 번호와 내용뿐 · 학생 응답·노트는 선생님이 한 줄로 남겨야 생기부 근거</span></div>
      <div className="wt-honest">
        <div><b>지금 되는 것</b><ul><li>사이드바 · 듀얼탭으로 열기 (웨일)</li><li>웨일 스페이스 명단 파일 가져오기 (예시 양식 기준)</li></ul></div>
        <div><b>승인·협의 전 (연계 예시)</b><ul><li>웨일 스페이스로 로그인 (App Console 승인)</li><li>클래스 응답 · 팀보드 노트 받기, 성적 노트로 쪽지 보내기 (웨일 측 협의)</li><li>관리자 정책으로 학교 배포</li></ul></div>
      </div>
      <div className="wt-sub">웨일온 · 웨일 UBT는 잇지 않았어요. 누가가 쌓는 '한 학생의 한 장면'과 단위가 달라요. 수업관리는 그 화면 옆 사이드바로 함께 써요.</div>
    </>
  );
}

/* ---------- 01 웨일 스페이스 ---------- */

function SceneSpace() {
  const doc = useStore((s) => s.doc);
  const { roster, login } = useWhale();
  const rows = useMemo(exampleRoster, []);
  const n = doc.students.filter((s) => s.class === ROSTER_CLASS).length;
  const shown = [rows[0], rows[1], rows[2], rows[3], rows[rows.length - 1]];
  const take = () => { const k = importWhaleRoster(); st().toast({ text: `웨일 스페이스 명단 · ${ROSTER_CLASS} ${k}명 가져옴 (선생님 · 다른 반 · 이메일은 읽지 않음)` }); };
  return (
    <>
      <Frame title="관리자 · 사용자 다운로드 (엑셀)" tag="예시 양식 · 합성 데이터">
        <table className="wt-file">
          <thead><tr><th>유형</th><th>성</th><th>이름</th><th>조직 경로</th><th>번호</th><th className="off">이메일</th></tr></thead>
          <tbody>
            {shown.map((r, i) => {
              const skip = r["사용자 유형"] !== "학생" || !r["조직 경로"].endsWith("7반");
              return (
                <tr key={i} className={skip ? "off" : ""}>
                  <td>{r["사용자 유형"]}</td><td>{r.성}</td><td>{r.이름}</td><td>…{r["조직 경로"].replace(/^\/[^/]+/, "")}</td><td>{r["고유 번호"]}</td><td className="off">user…</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="wt-note">학교 전체가 든 파일이에요. 진한 칸만 읽어요: 학생 행 · 고른 반({ROSTER_CLASS}) · 성·이름 · 번호. 선생님 행 · 다른 반 · 이메일은 읽지 않아요. 실제 파일은 열 이름이 다를 수 있어 처음 한 번 확인해요.</div>
        {roster
          ? <div className="wt-okline">✓ {ROSTER_CLASS} 학생 {n}명이 왼쪽 반·명단에 들어왔어요</div>
          : <button className="btn primary" onClick={take}>누가로 가져오기 · {ROSTER_CLASS}만</button>}
      </Frame>
      <Frame title="웨일 스페이스로 로그인 (승인 뒤 모습)">
        {login ? (
          <ul className="wt-checks">
            {[["선생님 계정", "학교에서 받은 웨일 스페이스 계정 그대로"], ["소속 학교 · 고등학교", "학교급에 맞는 분류 · 생기부 분량으로 처음 설정 시작"], ["학생 명단은 받지 않아요", "명단은 위 파일로 · 이름은 선생님 PC에만"]].map(([a, b], i) => (
              <li key={a} style={{ ["--i" as string]: i }}><span className="ok">✓</span><span><b>{a}</b><span className="wt-sub">{b}</span></span></li>
            ))}
          </ul>
        ) : <button className="btn" onClick={() => useWhale.setState({ login: true })}>교사 계정으로 로그인 (예시)</button>}
      </Frame>
      <div className="wt-box"><b>학교 전체로 · 관리자 정책</b><span className="wt-sub">학교 관리자가 [정책 → 앱 및 확장앱]으로 선생님들의 웨일에 누가를 한 번에 설치해요. 다음 단계예요.</span></div>
    </>
  );
}

/* ---------- 02 웨일 클래스 ---------- */

/** 웨일 클래스 퀴즈 응답 (합성). 기록이 가장 적은 학생 차례로 붙인다. 칩은 응답 종류만 (누가는 응답을 평가하지 않는다) */
const QUIZ = [
  { kind: "고쳐 쓴 답", text: "다시 보니 반응물과 생성물의 양이 같은 게 아니라 정반응과 역반응의 속도가 같은 거였어요." },
  { kind: "질문", text: "그럼 촉매를 넣으면 평형 위치도 바뀌나요?" },
  { kind: "서술형", text: "지난 단원에서 배운 증발과 응축처럼 포화 소금물도 녹는 것과 석출이 같은 속도로 일어나는 동적 평형이에요." },
];

function ClassIn() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const addRecord = useStore((s) => s.addRecord);
  const openInbox = useStore((s) => s.openInbox);
  const { quiz, quizNos } = useWhale();
  // 반마다 처음 연 순간의 '기록이 가장 적은 학생'을 고정한다 (보내도 순서가 흔들리지 않게)
  const nos = quizNos[cls] || fewestNos(doc, cls, QUIZ.length);
  useEffect(() => { if (cls && !quizNos[cls]) useWhale.setState((x) => ({ quizNos: { ...x.quizNos, [cls]: nos } })); }, [cls]);
  const items = QUIZ.map((q, i) => ({ ...q, no: nos[i] })).filter((q) => q.no);
  const count = (no: number) => doc.records.filter((r) => r.class === cls && r.no === no && r.status !== "skipped").length;
  const send = (q: typeof items[number]) => {
    const t = nowIso();
    const rec = addRecord({ class: cls, no: q.no, category: CATEGORY_NONE, time: t, lesson: lessonFor(doc.settings.progress, cls, t), memo: `웨일 클래스 퀴즈 · ${q.kind}: “${q.text}”`, voiceMemo: null, note: "", status: "pending", source: "suggestion" });
    useWhale.setState((s) => ({ quiz: { ...s.quiz, [whaleKey(cls, q.no)]: rec.id } }));
  };
  const sent = Object.entries(quiz).filter(([k, v]) => v !== "no" && k.startsWith(`${cls}|`)).map(([, v]) => v);
  return (
    <>
      <Frame title="웨일 클래스 · 오늘 확인 퀴즈 응답">
        <div className="wt-sub">{cls} 제출 가운데 누가 기록이 가장 적은 학생의 응답부터 보여요 · 지금 기록 0건 {zeroCount(doc, cls)}명</div>
        {items.map((q) => {
          const s = quiz[whaleKey(cls, q.no)];
          return (
            <div key={q.no} className={`wt-quiz ${s ? "done" : ""}`}>
              <div className="flex wrap"><b className="num">{q.no}</b><b>{studentName(doc, cls, q.no)}</b><span className="wt-sub">누가 기록 {count(q.no)}건</span><span className="grow" /><span className="chip outline">{q.kind}</span></div>
              <div className="wt-quote">“{q.text}”</div>
              {s === "no" ? <div className="wt-sub">넘겼어요. 기록으로 남지 않아요.</div>
                : s ? <div className="wt-okline">근거 후보로 보냈어요 · 쉬는 시간 기록에서 한 줄로</div>
                : <div className="flex"><button className="btn sm primary" onClick={() => send(q)}>근거 후보로 보내기</button><button className="btn sm ghost" onClick={() => useWhale.setState((x) => ({ quiz: { ...x.quiz, [whaleKey(cls, q.no)]: "no" } }))}>넘기기</button></div>}
            </div>
          );
        })}
      </Frame>
      <div className="wt-act wt-dark">
        <button className="btn primary" disabled={!sent.length} onClick={() => openInbox({ records: sent })}>쉬는 시간 기록 열기</button>
        <span className="wt-sub">근거 후보는 '보완 대기'로 들어와요. 선생님이 분류와 한 줄로 남겨야 생기부 근거가 돼요 (학생 글을 그대로 쓰지 않아요).</span>
      </div>
      <Real text="자동 연결 전에도: 웨일 클래스 화면 옆 사이드바 누가에서 번호를 누르고 응답을 메모에 붙여 넣으면 같은 쉬는 시간 기록으로 와요." />
    </>
  );
}

function ClassOut() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const toast = useStore((s) => s.toast);
  const { fb, watchAt, quiz } = useWhale();
  const card = useMemo(() => currentCard(doc, cls), [doc.records, cls, fb, quiz]);
  if (!card) return <div className="wt-sub">이 반에 피드백 쪽지를 만들 기록이 없어요.</div>;
  const sentKey = quiz[whaleKey(card.cls, card.no)];
  const fromQuiz = !!sentKey && sentKey !== "no";
  const name = studentName(doc, card.cls, card.no);
  const text = `${card.good}\n다음 도전: ${card.next}`;
  const closed = !!watchAt && doc.records.some((r) => r.class === card.cls && r.no === card.no && r.createdAt >= watchAt && r.status === "confirmed");
  const stage = fb === "idle" ? 0 : fb === "pasted" ? 1 : closed ? 3 : 2;
  const paste = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    useWhale.setState({ fb: "pasted", card });
    toast({ text: "쪽지를 복사했어요 · 웨일 클래스 성적 노트의 텍스트 칸에 붙여 넣어요" });
  };
  const body = <><div className="good">{card.good}</div><div className="next"><b>다음 도전</b> {card.next}</div></>;
  // 성적 노트 표: 그 학생 칸과 앞뒤 번호 한 칸씩 (다른 학생 칸은 비워 둔다)
  const roster = studentsOf(doc, card.cls);
  const at = roster.findIndex((s) => s.no === card.no);
  const rows = roster.slice(Math.max(0, at - 1), at + 2);
  return (
    <>
      <ol className="wt-loop" aria-label="피드백 고리">{["근거", "피드백", "다음 관찰", "기록"].map((t, i) => <li key={t} className={i <= stage ? "on" : ""}>{t}</li>)}</ol>
      <Frame title={`누가 · ${card.no}번 ${name} 피드백 쪽지`} tag="웨일 모드 데모 · 데모 기록">
        <div className="wt-card">{body}</div>
        <div className="wt-note">{fromQuiz ? "들어옴에서 보낸 응답에 선생님이 남긴 한 줄로 만들었어요. " : `선생님 기록 ${card.evidence.length}건으로 만들었어요. 들어옴에서 보낸 응답을 쉬는 시간 기록에서 한 줄로 남기면 그 학생 쪽지가 돼요. `}쪽지에는 반 · 번호 · 이름이 없어요.</div>
        {fb === "idle" && <button className="btn primary" onClick={paste}>복사해서 성적 노트에 붙여 넣기</button>}
      </Frame>
      {fb !== "idle" && (
        <>
          <Frame title={`웨일 클래스 · 교무수첩 성적 노트 · ${card.cls}`}>
            <table className="wt-file note">
              <thead><tr><th>번호</th><th>이름</th><th>선생님 한마디 <small>텍스트 · 학생 공개 · 점수 아님</small></th></tr></thead>
              <tbody>
                {rows.map((s) => s.no === card.no
                  ? <tr key={s.no} className="hit"><td>{s.no}</td><td>{name}</td><td>{card.good.slice(0, 34)}…</td></tr>
                  : <tr key={s.no} className="off"><td>{s.no}</td><td>{s.name}</td><td /></tr>)}
              </tbody>
            </table>
          </Frame>
          <Frame title="학생이 보는 웨일 클래스">
            <div className="wt-phone">
              <div className="wt-noti"><b>성적 노트 · 선생님 한마디</b><span>{doc.settings.school.subject.replace(/ · 웨일 데모$/, "")}</span></div>
              <div className="wt-card">{body}</div>
            </div>
            <div className="wt-sub">학생은 성적 노트에서 자기 칸만 봐요.</div>
          </Frame>
        </>
      )}
      {fb === "pasted" && (
        <div className="wt-act wt-dark">
          <button className="btn primary" onClick={() => useWhale.setState({ fb: "watch", watchAt: nowIso(), detailOpen: true })}>다음 수업에 {card.no}번 눈여겨보기</button>
          <span className="wt-sub">'다음 도전'을 했는지 보고 기록 창에 한 줄 남기면 고리가 닫혀요.</span>
        </div>
      )}
      {fb === "watch" && (
        <div className="wt-call wt-dark">
          <b>{card.no}번 {name}{josaIGa(name)} '{card.next}'에 도전해요</b>
          {closed ? <span>✓ 다음 관찰을 기록했어요 · 근거 → 피드백 → 관찰 → 기록이 한 바퀴 돌았어요</span>
            : <><span>도전한 장면을 기록 창에 한 줄 남기면 고리가 닫혀요.</span><button className="btn sm primary" onClick={() => useWhale.setState({ detailOpen: true })}>{card.no}번 기록 창 열기</button></>}
        </div>
      )}
    </>
  );
}

/* ---------- 03 팀보드 ---------- */

/** 클래스 전용 팀보드의 한 모둠 보드 (합성). a = 작성자 자리(반 명단에서 고른 학생) */
const BOARD = [
  { a: 0, c: "y", text: "농도 바꾸는 실험은 우리 모둠, 온도는 3모둠이 맡기로 나눠요" },
  { a: 1, c: "p", text: "색 변화가 잘 보이게 0초 · 30초 · 1분에 사진 찍기" },
  { a: 2, c: "g", text: "30초 간격이면 평형이 다시 맞춰지는 것도 보일 것 같아요 (사진 순서에 이어서)" },
  { a: 0, c: "y", text: "결과 표는 제가 정리할게요" },
  { a: 3, c: "b", text: "촉매를 넣으면 색이 바로 변해야 하나요?" },
];
const AUTHOR_AT = [3, 8, 14, 20];

function SceneBoard() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const addRecord = useStore((s) => s.addRecord);
  const openInbox = useStore((s) => s.openInbox);
  const { byAuthor, board } = useWhale();
  const roster = studentsOf(doc, cls);
  const authors = AUTHOR_AT.map((i) => roster[i] || roster[i % Math.max(1, roster.length)]).filter(Boolean);
  const coop = (doc.settings.categories.find((c) => /협동|협력|협업/.test(c.label))?.key ?? 3) as Category;
  const send = (a: number) => {
    const s = authors[a]; const notes = BOARD.filter((n) => n.a === a).map((n) => `“${n.text}”`);
    const t = nowIso();
    const rec = addRecord({ class: cls, no: s.no, category: coop, time: t, lesson: lessonFor(doc.settings.progress, cls, t), memo: `팀보드 · 3모둠 노트: ${notes.join(" ")}`, voiceMemo: null, note: "", status: "pending", source: "suggestion" });
    useWhale.setState((x) => ({ board: { ...x.board, [whaleKey(cls, s.no)]: rec.id } }));
  };
  const sent = Object.entries(board).filter(([k]) => k.startsWith(`${cls}|`)).map(([, v]) => v);
  if (!authors.length) return <div className="wt-sub">이 반에 명단이 없어요.</div>;
  return (
    <>
      <Frame title="팀보드 · 3모둠 · 평형 이동 실험 설계">
        <div className="seg wt-seg" role="radiogroup" aria-label="보드 보기">
          <button role="radio" aria-checked={!byAuthor} className={!byAuthor ? "active" : ""} onClick={() => useWhale.setState({ byAuthor: false })}>보드</button>
          <button role="radio" aria-checked={byAuthor} className={byAuthor ? "active" : ""} onClick={() => useWhale.setState({ byAuthor: true })}>작성자별로 분류</button>
        </div>
        {!byAuthor ? (
          <div className="wt-board">
            {BOARD.map((n, i) => <div key={i} className={`wt-sticky ${n.c}`}><span>{n.text}</span><small>{authors[n.a]?.name}</small></div>)}
            <div className="wt-sticky group"><span>모둠 결과: 실험 설계안 완성</span><small>모둠 결과물 · 개인 근거로 보내지 않아요</small></div>
          </div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            {authors.map((s, a) => {
              const mine = BOARD.filter((n) => n.a === a);
              return (
                <div key={s.no} className={`wt-quiz ${board[whaleKey(cls, s.no)] ? "done" : ""}`}>
                  <div className="flex wrap"><b className="num">{s.no}</b><b>{s.name}</b><span className="wt-sub">노트 {mine.length}개</span><span className="grow" /><span className="chip outline">협동</span></div>
                  {mine.map((n, i) => <div key={i} className="wt-quote">“{n.text}”</div>)}
                  {board[whaleKey(cls, s.no)] ? <div className="wt-okline">협동 근거 후보로 보냈어요</div>
                    : <div className="flex"><button className="btn sm primary" onClick={() => send(a)}>협동 근거 후보로</button></div>}
                </div>
              );
            })}
          </div>
        )}
        <div className="wt-note">스티키 노트에는 작성자 이름이 붙어요. 누가로 오는 건 노트 글과 그 학생 번호뿐이에요.</div>
      </Frame>
      <div className="wt-act wt-dark">
        <button className="btn primary" disabled={!sent.length} onClick={() => openInbox({ records: sent })}>쉬는 시간 기록 열기</button>
        <span className="wt-sub">노트를 보고 그 학생이 한 일을 선생님이 한 줄로 남겨야 생기부 근거가 돼요.</span>
      </div>
      <Real text="자동 연결 전에도: 팀보드를 띄운 채 사이드바 누가에서 번호를 누르고 한 줄 남겨요." />
    </>
  );
}

/* ---------- 04 웨일 브라우저 ---------- */

function SceneSide() {
  const cls = useStore((s) => s.cls);
  return (
    <>
      <Frame title="웨일 화면 · 메인 탭 + 사이드바" tag="그림 · 실제로 열기는 아래">
        <div className="wt-dual">
          <div className="pane neis"><span className="wt-sub">메인 탭 · 보던 그대로</span><b>수업관리</b><b>웨일 클래스</b><b>팀보드</b><i /><i className="short" /></div>
          <div className="pane nuga"><span className="who">사이드바 · 누가</span><span>{cls} · 지금 수업</span><span className="wt-reel" aria-hidden><i>13</i><i className="on">14</i><i>15</i></span><span className="chip pass">저장 · 14번</span></div>
        </div>
      </Frame>
      {IS_WHALE
        ? <Real text="누가 모바일 화면(번호 릴)을 웨일 사이드바에 띄워요. 저장하면 왼쪽 큰 창에 '사이드바 기록 · 미반영에 추가' 알림이 떠요."><button className="btn sm" onClick={openWhaleSidebar}>사이드바로 열기</button></Real>
        : isTauri ? <Real text="웨일 브라우저에서 누가 웹을 열면 이 모바일 화면(번호 릴)을 사이드바에 띄우고, 저장한 기록이 큰 창 미반영으로 바로 들어와요." />
        : <Real text="웨일에서는 사이드바로 열려요. 여기서는 같은 화면을 사이드바 폭의 작은 창으로 열어 볼 수 있어요. 저장하면 왼쪽 큰 창에 알림이 떠요."><button className="btn sm" onClick={openSidePreview}>작은 창으로 열어 보기</button></Real>}
    </>
  );
}

function SceneDraft() {
  const sel = useStore((s) => s.selected);
  const doc = useStore((s) => s.doc);
  return (
    <>
      <Frame title="웨일 듀얼탭 · 나이스 옆 누가" tag="그림 · 실제로 열기는 아래">
        <div className="wt-dual">
          <div className="pane neis"><span className="wt-sub">업무포털 · 나이스</span><b>세부능력 및 특기사항</b><i /><i /><i className="short" /></div>
          <div className="pane nuga"><span className="who">누가 · 생기부 생성</span><span>{sel ? `${sel.class} · ${sel.no}번 ${studentName(doc, sel.class, sel.no)}` : "학생 선택"}</span><span>근거 기록 · 초안 · 검토</span><span className="chip pass">복사 → 붙여 넣기</span></div>
        </div>
      </Frame>
      {IS_WHALE && sel
        ? <Real text="생기부 생성 화면을 듀얼탭으로 열어요. 옆 칸에 업무포털(나이스)을 띄워 나란히 써요 (웨일 5.39에서 확인)."><a className="btn sm" href={draftTabUrl(sel.class, sel.no)} rel="whale-dualtab">듀얼탭으로 열기</a></Real>
        : <Real text="웨일 브라우저에서는 이 화면을 듀얼탭으로 열어, 옆 칸에 업무포털(나이스)을 띄워 나란히 쓸 수 있어요 (웨일 5.39에서 확인)." />}
    </>
  );
}

/* ---------- 서비스 ---------- */

interface Link { from: string; to: string; via: string; st: St }
interface Svc {
  tab: string; name: string; title: string; lead?: string;
  links: Link[]; before: string; after: string; fit: string;
  /** 탭 안 단계: 단계마다 왼쪽 화면이 바뀐다 */
  subs?: string[]; Bodies: (() => React.ReactElement)[]; enter(sub: number): void;
}
/** 데모의 기본 반(기록이 있는 반)으로 돌아와 현황판 */
const toMain = () => { const s = st(); s.setClass(mainClass(s.doc)); s.setPage("main"); };

const SVCS: Svc[] = [
  { tab: "한눈에", name: "한눈에", title: "누가와 딱 맞는 네 곳만 이어요",
    lead: "선생님과 학생이 웨일 스페이스에서 이미 쓰는 서비스 네 곳과 이렇게 이어요. 연결마다 지금 되는 것과 승인·협의 전인 것을 칩으로 나눴어요. 줄을 누르면 데모로 직접 해 봐요.",
    links: [], before: "", after: "", fit: "", Bodies: [], enter: toMain },
  { tab: "스페이스", name: "웨일 스페이스", title: "학교 계정 그대로, 명단도 학교 것 그대로",
    links: [
      { from: "관리자 '사용자 다운로드' 명단 파일", to: "반·명단 [엑셀 가져오기]", via: "학생 행 · 고른 반만 · 이메일은 읽지 않음", st: "now" },
      { from: "웨일 스페이스로 로그인", to: "처음 설정", via: "선생님 본인 · 소속 학교 → 학교급 기본값 (App Console)", st: "plan" },
      { from: "관리자 정책 · 앱 및 확장앱", to: "선생님들의 웨일", via: "학교 단위로 누가를 한 번에 설치", st: "plan" },
    ],
    before: "반마다 명단을 누가 양식에 옮겨 적거나 붙여 넣어요. 번호가 학교 명단과 어긋나기도 해요.",
    after: "학교가 관리하는 웨일 스페이스 명단 파일을 고치지 않고 넣으면 고른 반 학생만 들어와요. 번호도 학교 명단과 같아요.",
    fit: "누가는 반 · 번호만 있으면 바로 돌아가요. 명단은 학교 것을 그대로 쓰고, 이름은 선생님 PC에만 둬요.",
    Bodies: [SceneSpace],
    enter() { const s = st(); s.setClass(useWhale.getState().roster ? ROSTER_CLASS : mainClass(s.doc)); s.setSettingsTab("roster"); s.setPage("settings"); } },
  { tab: "클래스", name: "웨일 클래스", title: "학생 응답은 근거 후보로, 피드백은 성적 노트로",
    links: [
      { from: "퀴즈 · 과제 응답", to: "쉬는 시간 기록 (근거 후보)", via: "응답 글과 번호만 · 선생님이 한 줄로 남겨야 기록", st: "plan" },
      { from: "누가 피드백 쪽지", to: "교무수첩 성적 노트 (학생 공개 텍스트 칸)", via: "잘한 장면 · 다음 도전 · 지금은 웨일 모드 데모에서 복사", st: "plan" },
    ],
    before: "말이 적은 학생은 수업 중 관찰 기록이 비어요. 피드백은 학기 말 생기부에서야 글이 돼요.",
    after: "퀴즈에 글로 남긴 생각을 선생님이 한 줄로 남기면 근거가 되고, 그 근거로 만든 피드백이 학생이 여는 웨일 클래스에 남아요.",
    fit: "녹음 속 놓친 발언 추천과 같은 '추천 → 선생님 확인' 구조예요. 누가는 응답에 점수를 매기지 않아요.",
    subs: ["들어옴 · 퀴즈 응답", "나감 · 피드백 쪽지"], Bodies: [ClassIn, ClassOut],
    enter: toMain },
  { tab: "팀보드", name: "팀보드", title: "모둠 보드에서 그 학생의 몫만 협동 근거로",
    links: [
      { from: "클래스 전용 팀보드 · 작성자별 노트", to: "그 학생의 '협동' 근거 후보", via: "노트 글과 작성자 번호만 · 모둠 결과물은 보내지 않음", st: "plan" },
      { from: "팀보드를 띄운 화면", to: "사이드바 누가", via: "보드를 보며 번호 + 한 줄", st: "real" },
    ],
    before: "여러 모둠을 한꺼번에 볼 수 없어 '모둠이 잘함'으로 뭉뚱그려지기 쉬워요.",
    after: "노트마다 작성자가 붙어 있어, 그 학생이 낸 의견만 그 학생의 근거 후보가 돼요. 모둠 결과물은 보내지 않아요.",
    fit: "생기부는 공동 활동의 성과를 학생 개인의 성과로 바꾸지 않아요. 누가 AI 초안 지침에도 이 규칙이 들어 있어요.",
    Bodies: [SceneBoard], enter: toMain },
  { tab: "브라우저", name: "웨일 브라우저", title: "어느 웨일 화면 옆에서도 기록, 나이스 옆에서 생기부",
    links: [
      { from: "웨일 사이드바", to: "누가 모바일 화면 (번호 릴)", via: "수업관리 · 웨일 클래스 · 팀보드를 보던 그대로 · 큰 창 미반영으로", st: "real" },
      { from: "웨일 듀얼탭", to: "누가 생기부 생성 | 업무포털 나이스", via: "한 학기 근거를 옆에 두고 복사 → 붙여 넣기", st: "real" },
    ],
    before: "기록하려면 폰을 꺼내거나 창을 바꿔 번호를 찾아요. 학기 말엔 학생마다 나이스와 기록 창을 오가요.",
    after: "보던 화면을 떠나지 않고 번호만 눌러 저장해요. 생기부는 한 화면에 나란히 두고 써요.",
    fit: "승인 없이 지금 웨일에서 되는 연결이에요. 데이터는 선생님 브라우저 안에서만 오가요.",
    subs: ["수업 중 · 사이드바", "학기 말 · 듀얼탭"], Bodies: [SceneSide, SceneDraft],
    enter(sub) {
      toMain();
      if (sub !== 1) return;
      const s = st(); const card = currentCard(s.doc, s.cls);
      if (card) { s.setClass(card.cls); s.select({ class: card.cls, no: card.no }); }
      s.setMode2p("individual"); s.setPage("draft");
    } },
];

/** 오른쪽 밤의 칸 (좁은 화면에서는 아래 시트). 접으면 오른쪽 아래 알약 */
export function WhaleTour() {
  const { on, busy, step, sub, min, detailOpen } = useWhale();
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
  const sv = SVCS[step];
  const subs = sv.subs?.length || 1;
  const go = (i: number, k = 0) => { const n = Math.max(0, Math.min(SVCS.length - 1, i)); useWhale.setState({ step: n, sub: k }); SVCS[n].enter(k); };
  const next = () => (sub < subs - 1 ? go(step, sub + 1) : go(step + 1));
  const prev = () => (sub > 0 ? go(step, sub - 1) : go(step - 1, (SVCS[step - 1]?.subs?.length || 1) - 1));
  const last = step === SVCS.length - 1 && sub === subs - 1;
  const nextLabel = sub < subs - 1 ? sv.subs![sub + 1].split(" · ")[0] : SVCS[step + 1]?.name;
  const card = step === 2 ? currentCard(doc, useStore.getState().cls) : null;
  const detailStudent = card ? doc.students.find((s) => s.class === card.cls && s.no === card.no) : undefined;
  const back = FROM[whaleFrom() || ""];
  const Body = sv.Bodies[sub];
  if (min) return <button className="wt-pill" onClick={() => useWhale.setState({ min: false })}><img className="wt-logo" src={whaleLogo} alt="" />웨일 연계 {pad(step)} · {sv.name}</button>;
  // 학생 기록 창(모달)은 칸 밖에 그린다: 칸의 흐림(backdrop-filter)이 모달 덮개를 칸 안에 가두지 않게
  return (
    <>
    <aside className="whale-tour" aria-label="웨일 연계 둘러보기">
      <div className="wt-h wt-dark">
        <img className="wt-logo" src={whaleLogo} alt="" />
        <b className="grow">웨일 × 누가 · 서비스별 연계</b>
        {back && <a className="btn ghost sm" href={back.href}>← {back.label}</a>}
        <button className="btn ghost sm icon" onClick={() => useWhale.setState({ min: true })} aria-label="접기" title="접기">–</button>
      </div>
      <ol className="wt-steps">
        {SVCS.map((s, i) => (
          <li key={s.tab}><button className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}><b>{pad(i)}</b>{s.tab}</button></li>
        ))}
      </ol>
      <div className="wt-b" key={step}>
        <div className="wt-idx">{pad(step)} · {sv.name}</div>
        <h2>{sv.title}</h2>
        {sv.lead && <p className="wt-lead">{sv.lead}</p>}
        {step === 0 ? <SceneMap go={go} /> : (
          <>
            <section className="wt-sec" aria-label="연결">
              <h3>연결</h3>
              <ul className="wt-links">
                {sv.links.map((l) => (
                  <li key={l.from}><span className={`dot ${l.st}`} aria-hidden /><span className="grow"><span className="ft"><b>{l.from}</b> → <b>{l.to}</b></span><small>{l.via}</small><Chip st={l.st} /></span></li>
                ))}
              </ul>
            </section>
            <section className="wt-sec" aria-label="가치">
              <h3>가치</h3>
              <div className="wt-ba"><div><i>전</i>{sv.before}</div><div className="after"><i>후</i>{sv.after}</div></div>
            </section>
            <section className="wt-sec" aria-label="해 보기">
              <h3>해 보기</h3>
              {sv.subs && (
                <div className="seg wt-seg" role="tablist" aria-label={`${sv.name} 단계`}>
                  {sv.subs.map((t, k) => <button key={t} role="tab" aria-selected={k === sub} className={k === sub ? "active" : ""} onClick={() => go(step, k)}>{t}</button>)}
                </div>
              )}
              <Body key={sub} />
            </section>
            <p className="wt-why"><b>왜 누가와 딱 맞나</b> {sv.fit}</p>
          </>
        )}
      </div>
      <div className="wt-f wt-dark">
        <button className="btn" disabled={step === 0 && sub === 0} onClick={prev}>이전</button>
        <span className="grow" />
        {!last
          ? <button className="btn primary" onClick={next}>다음 · {nextLabel}</button>
          : <button className="btn primary" disabled={busy} onClick={() => void exitWhale()}>웨일 모드 끝내기</button>}
      </div>
    </aside>
    {detailOpen && detailStudent && <StudentDetail student={detailStudent} compose onClose={() => useWhale.setState({ detailOpen: false })} />}
    </>
  );
}
