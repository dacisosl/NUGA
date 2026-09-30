export type Category = 1 | 2 | 3 | 4;
export type Level = "A" | "B" | "C";
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

export interface Student { class: string; no: number; name: string; level: Level }

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

export interface DraftSentence { text: string; evidence: string[] }

export type IssueKind =
  | "forbidden" | "similar" | "noEvidence" | "length" | "style" | "honorific" | "subject" | "name" | "levelA" | "empty";

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
  provider: "anthropic" | "local";
  apiKey: string;
  model: string;
}

export interface Settings {
  school: { grade: number; subject: string; year: number; semester: number };
  categories: CategoryDef[];
  classes: ClassDef[];
  periods: PeriodDef[];
  timetable: TimetableCell[];
  progress: ProgressRow[];
  targetLength: Record<string, number>;
  lengthMode: "withSpaces" | "withoutSpaces";
  lowRecordThreshold: number;
  lowRecordEnabled: boolean;
  supplementEnabled: boolean;
  similarityThreshold: number;
  /** true면 공통 글자수·기준 대신 이 영역 전용 값을 쓴다 */
  lengthOverride: boolean;
  options: { autoLaunchWatch: boolean; reelStart: "one" | "last"; showPhoneNames: boolean };
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
    targetLength: { "세특": 500 },
    lengthMode: "withSpaces",
    lowRecordThreshold: 1,
    lowRecordEnabled: false,
    supplementEnabled: false,
    similarityThreshold: 0.7,
    lengthOverride: false,
    options: { autoLaunchWatch: true, reelStart: "one", showPhoneNames: false },
    sync: null,
    ai: { enabled: false, provider: "local", apiKey: "", model: "claude-opus-5-5" },
    onboarded: false,
  };
}

export function emptyDoc(): NugaDoc {
  return { version: 1, settings: defaultSettings(), students: [], records: [], performances: [], drafts: [], devices: [] };
}
