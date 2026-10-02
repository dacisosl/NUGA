export type Category = 1 | 2 | 3 | 4;
/** 0.2.0 이하의 수준 표시. 불러올 때 도달 정도로 옮긴다. */
export type Level = "A" | "B" | "C";
/** 도달 정도(0~100)를 앱 안에서 나누는 5등급. 화면·내보내기에는 등급 이름을 쓰지 않는다. */
export type Grade = "A" | "B" | "C" | "D" | "E";
export type SchoolLevel = "elem" | "middle" | "high";
/** 글자수 단위: 공백 포함 글자 · 공백 제외 글자 · NEIS 바이트 */
export type LengthMode = "withSpaces" | "withoutSpaces" | "bytes";
/** 영역에서 작성하는 생기부 항목 */
export type WriteItem = "setuk" | "elemSubject" | "behavior" | "autonomy" | "club" | "career";
export type AiProvider = "anthropic" | "gemini" | "openrouter" | "local";
export type RecordStatus = "pending" | "confirmed" | "skipped";
export type RecordSource = "watch" | "phone" | "widget" | "pc" | "suggestion" | "demo";
export type DraftField = "세특" | "행특" | "창체";

export interface Lesson { unit: string; lesson: number; title: string }

export interface VoiceMemo { durationSec: number; transcript: string }

export interface NugaRecord {
  id: string;
  class: string;
  no: number;
  category: Category;
  time: string;
  lesson: Lesson | null;
  memo: string;
  voiceMemo: VoiceMemo | null;
  note: string;
  status: RecordStatus;
  source: RecordSource;
  createdAt: string;
  updatedAt: string;
}

export interface Tombstone { id: string; deletedAt: string }

/* ---------------- 수업 녹음 스크립트 (v3 7.3, 11.6) ---------------- */

/** 발언 한 구간. t0·t1 = 녹음 시작부터 지난 초. 화자는 "화자1"처럼 라벨만 (학생과 연결하지 않음) */
export interface TranscriptSegment { id: string; t0: number; t1: number; speaker: string; text: string }

/** 수업 1회 스크립트. 폰이 음성 API 로 만들어 PC 로 보낸다. 음성 파일은 보내지 않는다. */
export interface Transcript {
  id: string;
  /** 반 (초등 담임형이면 반 이름) */
  class: string;
  period: number;
  /** 녹음 시작·끝 (ISO, 기기 현지 시각) */
  startedAt: string;
  endedAt: string;
  segments: TranscriptSegment[];
  /** 발화량이 가장 많은 화자 = 교사 추정. confirmed 는 교사가 확인·변경한 값 */
  teacherSpeaker: { auto: string | null; confirmed: string | null };
  engine: { provider: string; model: string };
  createdAt: string;
}

/** 메시지 하나가 256KB 를 넘지 않도록 스크립트를 나눠 보낸다 */
export interface TranscriptPart { transcript: Transcript; part: number; total: number }

/** 폰 녹음 설정 (PC 에서 정해 config 로 내려보냄) */
export interface RecordingSettings {
  enabled: boolean;
  /** 사용 조건(학교 승인·고지·동의·외부 전송 검토)을 교사가 확인했는지 */
  approvedChecklist: boolean;
  /** tap = 수업 시작 알림에서 1탭, standby = 아침 1탭으로 하루 대기 후 시간표대로 자동 */
  mode: "tap" | "standby";
  audioTTLHours: number;
  speech: { provider: "gemini" | "openrouter"; model: string };
  /** Wi-Fi 에서만 변환 */
  wifiOnly: boolean;
  maxSuggestions: number;
  alignWindowSec: [number, number];
}

export const DEFAULT_RECORDING: RecordingSettings = {
  enabled: false, approvedChecklist: false, mode: "tap", audioTTLHours: 24,
  speech: { provider: "gemini", model: "gemini-2.5-flash" }, wifiOnly: true, maxSuggestions: 10, alignWindowSec: [-60, 15],
};

/**
 * 성취기준 도달 정도 (PC 전용 내부 값, 0~100).
 * final = manual ?? auto. confidence: 근거 기록 3건 이상 ok, 1~2건 low, 0건 none.
 */
export interface Achievement {
  auto: number | null;
  manual: number | null;
  confidence: "ok" | "low" | "none";
  byStandard?: Record<string, number>;
  updatedAt?: string;
}

export interface Student {
  class: string; no: number; name: string;
  achievement?: Achievement;
  /** 0.2.0 이하 데이터에만 있음. normalize 할 때 achievement 로 옮기고 지운다. */
  level?: Level;
}

export interface Performance {
  id: string;
  class: string;
  no: number;
  title: string;
  date: string;
  file: string | null;
  ocrText: string;
  excerpt: string;
  matched: boolean;
}

