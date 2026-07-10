import { useState, type FormEvent } from "react";
import { setStoredToken } from "../api";
import { ClockIcon } from "../icons";

interface TokenGateProps {
  onSaved: () => void;
}

export function TokenGate({ onSaved }: TokenGateProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setStoredToken(trimmed);
    onSaved();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-slate-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-500/15 text-indigo-400">
        <ClockIcon className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">ScreenTime</h1>
      <p className="mt-2 mb-8 max-w-xs text-center text-sm text-slate-400">
        Enter your dashboard token to connect.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dashboard token"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="w-full rounded-2xl bg-indigo-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors active:bg-indigo-600"
        >
          Connect
        </button>
      </form>
    </div>
  );
}
