import { generateOtp6, normalizeIranMobile, sha256Hex } from "../../../server-lib/crypto.js";
import { jsonResponse } from "../../../server-lib/http.js";
import { sendSmsIrOtp } from "../../../server-lib/smsir.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse({ ok: false, error: "دیتابیس D1 متصل نیست. ابتدا Binding به نام DB را تنظیم کنید." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "بدنه درخواست نامعتبر است." }, 400);
  }

  const mobile = normalizeIranMobile(body?.mobile);
  if (!mobile) {
    return jsonResponse({ ok: false, error: "شماره موبایل معتبر نیست (فرمت صحیح: 09123456789)." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  // Rate limit: 60 seconds cooldown per mobile
  const recent = await env.DB.prepare(
    "SELECT created_at FROM otp_codes WHERE mobile = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(mobile).first();

  if (recent && now - recent.created_at < 60) {
    const waitSec = 60 - (now - recent.created_at);
    return jsonResponse(
      { ok: false, error: `لطفاً ${waitSec} ثانیه صبر کنید و دوباره درخواست کد بدهید.`, waitSec },
      429
    );
  }

  // Max 8 OTP requests per hour per mobile
  const hourlyCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM otp_codes WHERE mobile = ? AND created_at > ?"
  ).bind(mobile, now - 3600).first();

  if (hourlyCount && hourlyCount.cnt >= 8) {
    return jsonResponse(
      { ok: false, error: "تعداد درخواست‌های کد تأیید بیش از حد مجاز است. یک ساعت بعد تلاش کنید." },
      429
    );
  }

  const code = generateOtp6();
  const codeHash = await sha256Hex(`${mobile}:${code}:${env.JWT_SECRET || "salt"}`);
  const expiresAt = now + 300; // 5 minutes

  // Send SMS via SMS.ir
  const smsRes = await sendSmsIrOtp({ mobile, code, env });
  if (!smsRes.ok) {
    return jsonResponse({ ok: false, error: smsRes.error }, 502);
  }

  // Save hashed OTP in D1
  await env.DB.prepare(
    "INSERT INTO otp_codes (mobile, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(mobile, codeHash, expiresAt, now).run();

  return jsonResponse({
    ok: true,
    mobile,
    expiresIn: 300,
    cooldown: 60,
    devCode: smsRes.devCode,
    message: "کد تأیید ۶ رقمی به شماره موبایل شما ارسال شد.",
  });
}
