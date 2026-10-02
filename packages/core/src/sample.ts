import type { Category, Level, NugaDoc, NugaRecord, Performance, ProgressRow, Student, TimetableCell } from "./types";
import { emptyDoc } from "./types";
import { nowIso, uuid } from "./ids";
import { lessonFor } from "./timetable";
import { josa } from "./text";

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용".split("");
const GIVEN = ["서연", "민준", "지우", "하은", "도윤", "예린", "시우", "수아", "주원", "지민", "하준", "채원", "지호", "다은", "건우", "유나", "현우", "소율", "우진", "가은", "선우", "지아", "연우", "윤서", "정우", "서현", "승현", "예은", "민재", "하린", "태윤", "지윤", "은우", "서윤", "준서", "나은", "시윤", "다인", "이준", "수빈", "유준", "채은", "지환", "예서", "승우", "민서", "동현", "아린", "재원", "서아", "준혁", "하율", "지후", "시은", "현준", "유진"];

const UNITS: { unit: string; lessons: string[] }[] = [
  { unit: "1단원", lessons: ["화학의 유용성", "몰과 화학식량", "화학 반응식과 양적 관계", "용액의 농도"] },
  { unit: "2단원", lessons: ["원자의 구조", "전자 배치", "주기율표와 주기성", "이온화 에너지"] },
  { unit: "3단원", lessons: ["이온 결합", "공유 결합과 전기 음성도", "분자의 구조", "결합의 극성"] },
  { unit: "4단원", lessons: ["동적 평형", "산과 염기", "중화 반응의 양적 관계", "산화·환원 반응", "화학 반응과 열"] },
];

