// 전역 스타일을 맨 먼저: 화면별 스타일(계단·모바일 미리보기)이 뒤에 붙어 같은 특정도에서 이긴다
import "./styles.css";
import React, { useEffect, useMemo, useState } from "react";
import { classList, useStore, type Page } from "./store";
import { Icon, Toasts } from "./components/ui";
import { QuickAdd, RecordsPage } from "./pages/RecordsPage";
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

/**
 * 상단 바 (사이드바 대신): 누가 로고(아래 작은 '모바일 확인') · 영역 · ──── · 미반영 · +기록 · 저장 · 생기부 생성 · 설정.
 * 교사가 매일 보는 것은 현황판 하나. 생기부 생성은 시즌에만 들어가는 문이다.
 */
function TopNav({ view }: { view: Page }) {
  const setPage = useStore((s) => s.setPage);
  const doc = useStore((s) => s.doc);
  const sync = useStore((s) => s.syncStatus);
  const backlog = useBacklogCount();
  const openInbox = useStore((s) => s.openInbox);
  const flush = useStore((s) => s.flush);
  const toast = useStore((s) => s.toast);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await flush(); toast({ text: "저장했습니다" }); }
    finally { setTimeout(() => setSaving(false), 400); }
  };
  const exportJson = async () => {
    const ok = await saveFile(`누가-백업-${nowIso().slice(0, 10)}.json`, toExportJson(doc, nowIso()), [{ name: "JSON", extensions: ["json"] }]);
    if (ok) toast({ text: "백업 파일로 내보냈습니다" });
  };
  return (
    <header className="topnav">
      <button className="brand" onClick={() => setPage("main")} title="현황판으로">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 26h9v-8h8v-8h9" /><circle cx="29" cy="10" r="1.8" fill="#DCEBFF" /></svg>
        <span className="brand-txt">누가<span className="brand-en">NUGA</span></span>
      </button>
      <button className={`mini-link ${view === "mobile" ? "on" : ""}`} onClick={() => setPage(view === "mobile" ? "main" : "mobile")} title="폰 앱 화면을 PC에서 확인 (테스트용)"><Icon name="phone" size={11} />모바일 확인</button>
      <AreaSwitcher />
      <span className="sep" />
      <span className="sync-dot" title={sync.state === "error" ? `동기화 오류 · ${sync.message}` : `${sync.message}${sync.lastAt ? ` · 마지막 ${sync.lastAt.slice(11, 16)}` : ""}`}>
        <i className={`led ${sync.state === "idle" ? "on" : sync.state === "busy" ? "busy" : sync.state === "error" ? "err" : ""}`} />
      </span>
      <button className={`btn ${backlog ? "warn-outline" : ""}`} onClick={() => openInbox({ backlog: true })} title="아직 처리하지 않은 추천·수동 기록">미반영 <b className="num">{backlog}</b></button>
      <button className="btn" onClick={() => setAdding(true)} title="PC에서 바로 기록"><Icon name="plus" />기록</button>
      <button className="btn" onClick={save} disabled={saving} title="지금까지의 변경을 저장 · 길게 보려면 백업(JSON)" onContextMenu={(e) => { e.preventDefault(); exportJson(); }}><Icon name="json" />{saving ? "저장 중" : "저장"}</button>
      <button className={`btn ${view === "draft" ? "active" : ""}`} onClick={() => setPage(view === "draft" ? "main" : "draft")} title="학기 말: 누가기록으로 세특 초안을 만들고 검토"><Icon name="pen" />생기부 생성</button>
      <button className={`btn icon ${view === "settings" ? "active" : ""}`} onClick={() => setPage(view === "settings" ? "main" : "settings")} title="설정" aria-label="설정"><Icon name="gear" /></button>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </header>
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

/** 모든 페이지에서 같은 자리: 제목 · 과목 · (페이지 슬롯) · 엑셀 · JSON */
/** titleSlot 을 주면 페이지 제목 대신 그 자리에 표시한다 (예: 2p 개별·일괄 전환) */
export function TopBar({ title, titleSlot, center, onExcel, right }: { title: string; titleSlot?: React.ReactNode; center?: React.ReactNode; onExcel?: () => void | Promise<unknown>; right?: React.ReactNode }) {
  const doc = useStore((s) => s.doc);
  const toast = useStore((s) => s.toast);
  const exportJson = async () => {
    const ok = await saveFile(`누가-백업-${nowIso().slice(0, 10)}.json`, toExportJson(doc, nowIso()), [{ name: "JSON", extensions: ["json"] }]);
    if (ok) toast({ text: "JSON 내보내기 완료" });
  };
  void exportJson;
  return (
    <div className="topbar">
      {titleSlot ?? <h1>{title}</h1>}
      {center}
      <span className="sep" />
      {right}
      {onExcel && <button className="btn" onClick={() => onExcel()}><Icon name="excel" />엑셀</button>}
    </div>
  );
}

export function ClassTabs({ extra }: { extra?: (cls: string) => React.ReactNode }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const setClass = useStore((s) => s.setClass);
  const classes = classList(doc);
  useEffect(() => { if (classes.length && !classes.includes(cls)) setClass(classes[0]); }, [classes.join(","), cls]);
  return (
    <div className="tabsrow">
      {classes.map((c) => (
        <button key={c} className={`tab ${c === cls ? "active" : ""}`} onClick={() => setClass(c)}>{c}{extra?.(c)}</button>
      ))}
      {classes.length === 0 && <span className="muted small" style={{ padding: "10px 0" }}>설정에서 반·명단을 등록하세요</span>}
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
