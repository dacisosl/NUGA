// 전역 스타일을 맨 먼저: 화면별 스타일(계단·모바일 미리보기)이 뒤에 붙어 같은 특정도에서 이긴다
import "./styles.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { classList, useStore, type Page } from "./store";
import { Icon, Toasts } from "./components/ui";
import { RecordsPage, exportRecordsExcel } from "./pages/RecordsPage";
import { DraftPage } from "./pages/DraftPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MobilePage } from "./pages/MobilePage";
import { Onboarding } from "./pages/Onboarding";
import { InboxModal, useBacklogCount } from "./components/InboxModal";
import { AreaSwitcher } from "./components/AreaSwitcher";
import { syncEngine } from "./lib/syncEngine";
import { toExportJson, nowIso } from "@nuga/core";
import { saveFile } from "./lib/platform";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const init = useStore((s) => s.init);
  const onboarded = useStore((s) => s.doc.settings.onboarded);
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const inbox = useStore((s) => s.inbox);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (loaded) { syncEngine.start(); return () => syncEngine.stop(); } }, [loaded]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const map: Record<string, Page> = { "0": "main", "1": "main", "2": "draft", "3": "draft", "4": "settings" };
      if (map[e.key]) { e.preventDefault(); setPage(map[e.key]); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [setPage]);

  // 불러오는 동안도 밤 장면: html 바탕(남색) → 밝은 종이 → 남색 틀로 번쩍이지 않게
  if (!loaded) return <div className="onb hero-dark"><span className="spin" /></div>;
  if (!onboarded) return <><Onboarding /><Toasts /></>;

  // 화면은 넷: 현황판(기본) · 생기부 생성(초안 + 검토) · 설정 · 모바일 확인(테스트용). 옛 이름은 현황판/생성으로 보낸다
  const view: Page = page === "today" || page === "records" ? "main" : page === "review" ? "draft" : page;
  return (
    <div className="app">
      <main className="main one" data-page={view}>
        <TopNav view={view} />
        {view === "main" && <RecordsPage />}
        {view === "draft" && <DraftPage />}
        {view === "settings" && <SettingsPage />}
        {view === "mobile" && <MobilePage />}
      </main>
      <Toasts />
      {inbox && <InboxModal />}
    </div>
  );
}

/** 상단 바에서 영역 옆에 크게 놓이는 지금 페이지 이름 (두 번째 줄에는 제목을 두지 않는다) */
/** 상단 바 영역 칸 옆 제목. 현황판(메인)은 제목 없이 영역 칸만 둔다 */
const PAGE_TITLE: Partial<Record<Page, string>> = { draft: "생기부 생성", settings: "설정", mobile: "모바일 확인" };

/**
 * 상단 바 (사이드바 대신): 누가 로고(아래 작은 '모바일 확인') · 영역 | 페이지 이름 · ──── · 미반영 · 저장▾ · 생기부 생성 · 설정.
 * 교사가 매일 보는 것은 현황판 하나. 생기부 생성은 시즌에만 들어가는 문이다.
 * PC 기록은 현황판 학생 카드 → 학생 기록 창 맨 위 입력칸에서 (그 학생의 지난 기록을 보며 바로 쓴다).
 */
function TopNav({ view }: { view: Page }) {
  const setPage = useStore((s) => s.setPage);
  const sync = useStore((s) => s.syncStatus);
  const backlog = useBacklogCount();
  const openInbox = useStore((s) => s.openInbox);
  const title = PAGE_TITLE[view];
  return (
    <header className="topnav">
      <button className="brand" onClick={() => setPage("main")} title="현황판으로">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 26h9v-8h8v-8h9" /><circle cx="29" cy="10" r="1.8" fill="#DCEBFF" /></svg>
        <span className="brand-txt">누가<span className="brand-en">NUGA</span></span>
      </button>
      <button className={`mini-link ${view === "mobile" ? "on" : ""}`} aria-current={view === "mobile" ? "page" : undefined} onClick={() => setPage(view === "mobile" ? "main" : "mobile")} title="폰 앱 화면을 PC에서 확인 (테스트용)"><Icon name="phone" size={11} />모바일 확인</button>
      <AreaSwitcher />
      {title && <h1 className="page-title">{title}</h1>}
      {view === "mobile" && <span className="chip outline page-chip">테스트용</span>}
      <span className="sep" />
      <span className="sync-dot" title={sync.state === "error" ? `동기화 오류 · ${sync.message}` : `${sync.message}${sync.lastAt ? ` · 마지막 ${sync.lastAt.slice(11, 16)}` : ""}`}>
        <i className={`led ${sync.state === "idle" ? "on" : sync.state === "busy" ? "busy" : sync.state === "error" ? "err" : ""}`} />
      </span>
      <button className={`btn ${backlog ? "warn-outline" : ""}`} onClick={() => openInbox({ backlog: true })} title="아직 처리하지 않은 추천·수동 기록">미반영 <b className="num">{backlog}</b></button>
      <SaveMenu />
      <button className={`btn ${view === "draft" ? "active" : ""}`} aria-current={view === "draft" ? "page" : undefined} onClick={() => setPage(view === "draft" ? "main" : "draft")} title="학기 말: 누가기록으로 세특 초안을 만들고 검토"><Icon name="pen" />생기부 생성</button>
      <button className={`btn icon ${view === "settings" ? "active" : ""}`} aria-current={view === "settings" ? "page" : undefined} onClick={() => setPage(view === "settings" ? "main" : "settings")} title="설정" aria-label="설정"><Icon name="gear" /></button>
    </header>
  );
}

