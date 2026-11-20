// Who can open the team dashboard (/admin): only the accounts named in ADMINS (chroma-jam usernames or emails,
// comma-separated; set in wrangler.toml and scripts/deploy-chroma-jam.sh: aksster, boderoeck, bhavini).
// The shared team login is NOT one of them.
export async function canSeeDashboard(env, user) {
  const list = String(env.ADMINS || "").toLowerCase().split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
  if (!user || user.id === "team" || !list.length) return false;
  const row = await env.DB.prepare("SELECT username, email FROM users WHERE id = ?").bind(user.id).first();
  return !!row && (list.includes(row.username) || list.includes(String(row.email).toLowerCase()));
}
