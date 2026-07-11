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
    <div className="page page-center relative overflow-hidden text-slate-100 lg:max-w-none lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(14,165,233,0.28),transparent_55%)]" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl" />

      {/* Mobile: single card · Desktop: split brand + form */}
      <div className="surface animate-rise relative w-full max-w-sm rounded-[2rem] px-6 py-9 text-center sm:px-7 sm:py-10 lg:hidden">
        <GateForm value={value} setValue={setValue} onSubmit={handleSubmit} />
      </div>

      <div className="surface token-gate-desktop animate-rise relative hidden rounded-[2rem] lg:grid">
        <div className="token-gate-brand relative flex flex-col justify-between border-r border-white/[0.06] bg-gradient-to-br from-sky-500/15 via-transparent to-cyan-400/5 px-10 py-12">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/30 to-sky-600/15 text-sky-300 ring-1 ring-sky-400/25">
              <ClockIcon className="h-7 w-7" />
            </div>
            <h1 className="mt-8 text-3xl font-bold tracking-tight text-white">ScreenTime</h1>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-400">
              Active PC time only — real keyboard and mouse input. AFK, lock, and sleep never inflate your totals.
            </p>
          </div>
          <ul className="mt-10 space-y-3 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Live today dashboard
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Week &amp; month history
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Categories, limits &amp; push alerts
            </li>
          </ul>
        </div>
        <div className="flex flex-col justify-center px-10 py-12">
          <h2 className="text-xl font-semibold text-white">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-400">Use the dashboard token from your deployment.</p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
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
              className="field w-full rounded-2xl px-4 py-3.5 text-slate-100 placeholder:text-slate-600"
            />
            <button type="submit" className="btn-primary mt-2 w-full rounded-2xl px-4">
              Connect
            </button>
          </form>
        </div>
      </div>

      <p className="animate-rise-delay-1 relative mt-8 text-center text-[11px] text-slate-600 lg:hidden">
        Active time only · AFK doesn&apos;t count
      </p>
    </div>
  );
}

function GateForm({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-sky-400/25 to-sky-600/10 text-sky-300 shadow-[0_0_40px_-8px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/20">
        <ClockIcon className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">ScreenTime</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
        Enter your dashboard token to unlock today&apos;s focus stats.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-3 text-left">
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
    </>
  );
}
