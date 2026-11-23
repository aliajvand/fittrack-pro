import { jsonResponse, requireAuth } from "../../../server-lib/http.js";

export async function onRequestPatch(context) {
  const user = await requireAuth(context);
  if (!user) return jsonResponse({ ok: false, error: "ورود به حساب لازم است." }, 401);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: "داده نامعتبر است." }, 400);
  }

  const dayNum = Number(body.day);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 30) {
    return jsonResponse({ ok: false, error: "شماره روز باید بین ۱ تا ۳۰ باشد." }, 400);
  }

  const row = await context.env.DB.prepare(
    "SELECT days_state_json FROM user_states WHERE user_id = ?"
  ).bind(user.id).first();

  let days = {};
  try {
    if (row?.days_state_json) days = JSON.parse(row.days_state_json);
  } catch {
    days = {};
  }

  days[String(dayNum)] = body.dayState || {};

  await context.env.DB.prepare(
    `INSERT INTO user_states (user_id, days_state_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       days_state_json = excluded.days_state_json,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(user.id, JSON.stringify(days)).run();

  return jsonResponse({ ok: true, day: dayNum, savedAt: new Date().toISOString() });
}
