import type { Category, Level, NugaDoc, NugaRecord, Performance, ProgressRow, RecordSource, TimetableCell } from "./types";
import { emptyDoc } from "./types";
import { dateKey, nowIso, uuid } from "./ids";
import { lessonFor } from "./timetable";
import { josa } from "./text";

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용".split("");
const GIVEN = ["서연", "민준", "지우", "하은", "도윤", "예린", "시우", "수아", "주원", "지민", "하준", "채원", "지호", "다은", "건우", "유나", "현우", "소율", "우진", "가은", "선우", "지아", "연우", "윤서", "정우", "서현", "승현", "예은", "민재", "하린", "태윤", "지윤", "은우", "서윤", "준서", "나은", "시윤", "다인", "이준", "수빈", "유준", "채은", "지환", "예서", "승우", "민서", "동현", "아린", "재원", "서아", "준혁", "하율", "지후", "시은", "현준", "유진"];

type Unit = { unit: string; lessons: string[] };
/** 1학기 */
const UNITS: Unit[] = [
  { unit: "1단원", lessons: ["화학의 유용성", "몰과 화학식량", "화학 반응식과 양적 관계", "용액의 농도"] },
  { unit: "2단원", lessons: ["원자의 구조", "전자 배치", "주기율표와 주기성", "이온화 에너지"] },
  { unit: "3단원", lessons: ["이온 결합", "공유 결합과 전기 음성도", "분자의 구조", "결합의 극성"] },
  { unit: "4단원", lessons: ["동적 평형", "산과 염기", "중화 반응의 양적 관계", "산화·환원 반응", "화학 반응과 열"] },
];
/** 2학기 (심화·탐구) */
const UNITS2: Unit[] = [
  { unit: "5단원", lessons: ["반응열과 열량계", "헤스 법칙", "결합 에너지"] },
  { unit: "6단원", lessons: ["반응 속도", "농도와 반응 속도", "온도와 촉매"] },
  { unit: "7단원", lessons: ["평형 상수", "르샤틀리에 원리 탐구", "용해 평형"] },
  { unit: "8단원", lessons: ["산·염기 평형", "완충 용액", "전기 화학과 전지", "탐구 발표"] },
];