/** 단원별 주제 × 카테고리별 활동 템플릿 → 수백 가지 조합. {t} 자리에 주제, {t:을}·{t:과} 는 조사 자동 선택 */
const TOPICS: Record<string, string[]> = {
  "1단원": ["몰 개념", "화학 반응식의 계수", "용액의 몰 농도", "아보가드로수", "기체의 부피비", "화학식량"],
  "2단원": ["오비탈과 전자 배치", "이온화 에너지 경향", "원자 반지름 변화", "주기율표의 족과 주기", "유효 핵전하", "전자 껍질"],
  "3단원": ["이온 결합의 성질", "공유 결합과 전기 음성도", "분자의 결합각", "루이스 전자점식", "결합의 극성", "분자 모형"],
  "4단원": ["동적 평형", "산과 염기의 세기", "중화 적정", "산화수 변화", "반응열과 엔탈피", "르샤틀리에 원리"],
};
const ACTIONS: Record<Category, string[]> = {
  1: ["{t}에서 예외 사례가 생기는 이유를 질문", "{t:과} 이전 단원 개념의 연결을 질문", "{t}의 조건이 달라질 때 결과를 예측하며 질문", "{t:을} 실생활 사례에 적용할 수 있는지 질문", "{t} 계산에서 단위 처리 방법을 질문"],
  2: ["{t} 문제 풀이 과정을 칠판에 단계별로 설명", "{t} 실험 결과를 표로 정리하여 발표", "{t:을} 모형과 그림으로 표현하여 발표", "{t}에 대한 조사 내용을 사례와 함께 발표", "{t}의 오개념을 바로잡는 근거를 들어 발표"],
  3: ["{t} 모둠 실험에서 데이터 기록을 담당", "{t} 모둠 토의에서 의견을 정리하고 조율", "{t} 활동에서 모둠원의 오개념을 바로잡아 줌", "{t} 보고서 작성에서 자료 정리를 주도", "{t} 퀴즈 활동에서 모둠원에게 풀이를 설명"],
  4: ["{t} 관련 추가 문제를 질문하러 찾아옴", "{t} 개념 지도를 스스로 그려 정리", "{t} 오답 노트를 만들어 재정리", "{t} 관련 도서를 읽고 내용을 공유", "{t} 실험 기구 정리와 안전 확인을 자발적으로 수행"],
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

function iso(date: string, h: number, m: number): string {
  const d = new Date(`${date}T00:00:00`); d.setHours(h, m, 0, 0);
  return nowIso(d);
}

function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = []; const d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  while (d <= e) { const w = d.getDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}

export function makeSampleDoc(seed = 42): NugaDoc {
  const r = rng(seed);
  const doc = emptyDoc();
  const year = 2026;
  doc.settings.school = { grade: 2, subject: "화학Ⅰ", year, semester: 1 };
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

  // 진도: 학기 수업일에 차시를 순서대로 배정
  const days = weekdaysBetween(`${year}-03-02`, `${year}-07-17`);
  const progress: ProgressRow[] = [];
  for (const c of doc.settings.classes) {
    const wds = new Set(tt.filter((t) => t.class === c.class).map((t) => t.weekday));
    const lessonDays = days.filter((d) => { const w = new Date(d + "T00:00:00").getDay(); return wds.has(w); });
    let i = 0;
    for (const u of UNITS) for (let li = 0; li < u.lessons.length; li++) {
      // 차시당 수업 2회
      for (let k = 0; k < 2 && i < lessonDays.length; k++, i++) progress.push({ date: lessonDays[i], class: c.class, unit: u.unit, lesson: li + 1, title: u.lessons[li] });
    }
  }
  doc.settings.progress = progress;

  // 누가기록: 학생별 0~7건 (수준 A 많이, C 적게), 오늘 이전 날짜만. 몇 건은 pending.
  const today = new Date(); const todayKey = today.toISOString().slice(0, 10);
  const pmap = new Map(doc.settings.periods.map((p) => [p.no, p]));
  const records: NugaRecord[] = [];
  for (const s of doc.students) {
    const lv = levelOf.get(`${s.class}|${s.no}`) || "B";
    const n = lv === "A" ? 3 + Math.floor(r() * 5) : lv === "B" ? 1 + Math.floor(r() * 4) : Math.floor(r() * 3);
    const myDays = progress.filter((p) => p.class === s.class && p.date < todayKey).map((p) => p.date);
    for (let i = 0; i < n && myDays.length; i++) {
      const date = pick(r, myDays);
      const cat = (lv === "A" ? pick(r, [1, 1, 2, 2, 3, 4]) : lv === "B" ? pick(r, [1, 2, 3, 3, 4]) : pick(r, [3, 4, 2, 1])) as Category;
      const w = new Date(date + "T00:00:00").getDay();
      const cell = tt.find((t) => t.class === s.class && t.weekday === w);
      const per = pmap.get(cell?.period || 3)!;
      const [h, m] = per.start.split(":").map(Number);
      const time = iso(date, h, m + 5 + Math.floor(r() * 40));
      const recent = date >= new Date(today.getTime() - 3 * 86400000).toISOString().slice(0, 10);
      const pending = recent && r() < 0.7;
      const lesson = lessonFor(progress, s.class, date);
      records.push({
        id: uuid(), class: s.class, no: s.no, category: cat, time,
        lesson,
        memo: pending && r() < 0.5 ? pick(r, ["예외 사례", "오차 원인", "역할 조율", "모형 비교"]) : "",
        voiceMemo: null,
        note: pending ? "" : pickNote(r, cat, lesson?.unit, lesson?.title),
        status: pending ? "pending" : "confirmed",
        source: pick(r, ["watch", "watch", "phone", "widget"]),
        createdAt: time, updatedAt: time,
      });
    }
  }
  // 오늘/최근 pending 기록 몇 건 보장 (보완 모달 시연용)
  const demoStudents = doc.students.filter((s) => s.class === "2-3").slice(0, 4);
  demoStudents.forEach((s, i) => {
    const t = new Date(today.getTime() - (i + 1) * 3600000);
    const time = nowIso(t);
    records.push({ id: uuid(), class: s.class, no: s.no, category: ((i % 4) + 1) as Category, time, lesson: lessonFor(progress, s.class, todayKey), memo: i === 0 ? "르샤틀리에 연결" : "", voiceMemo: i === 1 ? { durationSec: 4, transcript: "적정 오차를 눈금 읽기 문제로 설명함" } : null, note: "", status: "pending", source: i % 2 ? "watch" : "widget", createdAt: time, updatedAt: time });
  });
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
