import React, { useEffect, useMemo, useState } from "react";
import { SCHOOL_PRESETS, applySchoolPreset, classSortKey, isSchoolRoster, parseRosterLines, studentsFromRows, type SchoolLevel, type Student } from "@nuga/core";
import { useStore } from "../store";
import { ONB_DIRECT, startDemo } from "../lib/demo";
import { readSheetRows } from "../lib/excel";
import { pickFile } from "../lib/platform";
import { openLogin } from "../components/LoginModal";
import { TimetableSection } from "./SettingsPage";

/**
 * 첫 실행: [데모로 둘러보기] 또는 [내 반으로 시작하기].
 * 내 반으로 시작하기는 3단계, 약 2분: ① 학교급·과목 ② 반·명단(붙여넣기·엑셀·번호만) ③ 시간표(선택).
 * 진도표·작성 항목·분량·AI 같은 나머지는 설정에서 언제든 (처음에는 묻지 않는다).
 * 데모 화면의 [내 반으로 시작하기]로 오면 첫 화면 없이 ①부터 연다 (ONB_DIRECT).
 */
const STEPS = ["학교급·과목", "반·명단", "시간표"];
const LEVELS: { lv: SchoolLevel; hint: string }[] = [
  { lv: "elem", hint: "담임 · 한 반, 여러 교과" },
  { lv: "middle", hint: "교과 · 한 과목, 여러 반" },
  { lv: "high", hint: "교과 · 선택과목 포함" },
];

/** 반 하나 (②에서 고치는 동안은 이 화면 안에만 두고, [다음]에서 한 번에 넣는다) */
interface ClassDraft { cls: string; text: string; size: string }
const normCls = (c: string) => { const t = c.trim().replace(/\s+/g, " "); return /^\d+\s*-\s*\d+$/.test(t) ? t.split("-").map((x) => String(parseInt(x, 10))).join("-") : t; };
const toText = (list: Student[]) => list.sort((a, b) => a.no - b.no).map((s) => `${s.no} ${s.name}`).join("\n");

/** 데모 띠에서 왔나 (읽기만. 지우기는 화면을 그린 뒤 — 개발 모드는 초기값 함수를 두 번 부른다) */
function direct(): boolean { try { return sessionStorage.getItem(ONB_DIRECT) === "1"; } catch { return false; } }

