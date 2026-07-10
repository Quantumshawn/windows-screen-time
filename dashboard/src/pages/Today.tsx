import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchSummary, getTodayRange, type SummaryResponse } from "../api";

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

interface TodayProps {
  onAuthError: () => void;
}

export function Today({ onAuthError }: TodayProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { from, to } = getTodayRange();
    try {
      const data = await fetchSummary(from, to);
      setSummary(data);
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
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200">
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
    <div className="min-h-screen bg-slate-950 px-5 pb-10 pt-8 text-slate-100">
      <h1 className="text-sm font-medium uppercase tracking-wide text-slate-500">Today</h1>
      <p className="mt-1 text-5xl font-semibold tabular-nums">{formatDuration(total)}</p>

      {showCategoryBreakdown && (
        <div className="mt-6">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
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
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
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

      <div className="mt-8 space-y-3">
        {apps.length === 0 && <p className="text-sm text-slate-500">No activity tracked yet today.</p>}
        {apps.map((app) => (
          <div key={app.exe}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: app.categoryColor }} />
                {app.displayName}
              </span>
              <span className="tabular-nums text-slate-400">{formatDuration(app.seconds)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.max(4, (app.seconds / maxSeconds) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
