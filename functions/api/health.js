import { jsonResponse } from "../../server-lib/http.js";

export async function onRequestGet(context) {
  const { env } = context;
  let dbConnected = false;
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1").first();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
  }
  return jsonResponse({
    ok: true,
    service: "FitTrack Pro Cloudflare Backend",
    dbConnected,
    smsConfigured: Boolean(env.SMSIR_API_KEY),
    templateIdConfigured: Boolean(env.SMSIR_TEMPLATE_ID),
    devMode: String(env.DEV_MODE || "false").toLowerCase() === "true",
    timestamp: new Date().toISOString(),
  });
}
