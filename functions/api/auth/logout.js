import { clearSessionCookie, jsonResponse } from "../../../server-lib/http.js";

export async function onRequestPost(context) {
  return jsonResponse(
    { ok: true, message: "با موفقیت خارج شدید." },
    200,
    { "Set-Cookie": clearSessionCookie(context.request.url) }
  );
}
