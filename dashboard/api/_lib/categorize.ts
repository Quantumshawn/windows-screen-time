export const UNCATEGORIZED_COLOR = "#64748b"; // tailwind slate-500 — neutral, not a real category slot

export interface AppSecondsWithCategory {
  exe: string;
  displayName: string;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  seconds: number;
}

export interface CategorySeconds {
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  seconds: number;
}

/** Groups per-app seconds into per-category totals, largest first. */
export function summarizeByCategory(apps: AppSecondsWithCategory[]): CategorySeconds[] {
  const byKey = new Map<string, CategorySeconds>();
  for (const app of apps) {
    const key = app.categoryId === null ? "uncategorized" : String(app.categoryId);
    const existing = byKey.get(key);
    if (existing) {
      existing.seconds += app.seconds;
    } else {
      byKey.set(key, {
        categoryId: app.categoryId,
        categoryName: app.categoryName,
        categoryColor: app.categoryColor,
        seconds: app.seconds,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.seconds - a.seconds);
}
