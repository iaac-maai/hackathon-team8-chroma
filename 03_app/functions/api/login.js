// POST /api/login with the form fields "password" and "persona" (optional): sets the login cookie
// and the listener-type cookie
import { authToken } from "../_middleware.js";
import { personaCookie } from "../_lib/persona.js";

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const password = form.get("password") || "";

  if (!env.APP_PASSWORD || password !== env.APP_PASSWORD) {
    return Response.redirect(new URL("/login?wrong=1", request.url), 302);
  }

  const token = await authToken(env.APP_PASSWORD);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({ Location: "/" });
  // HttpOnly: page scripts can't read it; SameSite=Strict: not sent by other sites; 7 days
  headers.append("Set-Cookie", `auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
  // The listener type from the five cards: readable by Bo's player, no choice = no type
  headers.append("Set-Cookie", personaCookie(form.get("persona") || "", request));
  return new Response(null, { status: 302, headers });
}
