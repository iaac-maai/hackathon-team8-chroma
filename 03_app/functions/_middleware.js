// Runs before EVERY request: the login gate.
// A visitor without a valid session only gets the login and sign-up pages and their APIs.
// The logged-in user goes on as context.data.user: {id, username, name} or the team admin.
import { readSession, TEAM, json, now, where } from "./_lib/auth.js";
import { canSeeDashboard } from "./_lib/admins.js";

// Pages serves login.html at /login (it drops the .html)
const PUBLIC_PATHS = ["/login", "/login.html", "/register", "/register.html", "/api/login", "/api/register", "/api/logout", "/style.css", "/chroma-gradient.js"];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  if (PUBLIC_PATHS.includes(url.pathname)) return next();

  const id = await readSession(env, request);
  let user = null;
  if (id === "team") user = TEAM;
  else if (id) {
    // the account must still exist; note when we last saw it and from which country / time zone (at most once a minute)
    user = await env.DB.prepare("SELECT id, username, name FROM users WHERE id = ?").bind(id).first();
    if (user) {
      const w = where(request);
      await env.DB.prepare("UPDATE users SET last_seen = ?2, country = COALESCE(?4, country), timezone = COALESCE(?5, timezone), area_lat = COALESCE(?6, area_lat), area_lon = COALESCE(?7, area_lon) WHERE id = ?1 AND (last_seen IS NULL OR last_seen < ?3)")
        .bind(user.id, now(), new Date(Date.now() - 60000).toISOString(), w.country, w.timezone, w.areaLat, w.areaLon).run();
    }
  }
  if (user) {
    data.user = user;
    // the team dashboard page is only for the three admins (ADMINS); everyone else goes home
    if (/^\/admin(\.html)?\/?$/i.test(url.pathname) && !(await canSeeDashboard(env, user))) return Response.redirect(new URL("/", url), 302);
    return next();
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/gradio_api/")) return json({ error: "Not logged in" }, 401);
  return Response.redirect(new URL("/login", url), 302);
}
