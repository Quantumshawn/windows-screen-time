import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ApiError, fetchSettings, fetchSummary, formatDuration, getTodayRange, type SummaryResponse } from "../api";

interface TodayProps {
  onAuthError: () => void;
}

export function Today({ onAuthError }: TodayProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [limitMinutes, setLimitMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { from, to } = getTodayRange();
    try {
      const [data, settings] = await Promise.all([fetchSummary(from, to), fetchSettings()]);
      setSummary(data);
      setLimitMinutes(settings.dailyLimitMinutes);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="page page-center text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
          <span className="animate-pulse-soft text-sm text-slate-500">Gathering today…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page-center text-slate-100">
        <div className="surface w-full max-w-md rounded-[1.75rem] px-8 py-10">
          <p className="text-red-400">{error}</p>
          <button type="button" onClick={load} className="btn-primary mt-5 w-full rounded-full px-6">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const total = summary?.totalSeconds ?? 0;
  const apps = summary?.apps ?? [];
  const categories = summary?.categories ?? [];
  const maxSeconds = apps.length > 0 ? apps[0].seconds : 1;
  const showCategoryBreakdown = categories.length > 1;

  return (
    <div className="page text-slate-100">
      <header className="animate-rise mb-6 flex items-end justify-between gap-3 lg:mb-8">
        <div className="min-w-0">
          <p className="eyebrow">Today</p>
          <p className="mt-1.5 truncate text-[15px] font-medium text-slate-300 lg:text-lg">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400">
          Active only
        </div>
      </header>

      <div className="today-layout">
        <div className="today-hero animate-rise-delay-1">
          <TodayHero total={total} limitMinutes={limitMinutes} />
        </div>

        {showCategoryBreakdown && (
          <div className="today-breakdown surface animate-rise-delay-2 rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Breakdown</p>
              <p className="text-[11px] text-slate-500">{categories.length} categories</p>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/[0.04] lg:h-3.5">
              {categories.map((cat, i) => (
                <div
                  key={cat.categoryId ?? "uncategorized"}
                  className="relative h-full transition-[width] duration-500"
                  style={{
                    width: `${(cat.seconds / total) * 100}%`,
                    backgroundColor: cat.categoryColor,
                    marginRight: i < categories.length - 1 ? 2 : 0,
                    boxShadow: `0 0 12px -2px ${cat.categoryColor}88`,
                  }}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:gap-2.5">
              {categories.map((cat) => {
                const pct = total > 0 ? Math.round((cat.seconds / total) * 100) : 0;
                return (
                  <div
                    key={cat.categoryId ?? "uncategorized"}
                    className="flex min-h-[3rem] items-center gap-2.5 rounded-2xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.04]"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.categoryColor, boxShadow: `0 0 8px ${cat.categoryColor}66` }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-200 lg:text-sm">{cat.categoryName}</p>
                      <p className="num text-[11px] text-slate-500">
                        {formatDuration(cat.seconds)} · {pct}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="today-apps surface animate-rise-delay-2 rounded-[1.75rem] p-4 sm:p-5 lg:flex lg:h-full lg:flex-col lg:p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Apps</p>
            {apps.length > 0 && <p className="num text-[11px] text-slate-500">{apps.length} tracked</p>}
          </div>
          <div className="mt-3 lg:mt-4 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {apps.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-10 text-center lg:py-16">
                <p className="text-sm font-medium text-slate-400">No activity yet today</p>
                <p className="mt-1 text-xs text-slate-600">The agent will fill this in as you work.</p>
              </div>
            )}
            {apps.map((app, index) => {
              const pct = Math.max(4, (app.seconds / maxSeconds) * 100);
              return (
                <div key={app.exe} className="row-tap rounded-2xl px-1.5 py-3.5 lg:px-2">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="rank flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: app.categoryColor, boxShadow: `0 0 8px ${app.categoryColor}77` }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-100">
                      {app.displayName}
                    </span>
                    <span className="num shrink-0 pl-2 text-[15px] font-semibold text-slate-300">
                      {formatDuration(app.seconds)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]" style={{ marginLeft: "2.35rem" }}>
                    <div
                      className="bar-fill h-full rounded-full transition-[width] duration-700 ease-out"
                      style={
                        {
                          width: `${pct}%`,
                          "--bar": app.categoryColor,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const RING_R = 68;
const RING_STROKE = 11;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function TodayHero({ total, limitMinutes }: { total: number; limitMinutes: number | null }) {
  if (limitMinutes === null) {
    return (
      <div className="surface overflow-hidden rounded-[1.75rem] px-5 py-9 text-center sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(129,140,248,0.14),transparent_60%)]" />
        <p className="relative text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-indigo-300/70">
          Active time
        </p>
        <p className="display-num relative mt-3 text-[3.25rem] font-bold leading-none tracking-tight min-[380px]:text-[3.75rem] lg:text-6xl">
          {formatDuration(total)}
        </p>
        <p className="relative mt-3 text-sm text-slate-500 lg:text-[15px]">focused screen time so far today</p>
        <div className="relative mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
      </div>
    );
  }

  const limitSeconds = limitMinutes * 60;
  const ratio = total / limitSeconds;
  const over = ratio >= 1;
  const progress = Math.min(1, ratio);
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  const fillColor = over ? "#fbbf24" : "#818cf8";
  const trackColor = over ? "rgba(251, 191, 36, 0.12)" : "rgba(99, 102, 241, 0.14)";
  const remaining = Math.max(0, limitSeconds - total);

  return (
    <div className="surface overflow-hidden rounded-[1.75rem] px-5 py-7 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(129,140,248,0.12),transparent_55%)]" />
      <div className="relative mx-auto h-[176px] w-[176px] min-[380px]:h-[188px] min-[380px]:w-[188px] lg:h-[210px] lg:w-[210px]">
        <svg
          viewBox="0 0 160 160"
          className={`h-full w-full -rotate-90 ${over ? "ring-glow-warn" : "ring-glow"}`}
        >
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={over ? "#fde68a" : "#c7d2fe"} />
              <stop offset="100%" stopColor={fillColor} />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r={RING_R} fill="none" stroke={trackColor} strokeWidth={RING_STROKE} />
          <circle
            cx="80"
            cy="80"
            r={RING_R}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <p
            className={`text-[2.1rem] font-bold leading-none min-[380px]:text-[2.35rem] lg:text-4xl ${over ? "display-num-warn" : "display-num"}`}
          >
            {formatDuration(total)}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-slate-500 lg:text-xs">
            of {formatDuration(limitSeconds)} limit
          </p>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 lg:mt-6 lg:gap-3">
        <div className="rounded-2xl bg-white/[0.03] px-3 py-3.5 text-center ring-1 ring-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Used</p>
          <p className="num mt-1 text-[15px] font-semibold text-slate-200 lg:text-base">
            {Math.min(100, Math.round(ratio * 100))}%
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] px-3 py-3.5 text-center ring-1 ring-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {over ? "Over by" : "Left"}
          </p>
          <p className={`num mt-1 text-[15px] font-semibold lg:text-base ${over ? "text-amber-300" : "text-slate-200"}`}>
            {formatDuration(over ? total - limitSeconds : remaining)}
          </p>
        </div>
      </div>

      {over && (
        <p className="relative mt-4 text-center text-sm font-medium text-amber-300/90">
          You&apos;ve crossed today&apos;s limit — take a breath.
        </p>
      )}
    </div>
  );
}
