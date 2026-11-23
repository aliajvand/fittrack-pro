// SMS.ir v1 Verify OTP Service (https://api.sms.ir/v1/send/verify)

export async function sendSmsIrOtp({ mobile, code, env }) {
  const apiKey = env.SMSIR_API_KEY;
  const templateId = Number(env.SMSIR_TEMPLATE_ID || 100000);
  const paramName = env.SMSIR_PARAM_NAME || "CODE";
  const isDevMode = String(env.DEV_MODE || "false").toLowerCase() === "true";

  // If API key is not configured yet and DEV_MODE is true, return mock success
  if (!apiKey) {
    if (isDevMode) {
      return { ok: true, devMode: true, devCode: code, message: "DEV_MODE: OTP generated locally" };
    }
    return {
      ok: false,
      error: "کلید SMSIR_API_KEY در تنظیمات Cloudflare Pages تعریف نشده است.",
    };
  }

  try {
    const resp = await fetch("https://api.sms.ir/v1/send/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/plain",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        mobile,
        templateId,
        parameters: [{ name: paramName, value: String(code) }],
      }),
    });

    const rawText = await resp.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText };
    }

    if (!resp.ok || (parsed && parsed.status !== 1)) {
      return {
        ok: false,
        error: parsed?.message || `خطای سرویس پیامک (کد ${resp.status})`,
        details: parsed,
      };
    }

    return {
      ok: true,
      devMode: isDevMode,
      devCode: isDevMode ? code : undefined,
      messageId: parsed?.data?.messageId || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: "عدم دسترسی به سرور api.sms.ir. لطفاً دقایقی دیگر تلاش کنید.",
      details: String(err),
    };
  }
}
