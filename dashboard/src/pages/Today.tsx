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
  const maxSeconds = apps.length > 0 ? apps[0].seconds : 1;

  return (
    <div className="min-h-screen bg-slate-950 px-5 pb-10 pt-8 text-slate-100">
      <h1 className="text-sm font-medium uppercase tracking-wide text-slate-500">Today</h1>
      <p className="mt-1 text-5xl font-semibold tabular-nums">{formatDuration(total)}</p>

      <div className="mt-8 space-y-3">
        {apps.length === 0 && <p className="text-sm text-slate-500">No activity tracked yet today.</p>}
        {apps.map((app) => (
          <div key={app.exe}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-200">{app.exe}</span>
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
