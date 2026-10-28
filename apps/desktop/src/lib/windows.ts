/**
 * 같은 앱을 여러 창으로 열 때 (웨일 사이드바 · 듀얼탭).
 * - ?panel=sidebar : 웨일 사이드바에 띄운 모바일 화면(번호 릴)만
 * - ?page=draft&cls=&no= : 듀얼탭으로 연 생기부 생성 화면
 * 두 창은 같은 브라우저 저장소를 쓰므로 store 가 저장할 때마다 서로 알린다 (store.ts 'nuga-doc').
 */
const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

export const PANEL = q.get("panel") === "sidebar";
/** 보조 창(사이드바 · 듀얼탭): 동기화 엔진과 웨일 모드 둘러보기를 돌리지 않는다 */
export const SUB_WINDOW = PANEL || q.has("page");
/** 웨일 브라우저: 사이드바 · 듀얼탭으로 여는 버튼은 웨일에서만 보인다 */
export const IS_WHALE = typeof navigator !== "undefined" && /\bWhale\//.test(navigator.userAgent);

export function startParams(): URLSearchParams { return q; }
export function appBase(): string { return location.href.split("#")[0].split("?")[0]; }
/** 웨일 사이드바에 모바일 화면을 띄운다 (웨일 2.0 이상: window.open 의 'whale-sidebar') */
export function openWhaleSidebar(): void { window.open(`${appBase()}?panel=sidebar`, "_blank", "whale-sidebar"); }
/** 듀얼탭으로 열 생기부 생성 화면 주소 (a rel="whale-dualtab") */
export function draftTabUrl(cls: string, no: number): string { return `${appBase()}?page=draft&cls=${encodeURIComponent(cls)}&no=${no}`; }