/** 단원별 주제 × 카테고리별 활동 템플릿 → 수백 가지 조합. {t} 자리에 주제, {t:을}·{t:과} 는 조사 자동 선택 */
const TOPICS: Record<string, string[]> = {
  "1단원": ["몰 개념", "화학 반응식의 계수", "용액의 몰 농도", "아보가드로수", "기체의 부피비", "화학식량"],
  "2단원": ["오비탈과 전자 배치", "이온화 에너지 경향", "원자 반지름 변화", "주기율표의 족과 주기", "유효 핵전하", "전자 껍질"],
  "3단원": ["이온 결합의 성질", "공유 결합과 전기 음성도", "분자의 결합각", "루이스 전자점식", "결합의 극성", "분자 모형"],
  "4단원": ["동적 평형", "산과 염기의 세기", "중화 적정", "산화수 변화", "반응열과 엔탈피", "르샤틀리에 원리"],
  "5단원": ["열량계 측정", "헤스 법칙", "결합 에너지", "반응 엔탈피", "발열·흡열 반응"],
  "6단원": ["반응 속도 그래프", "활성화 에너지", "촉매의 작용", "농도에 따른 반응 속도", "온도와 분자 충돌"],
  "7단원": ["평형 상수", "르샤틀리에 원리", "용해 평형", "반응 지수", "평형 이동 실험"],
  "8단원": ["완충 용액", "산·염기 평형", "화학 전지", "전기 분해", "pH 변화"],
};
const ACTIONS: Record<Category, string[]> = {
  1: ["{t}에서 예외 사례가 생기는 이유를 질문", "{t:과} 이전 단원 개념의 연결을 질문", "{t}의 조건이 달라질 때 결과를 예측하며 질문", "{t:을} 실생활 사례에 적용할 수 있는지 질문", "{t} 계산에서 단위 처리 방법을 질문"],
  2: ["{t} 문제 풀이 과정을 칠판에 단계별로 설명", "{t} 실험 결과를 표로 정리하여 발표", "{t:을} 모형과 그림으로 표현하여 발표", "{t}에 대한 조사 내용을 사례와 함께 발표", "{t}의 오개념을 바로잡는 근거를 들어 발표"],
  3: ["{t} 모둠 실험에서 데이터 기록을 담당", "{t} 모둠 토의에서 의견을 정리하고 조율", "{t} 활동에서 모둠원의 오개념을 바로잡아 줌", "{t} 보고서 작성에서 자료 정리를 주도", "{t} 퀴즈 활동에서 모둠원에게 풀이를 설명"],
  4: ["{t} 관련 추가 문제를 질문하러 찾아옴", "{t} 개념 지도를 스스로 그려 정리", "{t} 오답 노트를 만들어 재정리", "{t} 관련 도서를 읽고 내용을 공유", "{t} 실험 기구 정리와 안전 확인을 자발적으로 수행"],
};
/** 수업 중 폰·워치로 찍으며 남긴 짧은 메모 (보완 대기 기록) */
const MEMOS: Record<Category, string[]> = {
  1: ["예외 사례", "조건 바뀌면?", "단위 질문", "이전 단원 연결", "왜 그런지"],
  2: ["칠판 풀이", "그래프 해석", "모형 설명", "근거 들어 설명", "오차 원인"],
  3: ["역할 조율", "모둠원 설명", "데이터 기록", "의견 정리"],
  4: ["쉬는 시간 질문", "오답 노트", "기구 정리", "추가 자료"],
};
const VOICE: Record<Category, string[]> = {
  1: ["온도 바꾸면 평형 상수도 바뀌냐고 질문함", "촉매가 평형 위치도 바꾸는지 물어봄"],
  2: ["적정 오차를 눈금 읽기 문제로 설명함", "그래프 기울기로 반응 속도를 설명함"],
  3: ["모둠에서 측정 순서를 정리해 줌", "친구에게 계산 과정을 다시 설명해 줌"],
  4: ["수업 끝나고 실험 기구 정리를 도맡음", "관련 기사 찾아와서 보여 줌"],
};
function fill(tpl: string, t: string): string {
  return tpl.replace(/\{t:을\}/g, josa(t, "을/를")).replace(/\{t:과\}/g, josa(t, "과/와")).replace(/\{t\}/g, t);
}

function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }

/** 그날 수업 주제(진도표 제목)로 관찰 내용을 만든다. 가끔 같은 단원의 세부 주제를 쓴다. */
function pickNote(r: () => number, cat: Category, unit: string | undefined, title?: string): string {
  const topics = TOPICS[unit || ""] || Object.values(TOPICS).flat();
  const t = title && r() < 0.75 ? title : pick(r, topics);
  return fill(pick(r, ACTIONS[cat]), t);
}

