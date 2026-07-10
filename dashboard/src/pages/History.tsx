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

// The chart sits in an opaque card (not the translucent `.surface` treatment the rest of the
// app uses) specifically so this can be an exact, known solid color — it paints the 2px gap
// between stacked segments as a real rect (the gap IS this color, not transparency), which
// only works if the card behind it is a flat, precisely-matched fill, not a glassy overlay.
const CARD_BG = "#0f172a"; // tailwind slate-900
const SURFACE = CARD_BG;
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

/** Fixed stacking order (by category id) rather than the API's seconds-descending order —
 *  a stacked chart needs every day to stack the same category in the same band, so a given
 *  category's trend is trackable across days; sorting by that day's seconds would reshuffle
 *  the bands day to day. */
function sortForStacking(cats: CategorySeconds[]): CategorySeconds[] {
  return [...cats].sort((a, b) => (a.categoryId ?? Infinity) - (b.categoryId ?? Infinity));
}

/** Every category appearing anywhere in the visible range, in stacking order — the legend. */
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
    <div className="min-h-screen px-5 pb-10 pt-8 text-slate-100">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">History</p>
          {!loading && !error && (
            <p className="mt-0.5 text-sm text-slate-400">
              <span className="tabular-nums text-slate-200">{formatDuration(periodTotal)}</span> total ·{" "}
              <span className="tabular-nums">{formatDuration(periodAvg)}</span>/day avg
            </p>
          )}
        </div>
        <div className="flex rounded-full bg-white/5 p-1 text-xs">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1.5 font-medium capitalize transition-colors ${
                mode === m ? "bg-indigo-500 text-white" : "text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="mt-8 flex justify-center">
          <span className="animate-pulse text-sm text-slate-500">Loading…</span>
        </div>
      )}

      {error && !loading && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-red-400">{error}</p>
          <button onClick={() => load(mode)} className="rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-200">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-4 rounded-3xl border border-white/[0.06] p-4 pb-2 shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ backgroundColor: CARD_BG }}>
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
                    {/* hit target bigger than the bar itself, per interaction spec */}
                    <rect x={AXIS_W + i * slot} y={TOP_PAD} width={slot} height={CHART_H} fill="transparent" />

                    {/* clip to a rounded-top pill so only the outer edges of the stack are
                        rounded, not every internal segment */}
                    <clipPath id={clipId}>
                      <rect
                        x={x}
                        y={TOP_PAD + CHART_H - totalH}
                        width={barW}
                        height={Math.max(totalH, day.totalSeconds > 0 ? 2 : 0)}
                        rx={4}
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
                          opacity={isActive ? 1 : 0.85}
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
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pb-3">
                {legend.map((cat) => (
                  <div key={categoryKey(cat)} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.categoryColor }} />
                    <span className="text-slate-400">{cat.categoryName}</span>
                  </div>
                ))}
              </div>
            )}
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
