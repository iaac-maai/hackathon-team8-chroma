// POST /api/login (form): "login" = username or email, "password", optional "persona".
// Leave "login" empty and use the team password to log in as the team (admin).
// Every attempt is written to the logins table (who came in, when; wrong passwords too).
import { makeSession, sessionCookie, hashPassword, same, TEAM, now, where } from "../_lib/auth.js";
import { personaCookie } from "../_lib/persona.js";

const slow = () => new Promise((r) => setTimeout(r, 400)); // slows down password guessing a little

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const login = String(form.get("login") || "").trim().replace(/^@/, "").toLowerCase();
  const password = String(form.get("password") || "");
  const back = (q) => Response.redirect(new URL(`/login?${q}`, request.url), 302);

  let user = null;
  if (!login) {
    if (env.APP_PASSWORD && same(password, env.APP_PASSWORD)) user = TEAM;
  } else {
    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?1 OR email = ?1").bind(login).first();
    if (row && same((await hashPassword(password, row.pass_salt)).hash, row.pass_hash)) user = row;
    const w = where(request);
    await env.DB.prepare("INSERT INTO logins (id, user_id, identifier, ok, at, country) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), row?.id ?? null, login.slice(0, 120), user ? 1 : 0, now(), w.country).run();
    if (user) await env.DB.prepare("UPDATE users SET login_count = login_count + 1, last_seen = ?2, country = COALESCE(?3, country), timezone = COALESCE(?4, timezone), area_lat = COALESCE(?5, area_lat), area_lon = COALESCE(?6, area_lon) WHERE id = ?1")
      .bind(user.id, now(), w.country, w.timezone, w.areaLat, w.areaLon).run();
  }
  if (!user) { await slow(); return back("wrong=1"); }

  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", sessionCookie(await makeSession(env, user.id), request));
  headers.append("Set-Cookie", personaCookie(form.get("persona") || "", request));
  return new Response(null, { status: 302, headers });
}