/** 평일 날짜(로컬). toISOString 은 UTC 라 한국 시각에서 하루 밀리므로 쓰지 않는다. */
function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = []; const d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  while (d <= e) { const w = d.getDay(); if (w >= 1 && w <= 5) out.push(dateKey(d)); d.setDate(d.getDate() + 1); }
  return out;
}

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function makeSampleDoc(seed = 42, now: Date = new Date()): NugaDoc {
  const r = rng(seed);
  const doc = emptyDoc();
  const year = 2026;
  const semester = now.getFullYear() === year && now.getMonth() >= 7 ? 2 : 1;
  doc.settings.school = { grade: 2, subject: "화학Ⅰ", year, semester };
  doc.settings.classes = [{ class: "2-3", size: 26 }, { class: "2-5", size: 25 }];
  doc.settings.targetLength = { "세특": 1500 };
  doc.settings.lengthMode = "bytes";
  doc.settings.schoolLevel = "high";
  doc.settings.writeItem = "setuk";
  doc.settings.onboarded = true;

  // 학생
  const used = new Set<string>();
  const levelOf = new Map<string, Level>();
  const levels: Level[] = ["A", "A", "A", "A", "A", "B", "B", "B", "B", "B", "B", "B", "B", "B", "B", "C", "C", "C", "C", "C"];
  for (const c of doc.settings.classes) {
    for (let no = 1; no <= c.size; no++) {
      let name = ""; do { name = pick(r, SURNAMES) + pick(r, GIVEN); } while (used.has(name)); used.add(name);
      // 견본 학생의 도달 정도는 기록으로 자동 추정한다 (교사 조정값 없음). 기록 수 분포만 옛 수준을 따른다.
      levelOf.set(`${c.class}|${no}`, pick(r, levels));
      doc.students.push({ class: c.class, no, name });
    }
  }

  // 시간표: 2-3 월3 수2 금4 / 2-5 화1 목5 금2
  const tt: TimetableCell[] = [
    { weekday: 1, period: 3, class: "2-3" }, { weekday: 3, period: 2, class: "2-3" }, { weekday: 5, period: 4, class: "2-3" },
    { weekday: 2, period: 1, class: "2-5" }, { weekday: 4, period: 5, class: "2-5" }, { weekday: 5, period: 2, class: "2-5" },
  ];
  doc.settings.timetable = tt;

  // 진도: 1·2학기 수업일에 차시를 순서대로 배정 (차시당 수업 2회)
  const progress: ProgressRow[] = [];
  const terms: [string, string, Unit[]][] = [[`${year}-03-02`, `${year}-07-17`, UNITS], [`${year}-08-17`, `${year}-12-18`, UNITS2]];
  for (const [from, to, units] of terms) {
    const days = weekdaysBetween(from, to);
    for (const c of doc.settings.classes) {
      const wds = new Set(tt.filter((t) => t.class === c.class).map((t) => t.weekday));
      const lessonDays = days.filter((d) => wds.has(new Date(d + "T00:00:00").getDay()));
      let i = 0;
      for (const u of units) for (let li = 0; li < u.lessons.length; li++) {
        for (let k = 0; k < 2 && i < lessonDays.length; k++, i++) progress.push({ date: lessonDays[i], class: c.class, unit: u.unit, lesson: li + 1, title: u.lessons[li] });
      }
    }
  }
  progress.sort((a, b) => a.date.localeCompare(b.date) || a.class.localeCompare(b.class));
  // 예시 성취기준 (실제 교육과정 원문이 아님) — 단원에 연결
  doc.settings.standards = [
    { code: "[예시-화학-01]", text: "화학의 유용성과 몰 개념을 이해하고 화학 반응식으로 양적 관계를 설명할 수 있다." },
    { code: "[예시-화학-02]", text: "원자의 구조와 전자 배치를 이해하고 주기적 성질을 설명할 수 있다." },
    { code: "[예시-화학-03]", text: "화학 결합의 종류에 따라 물질의 성질이 달라짐을 설명할 수 있다." },
    { code: "[예시-화학-04]", text: "동적 평형과 산·염기 중화, 산화·환원 반응을 실험과 일상의 예로 설명할 수 있다." },
    { code: "[예시-화학-05]", text: "반응열·반응 속도·화학 평형을 실험 자료로 해석하고 설명할 수 있다." },
  ];
  const unitCode: Record<string, string> = { "1단원": "[예시-화학-01]", "2단원": "[예시-화학-02]", "3단원": "[예시-화학-03]", "4단원": "[예시-화학-04]", "5단원": "[예시-화학-05]", "6단원": "[예시-화학-05]", "7단원": "[예시-화학-05]", "8단원": "[예시-화학-04]" };
  for (const p of progress) if (unitCode[p.unit]) p.standards = [unitCode[p.unit]];
  doc.settings.progress = progress;

  // 누가기록: 9월부터 오늘까지, 반마다 수업일 하루에 2~4건(평균 3건), 그 수업 시간 안의 시각.
  // 최근 7일 수업의 기록은 대부분 폰·워치로 찍어 둔 수동 기록(보완 대기)으로 남긴다.
  const fromKey = `${year}-09-01`;
  const todayKey = dateKey(now);
  const nowM = now.getHours() * 60 + now.getMinutes();
  const weekAgo = dateKey(new Date(now.getTime() - 7 * 86400000));
  const pmap = new Map(doc.settings.periods.map((p) => [p.no, p]));
  const weightOf: Record<Level, number> = { A: 3, B: 2, C: 1 };
  const records: NugaRecord[] = [];
  for (const c of doc.settings.classes) {
    const studs = doc.students.filter((s) => s.class === c.class).map((s) => ({ s, lv: levelOf.get(`${s.class}|${s.no}`) || "B" as Level }));
    const lessons = progress.filter((x) => x.class === c.class && x.date >= fromKey && x.date <= todayKey).flatMap((p) => {
      const w = new Date(p.date + "T00:00:00").getDay();
      const cell = tt.find((t) => t.class === c.class && t.weekday === w);
      const per = cell && pmap.get(cell.period);
      if (!per) return [];
      if (p.date === todayKey && nowM < hm(per.start) + 5) return []; // 아직 시작 안 한 수업
      return [{ p, per }];
    });
    lessons.forEach(({ p, per }, li) => {
      const start = hm(per.start), end = hm(per.end);
      const isToday = p.date === todayKey;
      const last = isToday ? Math.min(end, nowM - 1) : end;
      // 반의 가장 최근 수업은 전부 수동 기록(보완 대기) — 추천 스크립트와 같은 줄에 나란히 보이게
      const latest = li === lessons.length - 1;
      // 학생 고르기: 도달 수준이 높을수록 자주 (같은 날 중복 없이)
      const n = 2 + Math.floor(r() * 3);
      const pool = [...studs];
      const chosen: typeof studs = [];
      while (chosen.length < n && pool.length) {
        const total = pool.reduce((a, x) => a + weightOf[x.lv], 0);
        let t = r() * total; let k = 0;
        while (k < pool.length - 1 && (t -= weightOf[pool[k].lv]) > 0) k++;
        chosen.push(pool.splice(k, 1)[0]);
      }
      const recent = p.date >= weekAgo;
      const lesson = { unit: p.unit, lesson: p.lesson, title: p.title };
      for (const { s, lv } of chosen) {
        const cat = (lv === "A" ? pick(r, [1, 1, 2, 2, 3, 4]) : lv === "B" ? pick(r, [1, 2, 3, 3, 4]) : pick(r, [3, 4, 2, 1])) as Category;
        const m = start + 3 + Math.floor(r() * Math.max(1, last - start - 4));
        const d = new Date(p.date + "T00:00:00"); d.setHours(Math.floor(m / 60), m % 60, Math.floor(r() * 60), 0);
        const time = nowIso(d);
        const pending = latest || (recent && r() < 0.8);
        const roll = r();
        records.push({
          id: uuid(), class: c.class, no: s.no, category: cat, time,
          lesson: lessonFor(progress, c.class, p.date) || lesson,
          memo: pending && roll < 0.45 ? pick(r, MEMOS[cat]) : "",
          voiceMemo: pending && roll >= 0.45 && roll < 0.65 ? { durationSec: 3 + Math.floor(r() * 5), transcript: pick(r, VOICE[cat]) } : null,
          note: pending ? "" : pickNote(r, cat, p.unit, p.title),
          status: pending ? "pending" : "confirmed",
          source: pick(r, ["watch", "watch", "phone", "widget"] as RecordSource[]),
          createdAt: time, updatedAt: time,
        });
      }
    });
  }
  doc.records = records.sort((a, b) => a.time.localeCompare(b.time));

  // 수행평가
  const perfs: Performance[] = [];
  for (const s of doc.students) if (r() < 0.55) {
    const topic = pick(r, Object.values(TOPICS).flat());
    const detail = pick(r, ["생활 속 사례를 조사하고 원리를 설명", "실험 조건을 바꿔 가며 결과를 비교", "자료를 그래프로 정리하고 경향을 해석", "오개념 사례를 찾아 근거로 반박", "두 가지 설명 모형을 비교하고 장단점을 정리"]);
    perfs.push({ id: uuid(), class: s.class, no: s.no, title: "탐구보고서", date: `${year}-05-15`, file: null, ocrText: "", excerpt: `${topic} — ${detail}`, matched: true });
  }
  doc.performances = perfs;
  return doc;
}
