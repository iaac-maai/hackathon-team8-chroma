// GET /api/admin/stats: numbers for the team dashboard (/admin).
// Only the three team accounts named in ADMINS can see it (usernames, comma-separated, set in wrangler.toml and
// scripts/deploy-chroma-jam.sh: aksster, boderoeck, bhavini). Everyone else, the shared team login too, gets 403.
// Never sends password hashes. Emails are masked (a•••@gmail.com) so the dashboard can be shown on a screen.
import { json } from "../../_lib/auth.js";
import { canSeeDashboard } from "../../_lib/admins.js";

const mask = (email) => {
  const [name, domain] = String(email || "").split("@");
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "";
};

export async function onRequestGet({ env, data }) {
  if (!(await canSeeDashboard(env, data.user))) return json({ error: "Team only" }, 403);
  const day = new Date(Date.now() - 864e5).toISOString();
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const hour = new Date(Date.now() - 36e5).toISOString();
  const one = (sql, ...args) => env.DB.prepare(sql).bind(...args);

  const r = await env.DB.batch([
    one("SELECT COUNT(*) AS n FROM users"),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", day),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", week),
    one("SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?", hour),
    one("SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?", day),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(ok), 0) AS ok FROM logins WHERE at >= ?", day),
    one("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted'"),
    one("SELECT COUNT(*) AS n FROM messages"),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(ended_at IS NULL), 0) AS live FROM jams"),
    one("SELECT COUNT(*) AS n FROM scenes"),
    one("SELECT COUNT(*) AS n FROM live_views"),
    // sign-ups per day, last 14 days (UTC)
    one(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM users
          WHERE created_at >= ? GROUP BY day ORDER BY day`, new Date(Date.now() - 14 * 864e5).toISOString()),
    // every user, newest first, with what they did
    one(`SELECT u.username, u.name, u.email, u.country, u.timezone, u.created_at, u.last_seen, u.login_count,
            (SELECT COUNT(*) FROM scenes s WHERE s.user_id = u.id) AS photos,
            (SELECT COUNT(*) FROM live_views v WHERE v.user_id = u.id) AS walk_views,
            (SELECT COUNT(*) FROM jam_members m WHERE m.user_id = u.id AND m.joined_at IS NOT NULL) AS jams,
            (SELECT COUNT(*) FROM friendships f WHERE f.status = 'accepted' AND (f.requester_id = u.id OR f.addressee_id = u.id)) AS friends
          FROM users u ORDER BY u.created_at DESC LIMIT 500`),
    // the last 20 login attempts
    one(`SELECT l.at, l.ok, l.country, u.username FROM logins l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.at DESC LIMIT 20`),
    // where people are: per country, with the time zones seen there
    one(`SELECT COALESCE(country, '??') AS country, COUNT(*) AS users,
            SUM(last_seen >= ?1) AS active_24h, SUM(created_at >= ?2) AS new_7d, GROUP_CONCAT(DISTINCT timezone) AS timezones,
            ROUND(AVG(area_lat), 1) AS lat, ROUND(AVG(area_lon), 1) AS lon
          FROM users GROUP BY COALESCE(country, '??') ORDER BY users DESC, country`, day, week),
  ]);
  const n = (i, k = "n") => r[i].results[0]?.[k] ?? 0;

  return json({
    now: new Date().toISOString(),
    totals: {
      users: n(0), new_24h: n(1), new_7d: n(2), active_1h: n(3), active_24h: n(4),
      logins_24h: n(5), logins_ok_24h: n(5, "ok"), friendships: n(6), messages: n(7),
      jams: n(8), jams_live: n(8, "live"), photos: n(9), walk_views: n(10),
      countries: r[14].results.filter((c) => c.country !== "??").length,
    },
    signups_by_day: r[11].results,
    users: r[12].results.map((u) => ({ ...u, email: mask(u.email) })),
    recent_logins: r[13].results.map((l) => ({ at: l.at, ok: !!l.ok, country: l.country, username: l.username || "(unknown name)" })),
    countries: r[14].results.map((c) => ({ ...c, timezones: c.timezones ? c.timezones.split(",") : [] })),
  }, 200, { "Cache-Control": "no-store" });
}
