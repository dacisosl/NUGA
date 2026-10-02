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
export type RecordSource = "watch" | "phone" | "widget" | "pc";
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
  history: DraftHistory[];
  updatedAt: string;
}

export interface CategoryDef { key: Category; label: string }
export interface ClassDef { class: string; size: number }
export interface PeriodDef { no: number; start: string; end: string }
export interface TimetableCell { weekday: number; period: number; class: string }
export interface ProgressRow { date: string; class: string; unit: string; lesson: number; title: string }

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
  lowRecordThreshold: number;
  lowRecordEnabled: boolean;
  supplementEnabled: boolean;
  similarityThreshold: number;
  /** true면 공통 글자수·기준 대신 이 영역 전용 값을 쓴다 */
  lengthOverride: boolean;
  /** 영역별 초안 지침. 비우면 기본 지침(교과 세특) */
  draftPrompt: string;
  options: { autoLaunchWatch: boolean; reelStart: "one" | "last"; showPhoneNames: boolean; showLevelBadge?: boolean };
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
  updatedAt: string;
}

export type SyncMessage =
  | { v: 1; type: "records"; deviceId: string; sentAt: string; payload: NugaRecord[] }
  | { v: 1; type: "tombstones"; deviceId: string; sentAt: string; payload: Tombstone[] }
  | { v: 1; type: "config"; deviceId: string; sentAt: string; payload: ConfigMessage }
  | { v: 1; type: "ping"; deviceId: string; sentAt: string; payload: { name: string } };

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
