import { useState } from "react";
import { clearStoredToken, getStoredToken } from "./api";
import { TokenGate } from "./pages/TokenGate";
import { Today } from "./pages/Today";
import { History } from "./pages/History";

type View = "today" | "history";

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
    <div className="pb-16">
      {view === "today" ? <Today onAuthError={handleAuthError} /> : <History onAuthError={handleAuthError} />}

      <nav
        className="fixed inset-x-0 bottom-0 flex border-t border-slate-800 bg-slate-950/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {([
          { id: "today", label: "Today" },
          { id: "history", label: "History" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              view === tab.id ? "text-indigo-400" : "text-slate-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
