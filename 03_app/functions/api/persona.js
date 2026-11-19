// POST /api/persona with a form field "persona": change the listener type without logging in again.
// Behind the login (_middleware.js). Only the cookie changes; an empty value means "no type".
import { personaCookie } from "../_lib/persona.js";

export async function onRequestPost({ request }) {
  const form = await request.formData();
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": personaCookie(form.get("persona") || "", request) },
  });
}
