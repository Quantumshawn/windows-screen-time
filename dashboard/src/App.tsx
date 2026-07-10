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
    <div className="pb-24">
      {view === "today" && <Today onAuthError={handleAuthError} />}
      {view === "history" && <History onAuthError={handleAuthError} />}
      {view === "settings" && <Settings onAuthError={handleAuthError} />}

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-white/[0.06] bg-slate-950/80 backdrop-blur-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md">
          {TABS.map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className="flex flex-1 flex-col items-center gap-1 py-2.5"
              >
                <span
                  className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-indigo-500/15 text-indigo-400" : "text-slate-500"
                  }`}
                >
                  <tab.Icon className="h-5 w-5" />
                </span>
                <span
                  className={`text-[11px] font-medium transition-colors ${
                    active ? "text-indigo-400" : "text-slate-500"
                  }`}
                >
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
