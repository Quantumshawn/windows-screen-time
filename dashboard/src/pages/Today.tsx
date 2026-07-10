import { useCallback, useEffect, useState } from "react";
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
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <span className="animate-pulse text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-200">
          Retry
        </button>
      </div>
    );
  }

  const total = summary?.totalSeconds ?? 0;
  const apps = summary?.apps ?? [];
  const categories = summary?.categories ?? [];
  const maxSeconds = apps.length > 0 ? apps[0].seconds : 1;
  // A single bucket (everything uncategorized, or one category covering all of today)
  // needs no part-to-whole breakdown — the per-app list below already shows it.
  const showCategoryBreakdown = categories.length > 1;

  return (
    <div className="min-h-screen px-5 pb-10 pt-8 text-slate-100">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Today</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
      </header>

      <TodayHero total={total} limitMinutes={limitMinutes} />

      {showCategoryBreakdown && (
        <div className="surface mt-4 rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/5">
            {categories.map((cat, i) => (
              <div
                key={cat.categoryId ?? "uncategorized"}
                style={{
                  width: `${(cat.seconds / total) * 100}%`,
                  backgroundColor: cat.categoryColor,
                  marginRight: i < categories.length - 1 ? 2 : 0,
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {categories.map((cat) => (
              <div key={cat.categoryId ?? "uncategorized"} className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.categoryColor }} />
                <span className="text-slate-300">{cat.categoryName}</span>
                <span className="tabular-nums text-slate-500">{formatDuration(cat.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface mt-4 rounded-3xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apps</p>
        <div className="mt-4 space-y-4">
          {apps.length === 0 && <p className="text-sm text-slate-500">No activity tracked yet today.</p>}
          {apps.map((app) => (
            <div key={app.exe}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-slate-200">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: app.categoryColor }} />
                  {app.displayName}
                </span>
                <span className="tabular-nums text-slate-400">{formatDuration(app.seconds)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.max(4, (app.seconds / maxSeconds) * 100)}%`,
                    backgroundColor: app.categoryColor,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const RING_R = 66;
const RING_STROKE = 13;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function TodayHero({ total, limitMinutes }: { total: number; limitMinutes: number | null }) {
  if (limitMinutes === null) {
    return (
      <div className="surface rounded-3xl px-6 py-9 text-center">
        <p className="text-6xl font-bold tracking-tight tabular-nums">{formatDuration(total)}</p>
        <p className="mt-2 text-sm text-slate-500">of active time today</p>
      </div>
    );
  }

  const limitSeconds = limitMinutes * 60;
  const ratio = total / limitSeconds;
  const over = ratio >= 1;
  const progress = Math.min(1, ratio);
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  const fillColor = over ? "#f59e0b" : "#818cf8";

  return (
    <div className="surface rounded-3xl px-6 py-8">
      <div className="relative mx-auto h-[168px] w-[168px]">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={RING_R} fill="none" stroke="#6366f1" strokeOpacity={0.14} strokeWidth={RING_STROKE} />
          <circle
            cx="80"
            cy="80"
            r={RING_R}
            fill="none"
            stroke={fillColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset,stroke]"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-4xl font-bold tracking-tight tabular-nums">{formatDuration(total)}</p>
          <p className="mt-1 text-xs text-slate-500">of {formatDuration(limitSeconds)} limit</p>
        </div>
      </div>
      {over && (
        <p className="mt-5 text-center text-sm font-medium text-amber-400">
          {formatDuration(total - limitSeconds)} over your limit today
        </p>
      )}
    </div>
  );
}
