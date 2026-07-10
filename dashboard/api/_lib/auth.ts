import type { MiddlewareHandler } from "hono";

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/** Requires a Bearer token matching the given env var (DEVICE_TOKEN or DASHBOARD_TOKEN). */
export function requireToken(envKey: "DEVICE_TOKEN" | "DASHBOARD_TOKEN"): MiddlewareHandler {
  return async (c, next) => {
    const token = bearerToken(c.req.header("Authorization"));
    const expected = process.env[envKey];
    if (!token || !expected || !timingSafeEqual(token, expected)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
