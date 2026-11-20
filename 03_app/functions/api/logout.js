// GET or POST /api/logout: forget the session (and the listener type) and go back to the login page
import { personaCookie } from "../_lib/persona.js";
import { clearSessionCookie } from "../_lib/auth.js";

function logout(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({ Location: "/login?bye=1" });
  headers.append("Set-Cookie", clearSessionCookie(request));
  headers.append("Set-Cookie", `auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`); // the old team-only cookie
  headers.append("Set-Cookie", personaCookie("", request));
  return new Response(null, { status: 302, headers });
}
export const onRequestGet = ({ request }) => logout(request);
export const onRequestPost = ({ request }) => logout(request);
