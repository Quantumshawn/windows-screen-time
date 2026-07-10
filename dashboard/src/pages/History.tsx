import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchRange,
  formatDuration,
  localDateString,
  type CategorySeconds,
  type DayBreakdown,
  type RangeResponse,
} from "../api";

type RangeMode = "week" | "month";

// Solid chart card so segment gaps are painted as real rects (not glass transparency).
const CARD_BG = "#0e1118";
const SURFACE = CARD_BG;
const GRID_COLOR = "rgba(255,255,255,0.06)";
const MUTED_TEXT = "#6b7280";
const TODAY_TEXT = "#c7d2fe";

const CHART_H = 168;
const AXIS_W = 34;
const TOP_PAD = 14;
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const PLOT_UNITS = 320;
const BAR_FRACTION = 0.62;
const SEGMENT_GAP = 2;

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

const categoryKey = (c: { categoryId: number | null }) => c.categoryId ?? "uncategorized";

function sortForStacking(cats: CategorySeconds[]): CategorySeconds[] {
  return [...cats].sort((a, b) => (a.categoryId ?? Infinity) - (b.categoryId ?? Infinity));
}

function collectLegend(days: DayBreakdown[]): CategorySeconds[] {
  const byKey = new Map<string | number, CategorySeconds>();
  for (const day of days) {
    for (const cat of day.categories) {
      const key = categoryKey(cat);
      if (!byKey.has(key)) byKey.set(key, cat);
    }
  }
  return sortForStacking([...byKey.values()]);
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
  const legend = collectLegend(days);
  const showLegend = legend.length > 1;
  const periodTotal = days.reduce((sum, d) => sum + d.totalSeconds, 0);
  const periodAvg = days.length > 0 ? periodTotal / days.length : 0;

  return (
    <div className="page text-slate-100">
      <header className="animate-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">History</p>
          {!loading && !error && (
            <p className="mt-1.5 text-sm text-slate-400">
              <span className="num font-semibold text-slate-100">{formatDuration(periodTotal)}</span>
              <span className="text-slate-600"> total · </span>
              <span className="num text-slate-300">{formatDuration(periodAvg)}</span>
              <span className="text-slate-600">/day</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-all active:scale-95 ${
                mode === m
                  ? "bg-gradient-to-b from-indigo-400 to-indigo-500 text-white shadow-[0_4px_14px_-4px_rgba(99,102,241,0.7)]"
                  : "text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="mt-16 flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
          <span className="animate-pulse-soft text-sm text-slate-500">Loading chart…</span>
        </div>
      )}

      {error && !loading && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <div className="surface w-full rounded-[1.75rem] px-8 py-8">
            <p className="text-red-400">{error}</p>
            <button type="button" onClick={() => load(mode)} className="btn-primary mt-4 w-full rounded-full px-5">
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <div
            className="animate-rise-delay-1 mt-5 overflow-hidden rounded-[1.75rem] border border-white/[0.06] p-4 pb-2 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.65)]"
            style={{ backgroundColor: CARD_BG }}
          >
            <svg
              viewBox={`0 0 ${viewBoxW} ${TOP_PAD + CHART_H + 24}`}
              width="100%"
              height={TOP_PAD + CHART_H + 24}
              role="img"
              aria-label={`Screen time, ${mode === "week" ? "last 7 days" : "last 30 days"}`}
              className="touch-manipulation select-none"
            >
              {GRID_FRACTIONS.map((frac) => {
                const y = TOP_PAD + CHART_H - CHART_H * frac;
                return (
                  <g key={frac}>
                    <line
                      x1={AXIS_W}
                      y1={y}
                      x2={viewBoxW}
                      y2={y}
                      stroke={GRID_COLOR}
                      strokeWidth={1}
                      strokeDasharray={frac === 0 ? undefined : "3 4"}
                    />
                    <text x={AXIS_W - 6} y={y + 3} textAnchor="end" fontSize={9} fill={MUTED_TEXT} fontFamily="JetBrains Mono, monospace">
                      {frac === 0 ? "0" : formatAxisLabel(maxSeconds * frac)}
                    </text>
                  </g>
                );
              })}

              {days.map((day, i) => {
                const isToday = day.date === todayStr;
                const x = AXIS_W + i * slot + (slot - barW) / 2;
                const totalH = maxSeconds > 0 ? (day.totalSeconds / maxSeconds) * CHART_H : 0;
                const isActive = activeIndex === i;
                const showDayLabel = mode === "week" || isToday || i % 5 === 0;
                const clipId = `bar-clip-${i}`;

                let cumulative = 0;
                const segments = sortForStacking(day.categories)
                  .filter((cat) => cat.seconds > 0)
                  .map((cat) => {
                    const segH = maxSeconds > 0 ? (cat.seconds / maxSeconds) * CHART_H : 0;
                    const y = TOP_PAD + CHART_H - cumulative - segH;
                    cumulative += segH;
                    return { key: categoryKey(cat), color: cat.categoryColor, y, height: segH };
                  });

                return (
                  <g key={day.date} onClick={() => setActiveIndex(isActive ? null : i)} className="cursor-pointer">
                    <rect x={AXIS_W + i * slot} y={TOP_PAD} width={slot} height={CHART_H} fill="transparent" />

                    {isActive && (
                      <rect
                        x={AXIS_W + i * slot + 1}
                        y={TOP_PAD}
                        width={slot - 2}
                        height={CHART_H}
                        fill="rgba(129,140,248,0.06)"
                        rx={6}
                      />
                    )}

                    <clipPath id={clipId}>
                      <rect
                        x={x}
                        y={TOP_PAD + CHART_H - totalH}
                        width={barW}
                        height={Math.max(totalH, day.totalSeconds > 0 ? 2 : 0)}
                        rx={5}
                      />
                    </clipPath>
                    <g clipPath={`url(#${clipId})`}>
                      {segments.map((seg) => (
                        <rect
                          key={seg.key}
                          x={x}
                          y={seg.y}
                          width={barW}
                          height={seg.height}
                          fill={seg.color}
                          opacity={isActive ? 1 : isToday ? 0.95 : 0.8}
                        />
                      ))}
                      {segments.slice(0, -1).map((seg) => (
                        <rect
                          key={`gap-${seg.key}`}
                          x={x}
                          y={seg.y - SEGMENT_GAP / 2}
                          width={barW}
                          height={SEGMENT_GAP}
                          fill={SURFACE}
                        />
                      ))}
                    </g>

                    {isToday && (
                      <circle cx={x + barW / 2} cy={TOP_PAD + CHART_H + 18} r={1.5} fill={TODAY_TEXT} />
                    )}

                    {showDayLabel && (
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

            {showLegend && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-white/[0.04] pb-3 pt-3">
                {legend.map((cat) => (
                  <div key={categoryKey(cat)} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.categoryColor, boxShadow: `0 0 6px ${cat.categoryColor}66` }}
                    />
                    <span className="text-slate-400">{cat.categoryName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {active && (
            <div className="animate-fade surface mt-3 rounded-[1.5rem] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">
                  {new Date(`${active.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="num text-sm font-bold text-indigo-200">{formatDuration(active.totalSeconds)}</p>
              </div>
              {active.categories.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                  {sortForStacking(active.categories)
                    .filter((c) => c.seconds > 0)
                    .map((cat) => (
                      <span key={categoryKey(cat)} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.categoryColor }} />
                        {cat.categoryName}{" "}
                        <span className="num text-slate-500">{formatDuration(cat.seconds)}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {!active && (
            <p className="mt-4 text-center text-xs text-slate-600">Tap a bar for that day&apos;s breakdown. Today is still counting.</p>
          )}
        </>
      )}
    </div>
  );
}

function ChartTooltip({ day, x, viewBoxW }: { day: DayBreakdown; x: number; viewBoxW: number }) {
  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const text = `${dateLabel} · ${formatDuration(day.totalSeconds)}`;
  const boxW = Math.max(78, text.length * 5.8);
  const boxX = Math.min(Math.max(x - boxW / 2, 2), viewBoxW - boxW - 2);

  return (
    <g pointerEvents="none">
      <rect x={boxX} y={2} width={boxW} height={22} rx={7} fill="#12151e" stroke="rgba(129,140,248,0.25)" />
      <text x={boxX + boxW / 2} y={17} textAnchor="middle" fontSize={10} fill="#e0e7ff" fontWeight={600}>
        {text}
      </text>
    </g>
  );
}
