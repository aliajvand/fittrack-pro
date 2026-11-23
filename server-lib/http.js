import { verifyJwt } from "./crypto.js";

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export function buildSessionCookie(token, requestUrl) {
  const isHttps = requestUrl.startsWith("https://");
  const parts = [
    `ft_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(requestUrl) {
  const isHttps = requestUrl.startsWith("https://");
  const parts = [
    "ft_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

export async function requireAuth(context) {
  const { request, env } = context;
  let token = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    token = cookies.ft_session || null;
  }
  if (!token) return null;
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || !payload.sub) return null;

  if (!env.DB) return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(payload.sub)
    .first();
  return user || null;
}