/** 형광펜 구분: 학생활동 · 역량 · 교사의 평가 · 이음말(none) */
export type SpanKind = "activity" | "competency" | "evaluation" | "none";
export interface DraftSpan { text: string; kind: SpanKind }
/** spans 를 이어 붙이면 text 와 같다. AI 가 준 구분이며, 없으면 규칙으로 나눈다. */
export interface DraftSentence { text: string; evidence: string[]; spans?: DraftSpan[] }

export type IssueKind =
  | "forbidden" | "similar" | "noEvidence" | "length" | "style" | "honorific" | "subject" | "name" | "levelA" | "empty" | "evalHeavy";

export interface ReviewIssue {
  kind: IssueKind;
  message: string;
  sentenceIndex?: number;
  span?: string;
  suggestion?: string;
}

export type ReviewResult = "pass" | "check" | "fix" | "none";

export interface DraftHistory { role: "user" | "assistant"; text: string; at: string }

export interface Draft {
  id: string;
  class: string;
  no: number;
  field: DraftField;
  text: string;
  length: number;
  sentences: DraftSentence[];
  evidence: string[];
  status: "draft" | "saved";
  targetLength?: number;
  review: { result: ReviewResult; issues: ReviewIssue[]; at?: string };
  /** 반영도 점검 (생성·저장 때 계산) */
  adherence?: AdherenceReport;
  /** 생성에 쓴 도달 정도 (내부 값) */
  achievementUsed?: number | null;
  engine?: { provider: string; model?: string };
  history: DraftHistory[];
  updatedAt: string;
}

export interface CategoryDef { key: Category; label: string }
export interface ClassDef { class: string; size: number }
export interface PeriodDef { no: number; start: string; end: string }
export interface TimetableCell { weekday: number; period: number; class: string }
export interface ProgressRow { date: string; class: string; unit: string; lesson: number; title: string; standards?: string[] }

/** 교육과정 성취기준 (교사가 넣음, 데모는 예시 코드) */
export interface Standard { code: string; text: string }

/**
 * 교사 지침 (영역별). 점검할 수 있는 항목은 선택형으로 받고, 자유 문장(note)은 프롬프트에만 넣는다.
 */
export interface TeacherGuide {
  /** 한 문장 목표 길이(공백 포함 글자) */
  sentenceLength?: number;
  /** 강조할 카테고리 라벨 */
  emphasize?: string[];
  /** 꼭 넣을 표현 */
  mustInclude?: string[];
  /** 쓰지 말 표현 */
  avoid?: string[];
  /** 자유 지침 (자동 점검 불가) */
  note?: string;
}

/** 프롬프트 반영도 점검 결과 (v3 16·17.4) */
export interface AdherenceRule { key: string; label: string; pass: boolean; detail: string; sentences?: number[]; checkable: boolean }
export interface AdherenceReport {
  score: number; passed: number; total: number;
  rules: AdherenceRule[];
  /** 근거 연결률 · 기록 사용률 · 근거 일치도 · 반영도 */
  metrics: { linkRate: number; useRate: number; support: number; adherence: number };
  /** 문장별 근거 일치도 (0~1) */
  sentenceSupport: number[];
  at: string;
}

export interface SyncSettings {
  keyB64: string;
  keyId: string;
  relayUrl: string;
  pcName: string;
  pairedAt: string;
  shareRoster: boolean;
  lastPulledId?: string;
  lastSyncAt?: string;
}

export interface AiSettings {
  enabled: boolean;
  /** "local" 은 0.2.0 까지 'AI 없이 규칙 생성'을 뜻했다. 지금은 llama-server(로컬 LLM) 이다. */
  provider: AiProvider | "rules";
  /** 0.2.0 이하 호환용. 키는 OS 보안 저장소에 두고 문서에는 저장하지 않는다. */
  apiKey: string;
  model: string;
  /** 제공자별 모델 이름 */
  models?: Partial<Record<AiProvider, string>>;
  /** 로컬 LLM(llama-server) 주소 */
  localUrl?: string;
}

