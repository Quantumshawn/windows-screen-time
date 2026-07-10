import { useState } from "react";
import { clearStoredToken, getStoredToken } from "./api";
import { TokenGate } from "./pages/TokenGate";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { BarsIcon, ClockIcon, SlidersIcon } from "./icons";

type View = "today" | "history" | "settings";

const TABS = [
  { id: "today", label: "Today", Icon: ClockIcon },
  { id: "history", label: "History", Icon: BarsIcon },
  { id: "settings", label: "Settings", Icon: SlidersIcon },
] as const;

export default function App() {
  const [hasToken, setHasToken] = useState(() => getStoredToken() !== null);
  const [view, setView] = useState<View>("today");

  const handleAuthError = () => {
    clearStoredToken();
    setHasToken(false);
  };

  if (!hasToken) {
    return <TokenGate onSaved={() => setHasToken(true)} />;
  }

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar" aria-label="Sidebar">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400/30 to-indigo-600/15 text-indigo-300 ring-1 ring-indigo-400/25">
            <ClockIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">ScreenTime</p>
            <p className="text-[11px] text-slate-500">Active PC time</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {TABS.map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`sidebar-nav-btn ${active ? "sidebar-nav-btn-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <tab.Icon className={`h-5 w-5 shrink-0 ${active ? "text-indigo-300" : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-3">
          <p className="text-[11px] font-medium text-slate-400">Tracking tip</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            AFK, lock screen, and sleep never count. Only real keyboard &amp; mouse activity.
          </p>
        </div>
      </aside>

      <div className="app-main">
        {view === "today" && <Today onAuthError={handleAuthError} />}
        {view === "history" && <History onAuthError={handleAuthError} />}
        {view === "settings" && <Settings onAuthError={handleAuthError} />}
      </div>

      {/* Mobile floating dock */}
      <nav className="dock-wrap" aria-label="Main">
        <div className="dock">
          {TABS.map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`dock-tab ${active ? "dock-tab-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <tab.Icon className={`h-5 w-5 ${active ? "text-indigo-300" : ""}`} />
                <span className={`text-[10px] font-semibold tracking-wide ${active ? "text-indigo-200" : ""}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
