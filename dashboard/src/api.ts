export interface CategorySeconds {
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  seconds: number;
}

export interface AppSeconds {
  exe: string;
  displayName: string;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  seconds: number;
}

export interface SummaryResponse {
  from: number;
  to: number;
  totalSeconds: number;
  apps: AppSeconds[];
  categories: CategorySeconds[];
}

export interface DayBreakdown {
  date: string;
  totalSeconds: number;
  apps: AppSeconds[];
  categories: CategorySeconds[];
}

export interface RangeResponse {
  from: string;
  to: string;
  days: DayBreakdown[];
}

export interface App {
  exe: string;
  displayName: string;
  categoryId: number | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

const TOKEN_KEY = "screentime_dashboard_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Local-midnight-to-now, in unix seconds — computed client-side so "today" matches
 *  the viewer's own timezone regardless of where the server runs. */
export function getTodayRange(): { from: number; to: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return {
    from: Math.floor(start.getTime() / 1000),
    to: Math.floor(now.getTime() / 1000),
  };
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Local calendar date (YYYY-MM-DD) for `when` in the viewer's own timezone. */
export function localDateString(when: Date): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearStoredToken();
    throw new ApiError(401, "Invalid or missing dashboard token");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSummary(from: number, to: number): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>(`/api/v1/summary?from=${from}&to=${to}`);
}

export function fetchRange(from: string, to: string): Promise<RangeResponse> {
  return apiFetch<RangeResponse>(`/api/v1/range?from=${from}&to=${to}`);
}

export function fetchApps(): Promise<{ apps: App[] }> {
  return apiFetch<{ apps: App[] }>("/api/v1/apps");
}

export function patchApp(exe: string, patch: { displayName?: string; categoryId?: number | null }): Promise<App> {
  return apiFetch<App>(`/api/v1/apps/${encodeURIComponent(exe)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function fetchCategories(): Promise<{ categories: Category[] }> {
  return apiFetch<{ categories: Category[] }>("/api/v1/categories");
}

export function createCategory(name: string, color: string): Promise<Category> {
  return apiFetch<Category>("/api/v1/categories", { method: "POST", body: JSON.stringify({ name, color }) });
}

export function patchCategory(id: number, patch: { name?: string; color?: string }): Promise<Category> {
  return apiFetch<Category>(`/api/v1/categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteCategory(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/categories/${id}`, { method: "DELETE" });
}

export function fetchSettings(): Promise<{ dailyLimitMinutes: number | null }> {
  return apiFetch<{ dailyLimitMinutes: number | null }>("/api/v1/settings");
}

export function putSettings(dailyLimitMinutes: number | null): Promise<{ dailyLimitMinutes: number | null }> {
  return apiFetch("/api/v1/settings", { method: "PUT", body: JSON.stringify({ dailyLimitMinutes }) });
}

export function fetchVapidPublicKey(): Promise<{ publicKey: string }> {
  return apiFetch<{ publicKey: string }>("/api/v1/push/vapid-public-key");
}

export function subscribePush(subscription: PushSubscriptionJSON): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/v1/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
}

export function unsubscribePush(endpoint: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/v1/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) });
}
