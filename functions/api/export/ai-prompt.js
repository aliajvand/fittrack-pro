import { jsonResponse, requireAuth } from "../../../server-lib/http.js";

export async function onRequestGet(context) {
  const user = await requireAuth(context);
  if (!user) return jsonResponse({ ok: false, error: "ورود به حساب لازم است." }, 401);

  const row = await context.env.DB.prepare(
    "SELECT custom_program_json, days_state_json, updated_at FROM user_states WHERE user_id = ?"
  ).bind(user.id).first();

  let days = {};
  let customProgram = null;
  try {
    if (row?.days_state_json) days = JSON.parse(row.days_state_json);
    if (row?.custom_program_json) customProgram = JSON.parse(row.custom_program_json);
  } catch {}

  return jsonResponse({
    ok: true,
    exportedAt: new Date().toISOString(),
    profile: {
      name: user.full_name || "کاربر",
      age: user.age,
      height_cm: user.height_cm,
      start_weight_kg: user.start_weight_kg,
      goal: user.goal,
      target_kcal: user.target_kcal,
      target_protein: user.target_protein,
      template: user.selected_template,
    },
    customProgram,
    days,
  });
}
