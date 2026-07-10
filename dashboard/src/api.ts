export interface AppSeconds {
  exe: string;
  seconds: number;
}

export interface SummaryResponse {
  from: number;
  to: number;
  totalSeconds: number;
  apps: AppSeconds[];
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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    clearStoredToken();
    throw new ApiError(401, "Invalid or missing dashboard token");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSummary(from: number, to: number): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>(`/api/v1/summary?from=${from}&to=${to}`);
}
