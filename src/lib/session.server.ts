import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { createMiddleware } from "@tanstack/react-start";

async function h3() {
  return await import("@tanstack/react-start/server");
}


const COOKIE_NAME = "sar_sid";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 8) return s;
  // Dev fallback; deployments MUST set SESSION_SECRET.
  if (!process.env.SESSION_SECRET) {
    // Warn once
    if (!(globalThis as any).__sar_secret_warned) {
      (globalThis as any).__sar_secret_warned = true;
      console.warn("[session] SESSION_SECRET not set — using ephemeral dev secret");
    }
    let dev = (globalThis as any).__sar_dev_secret as string | undefined;
    if (!dev) {
      dev = randomBytes(32).toString("hex");
      (globalThis as any).__sar_dev_secret = dev;
    }
    return dev;
  }
  return s!;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSessionCookie(user: string) {
  const secret = getSecret();
  const body = JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS });
  const p = b64url(body);
  const s = sign(p, secret);
  const value = `${p}.${s}`;
  setCookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie() {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

export function readSessionCookie(): { user: string } | null {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return null;
  const [p, s] = raw.split(".");
  if (!p || !s) return null;
  const secret = getSecret();
  const expected = sign(p, secret);
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (typeof decoded?.u !== "string") return null;
    if (typeof decoded?.exp !== "number" || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { user: decoded.u };
  } catch {
    return null;
  }
}

export function verifyCredentials(username: string, password: string): boolean {
  const eu = process.env.ADMIN_USERNAME || "admin";
  const ep = process.env.ADMIN_PASSWORD || "admin";
  const u = Buffer.from(username);
  const p = Buffer.from(password);
  const eub = Buffer.from(eu);
  const epb = Buffer.from(ep);
  const okU = u.length === eub.length && timingSafeEqual(u, eub);
  const okP = p.length === epb.length && timingSafeEqual(p, epb);
  return okU && okP;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = readSessionCookie();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return next({ context: { user: session.user } });
});