export function Onboarding() {
  const setSettings = useStore((s) => s.setSettings);
  const setPage = useStore((s) => s.setPage);
  const [step, setStep] = useState<number>(() => (direct() ? 0 : -1));
  useEffect(() => { try { sessionStorage.removeItem(ONB_DIRECT); } catch { /* 없음 */ } }, []);

  if (step < 0) return <Intro onStart={() => setStep(0)} onDemo={async () => { await startDemo(); setSettings({ onboarded: true }); setPage("today"); }} />;

  const finish = () => {
    setSettings({ onboarded: true });
    setPage("main");
    useStore.getState().toast({ text: "준비 끝! 진도표·작성 항목·AI는 설정에서 언제든 넣을 수 있어요", kind: "notice", ttl: 6000 });
  };
  return (
    <div className="onb onb-setup">
      <div className="box">
        <div className="onb-head">
          <ol className="steps" aria-label="처음 설정 단계">{STEPS.map((s, i) => <React.Fragment key={s}><li className={`s ${i < step ? "done" : i === step ? "cur" : ""}`} aria-current={i === step ? "step" : undefined}>{i < step ? "✓" : i + 1}</li><span className={i === step ? "" : "muted small"}>{s}{i === 2 && <small className="muted"> (선택)</small>}</span>{i < STEPS.length - 1 && <span className="l" />}</React.Fragment>)}</ol>
          <span className="muted small">약 2분 · 모두 나중에 설정에서 바꿀 수 있어요</span>
        </div>
        {step === 0 && <StepSubject onBack={() => setStep(-1)} onNext={() => setStep(1)} />}
        {step === 1 && <StepRoster onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {step === 2 && (
          <>
            <div className="onb-q"><h2>시간표를 넣어 둘까요?</h2><p>넣어 두면 수업 시간에 폰·모바일 화면이 그 반을 먼저 띄워 번호만 누르면 돼요. 지금 건너뛰고 나중에 <b>설정 → 시간표</b>에서 해도 돼요.</p></div>
            <div className="settings-body onb-tt"><TimetableSection /></div>
            <div className="onb-nav"><button className="btn" onClick={() => setStep(1)}>이전</button><span className="grow" /><button className="btn ghost" onClick={finish}>건너뛰기</button><button className="btn primary lg" onClick={finish}>시작하기</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 첫 화면 ---------- */
function Intro({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="onb hero-dark">
      <div className="box">
        <div>
          <div className="onb-brand"><svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 26h9v-8h8v-8h9" /><circle cx="29" cy="10" r="1.8" fill="#DCEBFF" /></svg>누가<span className="brand-en">NUGA</span></div>
          <div className="eyebrow">학생의 다음 한 걸음을 위한 기록</div>
          <h1 className="onb-title">좋은 기록이,<br />성장의 다음<br /><em>발판이 됩니다.</em></h1>
          <p className="onb-lead">수업 중 10초 기록 · 쉬는 시간 1분 보완 · 학기 말 세특 초안.<br />교사의 관찰이 학생의 성장으로 이어지도록, 누가가 돕습니다.</p>
          <div className="onb-ctas">
            <button className="onb-cta main" onClick={onStart}><b>내 반으로 시작하기</b><span>학교급·과목 → 반·명단 → 시간표(선택). 약 2분</span></button>
            <button className="onb-cta" onClick={onDemo}><b>데모로 둘러보기</b><span>합성 데이터(화학Ⅰ · 2개 반 · 한 학기 기록)로 먼저 구경해요. 둘러본 뒤 화면 위 [내 반으로 시작하기]로 바로 넘어갈 수 있어요</span></button>
          </div>
          <button className="onb-login" onClick={openLogin}>폰이나 PC에서 로그인해서 연결하기 →</button>
          <div className="onb-note">학생 이름은 이 PC에만 저장됩니다. 워치·폰·서버에는 반·번호만 오갑니다.</div>
        </div>
        <div className="onb-stairs" aria-hidden="true">
          <div className="onb-step s1"><em className="idx">01</em>수업 중 질문<small className="dots" aria-hidden><i /><i /><i /></small></div>
          <div className="onb-step s2"><em className="idx">02</em>수업 중 발표<small className="dots" aria-hidden><i /><i /><i /></small></div>
          <div className="onb-step s3"><em className="idx">03</em>모둠 협동<small className="dots" aria-hidden><i /><i /><i /></small></div>
          <div className="onb-step s4"><em className="idx">04</em>교사의 피드백<small className="dots" aria-hidden><i /><i /><i /></small></div>
          <div className="onb-caption">관찰의 기록 — 교사의 피드백 — 학생의 성장</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- ① 학교급 · 과목 ---------- */
function StepSubject({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  const areaId = useStore((x) => x.areaId);
  const renameArea = useStore((x) => x.renameArea);
  const [subject, setSubject] = useState(s.school.subject);
  const elem = s.schoolLevel === "elem";
  const grades = elem ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
  const ok = !!s.schoolLevel && !!subject.trim();
  const next = () => {
    if (!ok) return;
    renameArea(areaId, subject.trim()); // 위쪽 영역 칸과 과목 이름을 같이
    onNext();
  };
  return (
    <>
      <div className="onb-q"><h2>어느 학교에서, 무엇을 기록하나요?</h2><p>학교급에 맞춰 기록 분류·생기부 항목·분량이 정해져요.</p></div>
      <div className="card pad onb-card">
        <div className="onb-label">학교급</div>
        <div className="onb-levels" role="radiogroup" aria-label="학교급">
          {LEVELS.map(({ lv, hint }) => (
            <button key={lv} type="button" role="radio" aria-checked={s.schoolLevel === lv} className={`level-card ${s.schoolLevel === lv ? "active" : ""}`}
              onClick={() => setSettings((x) => { const y = applySchoolPreset(x, lv); if (lv !== "elem" && y.school.grade > 3) y.school = { ...y.school, grade: 3 }; return y; })}>
              <b>{SCHOOL_PRESETS[lv].label}</b><span>{hint}</span>
            </button>
          ))}
        </div>
        <div className="onb-row">
          <label className="field grow"><span className="onb-label">{elem ? "학급·영역 이름" : "과목·영역 이름"}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} placeholder={elem ? "예: 4학년 3반" : "예: 과학 · 화학Ⅰ · 과학동아리"} autoFocus />
          </label>
          <label className="field"><span className="onb-label">학년</span>
            <select className="select" value={s.school.grade} onChange={(e) => setSettings((x) => ({ ...x, school: { ...x.school, grade: Number(e.target.value) } }))}>{grades.map((g) => <option key={g} value={g}>{g}학년</option>)}</select>
          </label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>{s.school.year}학년도 {s.school.semester}학기로 시작해요. 동아리·행동특성처럼 따로 관리할 것은 나중에 위쪽 [+]로 영역을 더하면 돼요.</p>
      </div>
      <div className="onb-nav"><button className="btn" onClick={onBack}>처음 화면</button><span className="grow" />{!ok && <span className="muted small">{!s.schoolLevel ? "학교급을 골라 주세요" : "이름을 적어 주세요"}</span>}<button className="btn primary lg" disabled={!ok} onClick={next}>다음</button></div>
    </>
  );
}

/* ---------- ② 반 · 명단 ---------- */
function StepRoster({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const doc = useStore((x) => x.doc);
  const setSettings = useStore((x) => x.setSettings);
  const setStudents = useStore((x) => x.setStudents);
  const toast = useStore((x) => x.toast);
  const elem = doc.settings.schoolLevel === "elem";
  const [rows, setRows] = useState<ClassDraft[]>(() => {
    const have = doc.settings.classes.map((c) => ({ cls: c.class, text: toText(doc.students.filter((s) => s.class === c.class)), size: c.size ? String(c.size) : "" }));
    return have.length ? have : [{ cls: "", text: "", size: "" }];
  });
  const parsed = useMemo(() => rows.map((r) => parseRosterLines(r.text, normCls(r.cls))), [rows]);
  const set = (i: number, p: Partial<ClassDraft>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const names = (cs: string) => normCls(cs);
  const dup = rows.map((r) => names(r.cls)).find((c, i, a) => c && a.indexOf(c) !== i);
  const ready = rows.filter((r, i) => names(r.cls) && (parsed[i].length > 0 || Number(r.size) > 0));
  const ok = ready.length > 0 && !dup && rows.every((r, i) => !r.text.trim() || names(r.cls) || !parsed[i].length);

  /** 엑셀(웨일 스페이스 명단 포함): 이 반 학생만 글 칸에 채운다. 반 이름이 비었고 파일에 반이 하나면 그 반으로 */
  const fromExcel = async (i: number) => {
    const [f] = await pickFile(".xlsx,.xls,.csv"); if (!f) return;
    const sheet = await readSheetRows(f, true);
    let cls = names(rows[i].cls);
    let st = studentsFromRows(sheet, cls || undefined);
    const classes = [...new Set(st.map((s) => s.class))];
    if (!cls && classes.length === 1) cls = classes[0];
    if (cls) st = st.filter((s) => s.class === cls);
    else if (classes.length > 1) { toast({ text: `이 파일에 반이 ${classes.length}개 있어요 (${classes.slice(0, 4).join(", ")}…). 반 이름을 먼저 적어 주세요` }); return; }
    if (isSchoolRoster(sheet) && !st.length) { toast({ text: `이 파일에 ${cls} 학생이 없어요` }); return; }
    if (!st.length) { toast({ text: "학생을 찾지 못했어요 (열: 반·번호·이름 또는 학번·이름)" }); return; }
    set(i, { cls, text: toText(st) });
    toast({ text: `${cls} ${st.length}명을 가져왔어요` });
  };

  const next = () => {
    if (!ok) return;
    const keep = rows.map((r, i) => ({ cls: names(r.cls), list: parsed[i], size: Number(r.size) || 0 })).filter((r) => r.cls && (r.list.length || r.size));
    const mine = new Set(keep.map((r) => r.cls));
    // 명단을 먼저 넣고(이때 반 목록이 명단 기준으로 다시 만들어진다) 그다음 반 목록을 정한다: 번호만 쓰는 반도 남게
    setStudents(keep.flatMap((r) => r.list).sort((a, b) => classSortKey(a.class) - classSortKey(b.class) || a.no - b.no));
    setSettings((s) => ({
      ...s,
      classes: keep.map((r) => ({ class: r.cls, size: Math.max(r.size, ...r.list.map((x) => x.no), 0) })).sort((a, b) => classSortKey(a.class) - classSortKey(b.class)),
      timetable: s.timetable.filter((t) => mine.has(t.class)),
    }));
    useStore.getState().setClass([...mine].sort((a, b) => classSortKey(a) - classSortKey(b))[0]);
    onNext();
  };

  return (
    <>
      <div className="onb-q"><h2>{elem ? "우리 반 학생을 넣어 주세요" : "가르치는 반과 학생을 넣어 주세요"}</h2><p>엑셀·한글·나이스에서 이름 열을 복사해 붙여 넣으면 돼요. 이름 없이 번호만 쓰려면 인원만 적어도 돼요.</p></div>
      {rows.map((r, i) => {
        const n = parsed[i].length;
        return (
          <div key={i} className="card pad onb-card onb-class">
            <div className="onb-row">
              <label className="field"><span className="onb-label">반 이름</span><input value={r.cls} onChange={(e) => set(i, { cls: e.target.value })} placeholder={elem ? "예: 4-3" : "예: 2-3"} autoFocus={i === rows.length - 1 && !r.cls} /></label>
              <span className="grow" />
              <button type="button" className="btn sm" onClick={() => void fromExcel(i)}>엑셀 파일에서 가져오기</button>
              {rows.length > 1 && <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>이 반 빼기</button>}
            </div>
            <div className="onb-paste">
              <label className="field grow"><span className="onb-label">학생 이름 <small className="muted">한 줄에 한 명 · 번호를 앞에 붙여도 돼요</small></span>
                <textarea rows={7} value={r.text} onChange={(e) => set(i, { text: e.target.value })} placeholder={"김민준\n이서연\n박지우\n…"} />
              </label>
              <div className="onb-count">
                {n ? <><b className="num">{n}</b><span>명 인식</span><small className="muted">{parsed[i].slice(0, 3).map((s) => `${s.no} ${s.name}`).join(" · ")}{n > 3 ? " …" : ""}</small></>
                  : <><span className="muted small">이름 없이 번호만</span><label className="onb-size"><input type="number" min={1} max={60} className="num" value={r.size} onChange={(e) => set(i, { size: e.target.value })} placeholder="26" />명</label></>}
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn onb-add" onClick={() => setRows((rs) => [...rs, { cls: "", text: "", size: "" }])}>+ 반 하나 더</button>
      <div className="onb-nav"><button className="btn" onClick={onBack}>이전</button><span className="grow" />
        {dup ? <span className="small" style={{ color: "var(--warn)" }}>반 이름 {dup}이(가) 두 번 있어요</span> : !ok && <span className="muted small">반 이름과 학생(또는 인원)을 넣어 주세요</span>}
        <button className="btn primary lg" disabled={!ok} onClick={next}>다음</button></div>
    </>
  );
}
