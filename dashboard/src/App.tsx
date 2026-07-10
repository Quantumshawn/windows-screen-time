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
    <div>
      {view === "today" && <Today onAuthError={handleAuthError} />}
      {view === "history" && <History onAuthError={handleAuthError} />}
      {view === "settings" && <Settings onAuthError={handleAuthError} />}

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
