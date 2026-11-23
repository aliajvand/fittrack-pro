import { jsonResponse, requireAuth } from "../../../server-lib/http.js";

export async function onRequestGet(context) {
  const user = await requireAuth(context);
  if (!user) {
    return jsonResponse({ ok: false, authenticated: false }, 401);
  }
  return jsonResponse({
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      mobile: user.mobile,
      full_name: user.full_name,
      age: user.age,
      height_cm: user.height_cm,
      start_weight_kg: user.start_weight_kg,
      goal: user.goal,
      target_kcal: user.target_kcal,
      target_protein: user.target_protein,
      selected_template: user.selected_template,
    },
  });
}

export async function onRequestPatch(context) {
  const user = await requireAuth(context);
  if (!user) {
    return jsonResponse({ ok: false, error: "احراز هویت لازم است." }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: "داده نامعتبر است." }, 400);
  }

  const fullName = String(body.full_name ?? user.full_name ?? "").slice(0, 80);
  const age = Math.min(90, Math.max(14, Number(body.age ?? user.age ?? 24)));
  const heightCm = Math.min(230, Math.max(120, Number(body.height_cm ?? user.height_cm ?? 180)));
  const startWeight = Math.min(220, Math.max(35, Number(body.start_weight_kg ?? user.start_weight_kg ?? 81.5)));
  const goal = String(body.goal ?? user.goal ?? "recomp").slice(0, 40);
  const targetKcal = Math.min(5000, Math.max(1300, Number(body.target_kcal ?? user.target_kcal ?? 2200)));
  const targetProtein = Math.min(300, Math.max(60, Number(body.target_protein ?? user.target_protein ?? 150)));
  const selectedTemplate = String(body.selected_template ?? user.selected_template ?? "hybrid_calisthenics").slice(0, 50);

  await context.env.DB.prepare(
    `UPDATE users
     SET full_name = ?, age = ?, height_cm = ?, start_weight_kg = ?, goal = ?,
         target_kcal = ?, target_protein = ?, selected_template = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(fullName, age, heightCm, startWeight, goal, targetKcal, targetProtein, selectedTemplate, user.id).run();

  const updated = await context.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  return jsonResponse({ ok: true, user: updated });
}