/**
 * [저장 | ▾]: 누르면 바로 저장, 꺾쇠는 내보내기 메뉴 (누가기록 엑셀 · 전체 백업 JSON).
 * 바깥 클릭·Esc·Tab(초점이 메뉴 밖으로)으로 닫힌다. 항목을 고르거나 Esc 로 닫으면 초점은 꺾쇠로 돌아간다
 */
function SaveMenu() {
  const doc = useStore((s) => s.doc);
  const flush = useStore((s) => s.flush);
  const toast = useStore((s) => s.toast);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const save = async () => {
    setSaving(true);
    try { await flush(); toast({ text: "저장했습니다" }); }
    finally { setTimeout(() => setSaving(false), 400); }
  };
  const exportExcel = async () => { if (await exportRecordsExcel(doc)) toast({ text: "누가기록을 엑셀로 내보냈습니다" }); };
  const exportJson = async () => {
    const ok = await saveFile(`누가-백업-${nowIso().slice(0, 10)}.json`, toExportJson(doc, nowIso()), [{ name: "JSON", extensions: ["json"] }]);
    if (ok) toast({ text: "전체 백업(JSON)으로 내보냈습니다" });
  };
  const run = (fn: () => Promise<void>) => { setOpen(false); caretRef.current?.focus(); void fn(); };
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const down = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); caretRef.current?.focus(); return; }
      if (e.key === "Tab") { setOpen(false); return; } // 초점은 브라우저가 다음 단추로 옮긴다
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className={`split-btn ${open ? "open" : ""}`} ref={boxRef}>
      <button className="btn split-main" onClick={save} disabled={saving} title="지금까지의 변경을 저장"><Icon name="check" />{saving ? "저장 중" : "저장"}</button>
      <button ref={caretRef} className="btn split-caret" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="내보내기 · 백업" title="내보내기 · 백업">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="menu save-menu" role="menu" aria-label="내보내기 · 백업" ref={menuRef}>
          <button className="item" role="menuitem" onClick={() => run(exportExcel)}><Icon name="excel" />누가기록 엑셀로 내보내기<span className="sub">반별 시트</span></button>
          <button className="item" role="menuitem" onClick={() => run(exportJson)}><Icon name="json" />전체 백업 (JSON)<span className="sub">설정·기록 모두</span></button>
        </div>
      )}
    </div>
  );
}

/**
 * 작업면: 3px 유리 베젤(.sheet)에 끼운 빛나는 종이(.paper). 머리 띠(TopBar) 아래의 모든 내용을 감싼다.
 * .sheet/.paper 에는 transform·filter·contain·will-change·backdrop-filter·isolation·z-index 를 주지 않는다
 * (Modal 의 .overlay 가 포털 없이 이 안에 그려지므로).
 */
export function Sheet({ children }: { children: React.ReactNode }) {
  return <div className="sheet"><div className="paper">{children}</div></div>;
}

/**
 * 페이지 머리 띠 (두 번째 줄): 페이지 슬롯 · 가운데 · ──── · 오른쪽 · 엑셀.
 * 페이지 이름은 상단 바(영역 옆)에 있으므로 여기에는 제목을 두지 않는다 (title 은 부르는 쪽의 표시용으로만 남는다).
 * 보일 것이 없으면 띠 자체를 그리지 않는다
 */
export function TopBar({ titleSlot, center, onExcel, right }: { title: string; titleSlot?: React.ReactNode; center?: React.ReactNode; onExcel?: () => void | Promise<unknown>; right?: React.ReactNode }) {
  if (!titleSlot && !center && !right && !onExcel) return null;
  return (
    <div className="topbar">
      {titleSlot}
      {center}
      <span className="sep" />
      {right}
      {onExcel && <button className="btn" onClick={() => onExcel()}><Icon name="excel" />엑셀</button>}
    </div>
  );
}

/** 반 탭. right 는 탭 줄 오른쪽 끝의 작은 동작 (예: 현황판의 AI 도달 정도 추정) */
export function ClassTabs({ extra, right }: { extra?: (cls: string) => React.ReactNode; right?: React.ReactNode }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const setClass = useStore((s) => s.setClass);
  const classes = classList(doc);
  useEffect(() => { if (classes.length && !classes.includes(cls)) setClass(classes[0]); }, [classes.join(","), cls]);
  return (
    <div className="tabsrow">
      {classes.map((c) => (
        <button key={c} className={`tab ${c === cls ? "active" : ""}`} aria-current={c === cls ? "true" : undefined} onClick={() => setClass(c)}>{c}{extra?.(c)}</button>
      ))}
      {classes.length === 0 && <span className="muted small" style={{ padding: "10px 0" }}>설정에서 반·명단을 등록하세요</span>}
      {right && <span className="tabs-act">{right}</span>}
    </div>
  );
}

export function useClassStudents() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  return useMemo(() => doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no), [doc.students, cls]);
}

export function useDebounced<T>(v: T, ms = 200): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
