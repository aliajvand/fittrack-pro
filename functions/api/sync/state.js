import { jsonResponse, requireAuth } from "../../../server-lib/http.js";

export async function onRequestGet(context) {
  const user = await requireAuth(context);
  if (!user) return jsonResponse({ ok: false, error: "ورود به حساب لازم است." }, 401);

  const row = await context.env.DB.prepare(
    "SELECT custom_program_json, days_state_json, updated_at FROM user_states WHERE user_id = ?"
  ).bind(user.id).first();

  let customProgram = null;
  let days = {};
  try {
    if (row?.custom_program_json) customProgram = JSON.parse(row.custom_program_json);
    if (row?.days_state_json) days = JSON.parse(row.days_state_json);
  } catch {
    days = {};
  }

  return jsonResponse({
    ok: true,
    customProgram,
    days,
    updatedAt: row?.updated_at || null,
  });
}

export async function onRequestPut(context) {
  const user = await requireAuth(context);
  if (!user) return jsonResponse({ ok: false, error: "ورود به حساب لازم است." }, 401);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: "ساختار JSON نامعتبر است." }, 400);
  }

  const daysJson = JSON.stringify(body.days || {});
  const customProgramJson = body.customProgram ? JSON.stringify(body.customProgram) : null;

  await context.env.DB.prepare(
    `INSERT INTO user_states (user_id, custom_program_json, days_state_json, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       custom_program_json = excluded.custom_program_json,
       days_state_json = excluded.days_state_json,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(user.id, customProgramJson, daysJson).run();

  return jsonResponse({ ok: true, savedAt: new Date().toISOString() });
}
