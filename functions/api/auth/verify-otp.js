import { generateUserId, normalizeIranMobile, sha256Hex, signJwt } from "../../../server-lib/crypto.js";
import { buildSessionCookie, jsonResponse } from "../../../server-lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse({ ok: false, error: "دیتابیس D1 متصل نیست." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "درخواست نامعتبر است." }, 400);
  }

  const mobile = normalizeIranMobile(body?.mobile);
  const rawCode = String(body?.code || "")
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[^0-9]/g, "");

  if (!mobile || rawCode.length !== 6) {
    return jsonResponse({ ok: false, error: "شماره موبایل یا کد ۶ رقمی نامعتبر است." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const otpRow = await env.DB.prepare(
    "SELECT * FROM otp_codes WHERE mobile = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
  ).bind(mobile).first();

  if (!otpRow) {
    return jsonResponse({ ok: false, error: "کد تأیید یافت نشد. دوباره درخواست کد بدهید." }, 400);
  }

  if (otpRow.expires_at < now) {
    return jsonResponse({ ok: false, error: "کد تأیید منقضی شده است. کد جدید دریافت کنید." }, 400);
  }

  if (otpRow.attempts >= 5) {
    return jsonResponse({ ok: false, error: "تعداد تلاش‌های اشتباه زیاد است. کد جدید درخواست کنید." }, 429);
  }

  const expectedHash = await sha256Hex(`${mobile}:${rawCode}:${env.JWT_SECRET || "salt"}`);
  if (expectedHash !== otpRow.code_hash) {
    await env.DB.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(otpRow.id).run();
    return jsonResponse({ ok: false, error: "کد تأیید اشتباه است." }, 401);
  }

  // Mark OTP as used
  await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(otpRow.id).run();

  // Find or create user
  let user = await env.DB.prepare("SELECT * FROM users WHERE mobile = ?").bind(mobile).first();
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const newId = generateUserId();
    await env.DB.prepare(
      "INSERT INTO users (id, mobile) VALUES (?, ?)"
    ).bind(newId, mobile).run();

    await env.DB.prepare(
      "INSERT INTO user_states (user_id, days_state_json) VALUES (?, '{}')"
    ).bind(newId).run();

    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(newId).first();
  }

  const token = await signJwt({ sub: user.id, mobile: user.mobile }, env.JWT_SECRET);
  const cookie = buildSessionCookie(token, request.url);

  return jsonResponse(
    {
      ok: true,
      isNewUser,
      token,
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
    },
    200,
    { "Set-Cookie": cookie }
  );
}
