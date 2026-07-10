import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchRange, localDateString, type DayBreakdown, type RangeResponse } from "../api";

type RangeMode = "week" | "month";

// Single-series magnitude chart: one flat series color, no legend (title names it).
// The bars are the only chart element that carries the accent hue — everything else
// (axis, gridlines, labels) stays in muted/ink tokens per the dataviz mark specs.
const BAR_COLOR = "#6366f1"; // tailwind indigo-500
const BAR_COLOR_TODAY = "#818cf8"; // indigo-400 — today's bar is still live/growing
const GRID_COLOR = "#2c2c2a";
const MUTED_TEXT = "#898781";
const TODAY_TEXT = "#c7d2fe";

const CHART_H = 160;
const AXIS_W = 34;
const TOP_PAD = 12; // headroom so the topmost gridline's label isn't clipped by the viewBox edge
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
// Fixed "logical" plot width in the SVG's own coordinate space — width="100%" then scales
// this uniformly to fit whatever the container's real pixel width is. Bar:gap ratio (not
// an absolute pixel size) is what's tuned here; it holds regardless of screen size. One
// constant works for both modes: 7 bars read as comfortably chunky, 30 as a thin, dense
// strip — deliberately different characters (day-precision vs. pattern-at-a-glance).
const PLOT_UNITS = 320;
const BAR_FRACTION = 0.62;

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatAxisLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = seconds / 3600;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function dayLabel(dateStr: string, mode: RangeMode): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return mode === "week" ? date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) : String(d);
}

const NICE_STEPS_SEC = [1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200, 57600, 86400];

function niceMax(maxSeconds: number): number {
  for (const step of NICE_STEPS_SEC) {
    if (maxSeconds <= step) return step;
  }
  return Math.ceil(maxSeconds / 14400) * 14400;
}

interface HistoryProps {
  onAuthError: () => void;
}

export function History({ onAuthError }: HistoryProps) {
  const [mode, setMode] = useState<RangeMode>("week");
  const [range, setRange] = useState<RangeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const load = useCallback(
    async (m: RangeMode) => {
      setLoading(true);
      const spanDays = m === "week" ? 7 : 30;
      const to = new Date();
      const from = new Date(to.getTime() - (spanDays - 1) * 86_400_000);
      try {
        const data = await fetchRange(localDateString(from), localDateString(to));
        setRange(data);
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
    },
    [onAuthError],
  );

  useEffect(() => {
    setActiveIndex(null);
    load(mode);
  }, [mode, load]);

  const days = range?.days ?? [];
  const todayStr = localDateString(new Date());
  const maxSeconds = niceMax(Math.max(0, ...days.map((d) => d.totalSeconds)));
  const barCount = Math.max(days.length, 1);
  const slot = PLOT_UNITS / barCount;
  const barW = slot * BAR_FRACTION;
  const viewBoxW = PLOT_UNITS + AXIS_W;
  const active = activeIndex !== null ? days[activeIndex] : undefined;

  return (
    <div className="min-h-screen bg-slate-950 px-5 pb-10 pt-8 text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium uppercase tracking-wide text-slate-500">History</h1>
        <div className="flex rounded-lg bg-slate-900 p-1 text-xs">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                mode === m ? "bg-indigo-600 text-white" : "text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="mt-8 text-sm text-slate-500">Loading…</p>}

      {error && !loading && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-red-400">{error}</p>
          <button onClick={() => load(mode)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-6">
            <svg
              viewBox={`0 0 ${viewBoxW} ${TOP_PAD + CHART_H + 24}`}
              width="100%"
              height={TOP_PAD + CHART_H + 24}
              role="img"
              aria-label={`Screen time, ${mode === "week" ? "last 7 days" : "last 30 days"}`}
            >
              {GRID_FRACTIONS.map((frac) => {
                const y = TOP_PAD + CHART_H - CHART_H * frac;
                return (
                  <g key={frac}>
                    <line x1={AXIS_W} y1={y} x2={viewBoxW} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
                    <text x={AXIS_W - 6} y={y + 3} textAnchor="end" fontSize={9} fill={MUTED_TEXT}>
                      {frac === 0 ? "0" : formatAxisLabel(maxSeconds * frac)}
                    </text>
                  </g>
                );
              })}

              {days.map((day, i) => {
                const isToday = day.date === todayStr;
                const h = maxSeconds > 0 ? (day.totalSeconds / maxSeconds) * CHART_H : 0;
                const x = AXIS_W + i * slot + (slot - barW) / 2;
                const y = TOP_PAD + CHART_H - h;
                const isActive = activeIndex === i;
                const showLabel = mode === "week" || isToday || i % 5 === 0;
                return (
                  <g
                    key={day.date}
                    onClick={() => setActiveIndex(isActive ? null : i)}
                    className="cursor-pointer"
                  >
                    {/* hit target bigger than the bar itself, per interaction spec */}
                    <rect x={AXIS_W + i * slot} y={TOP_PAD} width={slot} height={CHART_H} fill="transparent" />
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(h, day.totalSeconds > 0 ? 2 : 0)}
                      rx={4}
                      fill={isToday ? BAR_COLOR_TODAY : BAR_COLOR}
                      opacity={isActive ? 1 : 0.85}
                    />
                    {showLabel && (
                      <text
                        x={x + barW / 2}
                        y={TOP_PAD + CHART_H + 14}
                        textAnchor="middle"
                        fontSize={9}
                        fill={isToday ? TODAY_TEXT : MUTED_TEXT}
                        fontWeight={isToday ? 600 : 400}
                      >
                        {dayLabel(day.date, mode)}
                      </text>
                    )}
                  </g>
                );
              })}

              {active && (
                <ChartTooltip day={active} x={AXIS_W + (activeIndex ?? 0) * slot + slot / 2} viewBoxW={viewBoxW} />
              )}
            </svg>
          </div>

          <p className="mt-4 text-center text-xs text-slate-600">Tap a bar for that day's total. Today is still counting.</p>
        </>
      )}
    </div>
  );
}

function ChartTooltip({ day, x, viewBoxW }: { day: DayBreakdown; x: number; viewBoxW: number }) {
  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const text = `${dateLabel} · ${formatDuration(day.totalSeconds)}`;
  const boxW = Math.max(70, text.length * 5.6);
  const boxX = Math.min(Math.max(x - boxW / 2, 2), viewBoxW - boxW - 2);

  return (
    <g pointerEvents="none">
      <rect x={boxX} y={4} width={boxW} height={20} rx={5} fill="#0b0b0b" stroke={GRID_COLOR} />
      <text x={boxX + boxW / 2} y={18} textAnchor="middle" fontSize={10} fill="#ffffff">
        {text}
      </text>
    </g>
  );
}
