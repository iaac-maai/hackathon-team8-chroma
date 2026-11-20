// POST /api/register (form): email, username, password (8+), optional name and persona.
// Makes the account and logs in straight away. If INVITE_CODE is set (a secret), sign-up needs that code.
import { makeSession, sessionCookie, hashPassword, same, USERNAME, cleanUsername, now, where } from "../_lib/auth.js";
import { personaCookie } from "../_lib/persona.js";

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 120);
  const username = cleanUsername(form.get("username"));
  const name = String(form.get("name") || "").trim().slice(0, 60) || null;
  const password = String(form.get("password") || "");
  const back = (error) => Response.redirect(new URL(`/register?error=${encodeURIComponent(error)}&u=${encodeURIComponent(username)}&e=${encodeURIComponent(email)}`, request.url), 302);

  if (env.INVITE_CODE && !same(String(form.get("invite") || ""), env.INVITE_CODE)) return back("That invite code is not right.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return back("That email address does not look right.");
  if (!USERNAME.test(username)) return back("Usernames are 3 to 20 letters, numbers, _ or dots.");
  if (username === "team") return back("That username is taken.");
  if (password.length < 8) return back("Use a password of at least 8 characters.");
  const taken = await env.DB.prepare("SELECT username, email FROM users WHERE username = ? OR email = ?").bind(username, email).first();
  if (taken) return back(taken.username === username ? "That username is taken." : "There is already an account with that email. Log in instead.");

  const id = crypto.randomUUID(), t = now();
  const { hash, salt } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, username, email, name, pass_hash, pass_salt, created_at, last_seen, login_count, country, timezone, area_lat, area_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(id, username, email, name, hash, salt, t, t, where(request).country, where(request).timezone, where(request).areaLat, where(request).areaLon),
    env.DB.prepare("INSERT INTO logins (id, user_id, identifier, ok, at, country) VALUES (?, ?, ?, 1, ?, ?)").bind(crypto.randomUUID(), id, username, t, where(request).country),
  ]);
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", sessionCookie(await makeSession(env, id), request));
  headers.append("Set-Cookie", personaCookie(form.get("persona") || "", request));
  return new Response(null, { status: 302, headers });
}
