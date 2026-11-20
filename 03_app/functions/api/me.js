// GET /api/me: who is logged in, plus the server's clock (the jam uses it to keep phones in time)
import { json, publicUser, isAdmin, where } from "../_lib/auth.js";
import { canSeeDashboard } from "../_lib/admins.js";

// "near": roughly where the request comes from (Cloudflare, city level), so the sky behind the page is the visitor's
// own sky without asking for location. Only sent back to the visitor, never stored.
export async function onRequestGet({ data, request, env }) {
  const w = where(request);
  const near = w.lat != null && w.lon != null ? { lat: w.lat, lon: w.lon, label: w.city || w.country || "near you", timezone: w.timezone } : null;
  return json({ user: { ...publicUser(data.user), admin: isAdmin(data.user), dashboard: await canSeeDashboard(env, data.user) }, now: Date.now(), near });
}
