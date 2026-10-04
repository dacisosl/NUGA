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
      <div className="onb hero-dark">
        <div className="box">
          <div>
            <div className="onb-brand"><svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 26h9v-8h8v-8h9" /><circle cx="29" cy="10" r="1.8" fill="#DCEBFF" /></svg>누가<span className="brand-en">NUGA</span></div>
            <div className="eyebrow">학생의 다음 한 걸음을 위한 기록</div>
            <h1 className="onb-title">좋은 기록이,<br />성장의 다음<br /><em>발판이 됩니다.</em></h1>
            <p className="onb-lead">수업 중 10초 기록 · 쉬는 시간 1분 보완 · 학기 말 세특 초안.<br />교사의 관찰이 학생의 성장으로 이어지도록, 누가가 돕습니다.</p>
            <div className="onb-ctas">
              <button className="onb-cta main" onClick={async () => { await startDemo(); setSettings({ onboarded: true }); setPage("today"); }}><b>데모로 둘러보기</b><span>화학Ⅰ · 2개 반 · 9월부터의 합성 기록 · 합성 모의 수업과 추천 카드. 나중에 설정 → 데이터에서 지울 수 있습니다.</span></button>
              <button className="onb-cta" onClick={() => setStep(0)}><b>처음부터 설정</b><span>학교급 → 영역 → 명단 → 시간표 → 진도. 5단계, 약 5분</span></button>
            </div>
            <div className="onb-note">학생 이름은 이 PC에만 저장됩니다. 워치·폰·서버에는 반·번호만 오갑니다.</div>
          </div>
          <div className="onb-stairs" aria-hidden="true">
            {/* 히어로의 유리 계단: 쪽 번호와 푸른 빛점 (아바타 없음) */}
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
