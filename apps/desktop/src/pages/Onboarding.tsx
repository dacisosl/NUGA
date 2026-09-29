import React, { useState } from "react";
import { useStore } from "../store";
import { ProgressSection, RosterSection, SubjectSection, TimetableSection } from "./SettingsPage";

const STEPS = ["과목", "반·명단", "시간표", "진도"];

/** 첫 실행: 샘플로 둘러보기 또는 4단계 설정 */
export function Onboarding() {
  const doc = useStore((s) => s.doc);
  const loadSample = useStore((s) => s.loadSample);
  const setSettings = useStore((s) => s.setSettings);
  const setPage = useStore((s) => s.setPage);
  const [step, setStep] = useState<number>(-1);

  const finish = () => { setSettings({ onboarded: true }); setPage("records"); };
  const canNext = step === 0 ? !!doc.settings.school.subject.trim() : step === 1 ? doc.students.length > 0 : true;

  if (step < 0) {
    return (
      <div className="onb">
        <div className="box">
          <div className="flex" style={{ gap: 14, marginBottom: 16 }}><div className="logo-lg">누</div><div><h1>누가</h1><div className="muted">수업 중 10초 기록 · 수업 후 1분 보완 · 학기 말 세특 초안</div></div></div>
          <div className="hero">
            <button onClick={() => { loadSample(); setSettings({ onboarded: true }); }}><b>샘플 데이터로 둘러보기</b><span className="muted small">화학Ⅰ · 2개 반 · 기록·수행평가 포함. 나중에 설정 → 데이터에서 지울 수 있음</span></button>
            <button onClick={() => setStep(0)}><b>처음부터 설정</b><span className="muted small">과목 → 명단 → 시간표 → 진도. 4단계, 약 5분</span></button>
          </div>
          <div className="muted small" style={{ marginTop: 20 }}>학생 이름은 이 PC에만 저장됩니다. 워치·폰·서버에는 반·번호만 오갑니다.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="onb" style={{ alignItems: "flex-start" }}>
      <div className="box" style={{ width: 900 }}>
        <div className="flex between" style={{ marginBottom: 16 }}>
          <div className="steps">{STEPS.map((s, i) => <React.Fragment key={s}><span className={`s ${i < step ? "done" : i === step ? "cur" : ""}`}>{i < step ? "✓" : i + 1}</span><span className={i === step ? "" : "muted small"}>{s}</span>{i < STEPS.length - 1 && <span className="l" />}</React.Fragment>)}</div>
          <span className="flex">
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>이전</button>}
            {step < STEPS.length - 1 ? <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>다음</button> : <button className="btn primary" onClick={finish}>완료</button>}
            {step >= 2 && <button className="btn ghost" onClick={finish}>건너뛰고 시작</button>}
          </span>
        </div>
        <div className="settings-body" style={{ maxWidth: "none" }}>
          {step === 0 && <SubjectSection />}
          {step === 1 && <RosterSection />}
          {step === 2 && <TimetableSection />}
          {step === 3 && <ProgressSection />}
        </div>
      </div>
    </div>
  );
}
