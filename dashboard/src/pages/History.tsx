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

const CARD_BG = "#0a1220";
const SURFACE = CARD_BG;
const GRID_COLOR = "rgba(125,211,252,0.08)";
const MUTED_TEXT = "#6b7280";
const TODAY_TEXT = "#7dd3fc";

const CHART_H = 168;
const CHART_H_DESKTOP = 240;
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

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
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
  const isDesktop = useIsDesktop();

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
  const chartH = isDesktop ? CHART_H_DESKTOP : CHART_H;
  const slot = PLOT_UNITS / barCount;
  const barW = slot * BAR_FRACTION;
  const viewBoxW = PLOT_UNITS + AXIS_W;
  const active = activeIndex !== null ? days[activeIndex] : undefined;
  const legend = collectLegend(days);
  const showLegend = legend.length > 1;
  const periodTotal = days.reduce((sum, d) => sum + d.totalSeconds, 0);
  const periodAvg = days.length > 0 ? periodTotal / days.length : 0;
  const peakDay = days.reduce<DayBreakdown | null>((best, d) => {
    if (!best || d.totalSeconds > best.totalSeconds) return d;
    return best;
  }, null);

  return (
    <div className="page text-slate-100">
      <header className="animate-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">History</p>
          {!loading && !error && (
            <p className="mt-1.5 text-sm text-slate-400 lg:hidden">
              <span className="num font-semibold text-slate-100">{formatDuration(periodTotal)}</span>
              <span className="text-slate-600"> total · </span>
              <span className="num text-slate-300">{formatDuration(periodAvg)}</span>
              <span className="text-slate-600">/day</span>
            </p>
          )}
          {!loading && !error && (
            <p className="mt-1.5 hidden text-base text-slate-400 lg:block">
              Your active time over the last {mode === "week" ? "7 days" : "30 days"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-all active:scale-95 lg:min-h-10 lg:px-5 lg:text-sm ${
                mode === m
                  ? "bg-gradient-to-b from-sky-400 to-sky-600 text-slate-950 shadow-[0_4px_18px_-4px_rgba(14,165,233,0.85)]"
                  : "text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {!loading && !error && (
        <div className="history-stats animate-rise-delay-1">
          <StatCard label="Period total" value={formatDuration(periodTotal)} />
          <StatCard label="Daily average" value={formatDuration(periodAvg)} />
          <StatCard
            label="Peak day"
            value={peakDay ? formatDuration(peakDay.totalSeconds) : "—"}
            sub={
              peakDay
                ? new Date(`${peakDay.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : undefined
            }
          />
        </div>
      )}

      {loading && (
        <div className="mt-16 flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
          <span className="animate-pulse-soft text-sm text-slate-500">Loading chart…</span>
        </div>
      )}

      {error && !loading && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <div className="surface w-full max-w-md rounded-[1.75rem] px-8 py-8">
            <p className="text-red-400">{error}</p>
            <button type="button" onClick={() => load(mode)} className="btn-primary mt-4 w-full rounded-full px-5">
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="history-desktop-panel">
          <div
            className="history-chart-card animate-rise-delay-1 mt-5 overflow-hidden rounded-[1.75rem] border border-white/[0.06] p-4 pb-2 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.65)] lg:mt-0 lg:p-5"
            style={{ backgroundColor: CARD_BG }}
          >
            <svg
              viewBox={`0 0 ${viewBoxW} ${TOP_PAD + chartH + 24}`}
              width="100%"
              height={TOP_PAD + chartH + 24}
              role="img"
              aria-label={`Screen time, ${mode === "week" ? "last 7 days" : "last 30 days"}`}
              className="touch-manipulation select-none"
            >
              {GRID_FRACTIONS.map((frac) => {
                const y = TOP_PAD + chartH - chartH * frac;
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
                    <text
                      x={AXIS_W - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={9}
                      fill={MUTED_TEXT}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {frac === 0 ? "0" : formatAxisLabel(maxSeconds * frac)}
                    </text>
                  </g>
                );
              })}

              {days.map((day, i) => {
                const isToday = day.date === todayStr;
                const x = AXIS_W + i * slot + (slot - barW) / 2;
                const totalH = maxSeconds > 0 ? (day.totalSeconds / maxSeconds) * chartH : 0;
                const isActive = activeIndex === i;
                const showDayLabel = mode === "week" || isToday || i % 5 === 0;
                const clipId = `bar-clip-${i}`;

                let cumulative = 0;
                const segments = sortForStacking(day.categories)
                  .filter((cat) => cat.seconds > 0)
                  .map((cat) => {
                    const segH = maxSeconds > 0 ? (cat.seconds / maxSeconds) * chartH : 0;
                    const y = TOP_PAD + chartH - cumulative - segH;
                    cumulative += segH;
                    return { key: categoryKey(cat), color: cat.categoryColor, y, height: segH };
                  });

                return (
                  <g
                    key={day.date}
                    onClick={() => setActiveIndex(isActive ? null : i)}
                    className="cursor-pointer"
                  >
                    <rect x={AXIS_W + i * slot} y={TOP_PAD} width={slot} height={chartH} fill="transparent" />

                    {isActive && (
                      <rect
                        x={AXIS_W + i * slot + 1}
                        y={TOP_PAD}
                        width={slot - 2}
                        height={chartH}
                        fill="rgba(56,189,248,0.06)"
                        rx={6}
                      />
                    )}

                    <clipPath id={clipId}>
                      <rect
                        x={x}
                        y={TOP_PAD + chartH - totalH}
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
                      <circle cx={x + barW / 2} cy={TOP_PAD + chartH + 18} r={1.5} fill={TODAY_TEXT} />
                    )}

                    {showDayLabel && (
                      <text
                        x={x + barW / 2}
                        y={TOP_PAD + chartH + 14}
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
                <ChartTooltip
                  day={active}
                  x={AXIS_W + (activeIndex ?? 0) * slot + slot / 2}
                  viewBoxW={viewBoxW}
                />
              )}
            </svg>

            {showLegend && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-white/[0.04] pb-3 pt-3 lg:justify-start">
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

          {/* Desktop side detail */}
          <div className="history-desktop-side surface animate-rise-delay-2 rounded-[1.75rem] p-5">
            <p className="eyebrow">Day detail</p>
            {active ? (
              <DayDetail day={active} />
            ) : (
              <div className="mt-6 text-center">
                <p className="text-sm font-medium text-slate-400">Select a day</p>
                <p className="mt-1 text-xs text-slate-600">Click a bar to see category breakdown.</p>
                <p className="mt-6 text-xs text-slate-600">Today is still counting.</p>
              </div>
            )}
          </div>

          {/* Mobile detail under chart */}
          {active && (
            <div className="history-mobile-detail animate-fade surface mt-3 rounded-[1.5rem] px-4 py-3.5">
              <DayDetail day={active} compact />
            </div>
          )}

          {!active && (
            <p className="history-mobile-detail mt-4 text-center text-xs text-slate-600">
              Tap a bar for that day&apos;s breakdown. Today is still counting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-2xl px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="display-num mt-1.5 text-2xl font-bold leading-none">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function DayDetail({ day, compact }: { day: DayBreakdown; compact?: boolean }) {
  return (
    <div className={compact ? "" : "mt-4"}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`font-semibold text-slate-100 ${compact ? "text-sm" : "text-base"}`}>
          {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
            weekday: compact ? "long" : "long",
            month: "short",
            day: "numeric",
          })}
        </p>
        <p className={`num font-bold text-sky-200 ${compact ? "text-sm" : "text-lg"}`}>
          {formatDuration(day.totalSeconds)}
        </p>
      </div>
      {day.categories.length > 0 && (
        <div className={`space-y-2 ${compact ? "mt-2.5" : "mt-5"}`}>
          {sortForStacking(day.categories)
            .filter((c) => c.seconds > 0)
            .map((cat) => {
              const pct = day.totalSeconds > 0 ? Math.round((cat.seconds / day.totalSeconds) * 100) : 0;
              return (
                <div key={categoryKey(cat)}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.categoryColor }} />
                      {cat.categoryName}
                    </span>
                    <span className="num text-slate-500">
                      {formatDuration(cat.seconds)}
                      {!compact && ` · ${pct}%`}
                    </span>
                  </div>
                  {!compact && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(3, pct)}%`, backgroundColor: cat.categoryColor }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
      {!compact && day.apps.length > 0 && (
        <div className="mt-6 border-t border-white/[0.05] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Top apps</p>
          <div className="mt-3 space-y-2">
            {day.apps.slice(0, 5).map((app, i) => (
              <div key={app.exe} className="flex items-center gap-2 text-sm">
                <span className="rank flex h-6 w-6 items-center justify-center rounded-md text-[10px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-200">{app.displayName}</span>
                <span className="num text-slate-400">{formatDuration(app.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ day, x, viewBoxW }: { day: DayBreakdown; x: number; viewBoxW: number }) {
  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const text = `${dateLabel} · ${formatDuration(day.totalSeconds)}`;
  const boxW = Math.max(78, text.length * 5.8);
  const boxX = Math.min(Math.max(x - boxW / 2, 2), viewBoxW - boxW - 2);

  return (
    <g pointerEvents="none">
      <rect x={boxX} y={2} width={boxW} height={22} rx={7} fill="#0a1220" stroke="rgba(56,189,248,0.35)" />
      <text x={boxX + boxW / 2} y={17} textAnchor="middle" fontSize={10} fill="#e0f2fe" fontWeight={600}>
        {text}
      </text>
    </g>
  );
}
