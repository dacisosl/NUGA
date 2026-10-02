import React, { useState } from "react";
import { SCHOOL_PRESETS, WRITE_ITEM_LABEL, applySchoolPreset, presetLimit, type SchoolLevel } from "@nuga/core";
import { useStore } from "../store";
import { startDemo } from "../lib/demo";
import { ProgressSection, RosterSection, SubjectSection, TimetableSection } from "./SettingsPage";

const STEPS = ["학교급", "영역", "반·명단", "시간표", "진도"];

/** 1단계: 학교급을 고르면 카테고리·작성 항목·분량(바이트) 프리셋이 적용된다 */
function SchoolLevelStep() {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  return (
    <div className="card pad">
      <h3>학교급</h3>
      <div className="muted small" style={{ marginBottom: 12 }}>고른 학교급에 맞춰 기록 카테고리, 작성 항목, 기재요령 분량(NEIS 바이트), 문체 지침이 정해집니다. 모두 설정에서 바꿀 수 있습니다.</div>
      <div className="level-grid">
        {(["elem", "middle", "high"] as SchoolLevel[]).map((lv) => {
          const p = SCHOOL_PRESETS[lv];
          return (
            <button key={lv} className={`level-card big ${s.schoolLevel === lv ? "active" : ""}`} onClick={() => setSettings((x) => applySchoolPreset(x, lv))}>
              <b>{p.label}</b>
              <span>{p.userModelLabel}</span>
              <span>카테고리: {p.categories.join(" · ")}</span>
              <span>기본 항목: {WRITE_ITEM_LABEL[p.defaultItem]} · {presetLimit(p.defaultItem).toLocaleString("ko-KR")} B</span>
              <span>{p.styleGuide}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 첫 실행: 샘플로 둘러보기 또는 5단계 설정 */
export function Onboarding() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const setPage = useStore((s) => s.setPage);
  const [step, setStep] = useState<number>(-1);

  const finish = () => { setSettings({ onboarded: true }); setPage("today"); };
  const canNext = step === 0 ? !!doc.settings.schoolLevel : step === 1 ? !!doc.settings.school.subject.trim() : step === 2 ? doc.students.length > 0 : true;

  if (step < 0) {
    return (
      <div className="onb">
        <div className="box">
          <div className="flex" style={{ gap: 14, marginBottom: 16 }}><div className="logo-lg">누</div><div><h1>누가</h1><div className="muted">수업 중 10초 기록 · 수업 후 1분 보완 · 학기 말 세특 초안</div></div></div>
          <div className="hero">
            <button onClick={async () => { await startDemo(); setSettings({ onboarded: true }); setPage("today"); }}><b>데모 모드로 둘러보기</b><span className="muted small">화학Ⅰ · 2개 반 · 한 학기 합성 기록 · 합성 모의 수업 스크립트와 추천 카드. 모두 합성 데이터이며 나중에 설정 → 데이터에서 지울 수 있음</span></button>
            <button onClick={() => setStep(0)}><b>처음부터 설정</b><span className="muted small">학교급 → 영역 → 명단 → 시간표 → 진도. 5단계, 약 5분</span></button>
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
            {step >= 3 && <button className="btn ghost" onClick={finish}>건너뛰고 시작</button>}
          </span>
        </div>
        <div className="settings-body" style={{ maxWidth: "none" }}>
          {step === 0 && <SchoolLevelStep />}
          {step === 1 && <SubjectSection />}
          {step === 2 && <RosterSection />}
          {step === 3 && <TimetableSection />}
          {step === 4 && <ProgressSection />}
        </div>
      </div>
    </div>
  );
}
