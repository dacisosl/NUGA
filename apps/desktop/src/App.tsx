import React, { useEffect, useMemo, useState } from "react";
import { classList, useStore, type Page } from "./store";
import { Icon, Toasts } from "./components/ui";
import { RecordsPage } from "./pages/RecordsPage";
import { DraftPage } from "./pages/DraftPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Onboarding } from "./pages/Onboarding";
import { SupplementModal } from "./components/SupplementModal";
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
  const queue = useStore((s) => s.supplementQueue);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (loaded) { syncEngine.start(); return () => syncEngine.stop(); } }, [loaded]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const map: Record<string, Page> = { "1": "records", "2": "draft", "3": "review", "4": "settings" };
      if (map[e.key]) { e.preventDefault(); setPage(map[e.key]); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [setPage]);

  if (!loaded) return <div className="onb"><span className="spin" /></div>;
  if (!onboarded) return <><Onboarding /><Toasts /></>;

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {page === "records" && <RecordsPage />}
        {page === "draft" && <DraftPage />}
        {page === "review" && <ReviewPage />}
        {page === "settings" && <SettingsPage />}
      </main>
      <Toasts />
      {queue.length > 0 && <SupplementModal />}
    </div>
  );
}

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("nuga.sidebar") === "1"; } catch { return false; } });
  const toggle = () => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem("nuga.sidebar", v ? "1" : "0"); } catch { /* ignore */ } };
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const doc = useStore((s) => s.doc);
  const sync = useStore((s) => s.syncStatus);
  const pending = useMemo(() => doc.records.filter((r) => r.status === "pending").length, [doc.records]);
  const openSupplement = useStore((s) => s.openSupplement);
  const supp = doc.settings.supplementEnabled;
  const items: { key: Page; label: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
    { key: "records", label: "누가기록", icon: "list" },
    { key: "draft", label: "초안 작성", icon: "pen" },
    { key: "review", label: "검토", icon: "check" },
  ];
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand"><span className="dot" />{!collapsed && "누가"}<button className="fold" onClick={toggle} title={collapsed ? "펼치기" : "접기"} aria-label="사이드바 접기"><Icon name={collapsed ? "right" : "left"} size={14} /></button></div>
      {items.map((it) => (
        <button key={it.key} className={`nav ${page === it.key ? "active" : ""}`} onClick={() => setPage(it.key)} title={it.label}>
          <Icon name={it.icon} /><span className="lbl">{it.label}</span>
        </button>
      ))}
      {supp && pending > 0 && (
        <button className="btn primary sm" style={{ margin: "8px 12px" }} onClick={() => openSupplement(doc.records.filter((r) => r.status === "pending").sort((a, b) => a.time.localeCompare(b.time)).map((r) => r.id))}>
          보완 {pending}건
        </button>
      )}
      <div className="spacer" />
      <div className="syncbox">
        <div className="st" title={sync.lastAt ? `마지막 ${sync.lastAt.slice(11, 16)}` : ""}>
          <span className={`led ${sync.state === "idle" ? "on" : sync.state === "busy" ? "busy" : ""}`} style={sync.state === "error" ? { background: "var(--warn)" } : undefined} />
          <span className="ellipsis lbl">{sync.state === "error" ? `오류 · ${sync.message}` : sync.message}</span>
        </div>
        <button className={`nav ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")}><Icon name="gear" /><span className="lbl">설정</span></button>
      </div>
    </aside>
  );
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
  return (
    <div className="topbar">
      {titleSlot ?? <h1>{title}</h1>}
      <AreaSwitcher />
      {center}
      <span className="sep" />
      {right}
      {onExcel && <button className="btn" onClick={() => onExcel()}><Icon name="excel" />엑셀</button>}
      <button className="btn" onClick={exportJson}><Icon name="json" />JSON</button>
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
