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
    <div className="page page-center relative overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(99,102,241,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-cyan-400/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="surface animate-rise relative w-full rounded-[2rem] px-6 py-9 text-center sm:px-7 sm:py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-indigo-400/25 to-indigo-600/10 text-indigo-300 shadow-[0_0_40px_-8px_rgba(99,102,241,0.55)] ring-1 ring-indigo-400/20">
          <ClockIcon className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">ScreenTime</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
          Enter your dashboard token to unlock today&apos;s focus stats.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-3 text-left">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Dashboard token
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste token…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="field w-full rounded-2xl px-4 py-3.5 text-slate-100 placeholder:text-slate-600"
          />
          <button type="submit" className="btn-primary mt-1 w-full rounded-2xl px-4">
            Connect
          </button>
        </form>
      </div>

      <p className="animate-rise-delay-1 relative mt-8 text-center text-[11px] text-slate-600">
        Active time only · AFK doesn&apos;t count
      </p>
    </div>
  );
}