export interface Settings {
  school: { grade: number; subject: string; year: number; semester: number };
  categories: CategoryDef[];
  classes: ClassDef[];
  periods: PeriodDef[];
  timetable: TimetableCell[];
  progress: ProgressRow[];
  /** 항목별 한도. 단위는 lengthMode (bytes 면 바이트) */
  targetLength: Record<string, number>;
  lengthMode: LengthMode;
  /** 목표 구간(한도 대비 비율). 기본 [0.96, 1.0] */
  lengthBand?: [number, number];
  /** 교사가 기재요령 값을 바꿨으면 true ("사용자 설정" 표시) */
  lengthCustom?: boolean;
  /** 학교급 (프리셋) */
  schoolLevel?: SchoolLevel;
  /** 이 영역에서 쓰는 생기부 항목 */
  writeItem?: WriteItem;
  /** 성취기준 목록 */
  standards?: Standard[];
  /** 교사 지침 (선택형 항목 + 자유 문장) */
  guide?: TeacherGuide;
  lowRecordThreshold: number;
  lowRecordEnabled: boolean;
  supplementEnabled: boolean;
  similarityThreshold: number;
  /** true면 공통 글자수·기준 대신 이 영역 전용 값을 쓴다 */
  lengthOverride: boolean;
  /** 영역별 초안 지침. 비우면 기본 지침(교과 세특) */
  draftPrompt: string;
  options: { autoLaunchWatch: boolean; reelStart: "one" | "last"; showPhoneNames: boolean; showLevelBadge?: boolean };
  /** 수업 녹음 (공통 설정) */
  recording?: RecordingSettings;
  sync: SyncSettings | null;
  ai: AiSettings;
  onboarded: boolean;
}

export interface Device { deviceId: string; name: string; lastSeen: string }

export interface NugaDoc {
  version: 1;
  settings: Settings;
  students: Student[];
  records: NugaRecord[];
  performances: Performance[];
  drafts: Draft[];
  devices: Device[];
}

export interface ConfigMessage {
  school: Settings["school"];
  categories: CategoryDef[];
  classes: ClassDef[];
  periods: PeriodDef[];
  timetable: TimetableCell[];
  progress: ProgressRow[];
  roster: { class: string; no: number; name: string }[] | null;
  options: { autoLaunchWatch: boolean; reelStart: "one" | "last" };
  /** 녹음 설정 (없으면 꺼짐). 키는 들어가지 않는다 */
  recording?: Omit<RecordingSettings, "maxSuggestions" | "alignWindowSec"> | null;
  updatedAt: string;
}

export type SyncMessage =
  | { v: 1; type: "records"; deviceId: string; sentAt: string; payload: NugaRecord[] }
  | { v: 1; type: "tombstones"; deviceId: string; sentAt: string; payload: Tombstone[] }
  | { v: 1; type: "config"; deviceId: string; sentAt: string; payload: ConfigMessage }
  | { v: 1; type: "ping"; deviceId: string; sentAt: string; payload: { name: string } }
  /** 폰 → PC: 수업 스크립트 (나눠 보낼 수 있음) */
  | { v: 1; type: "transcript"; deviceId: string; sentAt: string; payload: TranscriptPart }
  /** PC → 폰: 스크립트를 받았음. 폰은 사본을 지운다 */
  | { v: 1; type: "transcriptAck"; deviceId: string; sentAt: string; payload: { ids: string[] } }
  /** PC → 폰: 음성 변환용 API 키 (교사가 녹음을 켜고 [폰으로 보내기]를 눌렀을 때만). 빈 값이면 폰에서 지움 */
  | { v: 1; type: "secrets"; deviceId: string; sentAt: string; payload: { gemini?: string; openrouter?: string } };

export interface Envelope { from: "phone" | "pc"; iv: string; ct: string; ts: string }
export interface RelayItem extends Envelope { id: string }

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { key: 1, label: "질문" }, { key: 2, label: "발표" }, { key: 3, label: "협동" }, { key: 4, label: "기타" },
];

export const DEFAULT_PERIODS: PeriodDef[] = [
  { no: 1, start: "08:50", end: "09:40" }, { no: 2, start: "09:50", end: "10:40" }, { no: 3, start: "10:50", end: "11:40" },
  { no: 4, start: "11:50", end: "12:40" }, { no: 5, start: "13:40", end: "14:30" }, { no: 6, start: "14:40", end: "15:30" },
  { no: 7, start: "15:40", end: "16:30" },
];

export function defaultSettings(): Settings {
  return {
    school: { grade: 2, subject: "", year: new Date().getFullYear(), semester: new Date().getMonth() < 7 ? 1 : 2 },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    classes: [],
    periods: DEFAULT_PERIODS.map((p) => ({ ...p })),
    timetable: [],
    progress: [],
    targetLength: { "세특": 1500 },
    lengthMode: "bytes",
    lengthBand: [0.96, 1.0],
    lowRecordThreshold: 1,
    lowRecordEnabled: false,
    supplementEnabled: false,
    similarityThreshold: 0.7,
    lengthOverride: false,
    draftPrompt: "",
    options: { autoLaunchWatch: true, reelStart: "one", showPhoneNames: false, showLevelBadge: true },
    sync: null,
    ai: { enabled: false, provider: "anthropic", apiKey: "", model: "claude-opus-5-5" },
    onboarded: false,
  };
}

export function emptyDoc(): NugaDoc {
  return { version: 1, settings: defaultSettings(), students: [], records: [], performances: [], drafts: [], devices: [] };
}
