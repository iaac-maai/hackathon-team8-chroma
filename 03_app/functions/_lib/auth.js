// Accounts and sessions.
// - Everyone signs up with an email, a username (how friends find each other) and a password.
//   Passwords are kept only as a PBKDF2 hash with a random salt.
// - The session cookie is "<user id>.<expiry>.<signature>"; the signature is an HMAC with SESSION_SECRET
//   (or APP_PASSWORD), so nobody can make a valid cookie without the server's secret. HttpOnly, 7 days.
// - The shared team password still logs in as "team": the admin, who sees everything.
export const COOKIE = "session";
const DAYS = 7;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const secret = (env) => env.SESSION_SECRET || env.APP_PASSWORD;

export const TEAM = { id: "team", username: "team", name: "Team", admin: true };
export const isAdmin = (user) => user?.id === "team";

async function hmac(key, text) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(text)));
}
export async function makeSession(env, userId) {
  const exp = Date.now() + DAYS * 864e5;
  return `${userId}.${exp}.${await hmac(secret(env), `chroma-v3:${userId}.${exp}`)}`;
}
// -> the user id from a valid cookie, or null
export async function readSession(env, request) {
  const raw = readCookie(request, COOKIE);
  if (!raw || !secret(env)) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  return same(sig, await hmac(secret(env), `chroma-v3:${id}.${exp}`)) ? id : null;
}
export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure}`;
}
export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

// PBKDF2-SHA256, 100 000 rounds (the most Cloudflare Workers allow)
export async function hashPassword(password, saltHex = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt: saltHex };
}

export function readCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
// constant-time compare
export function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const USERNAME = /^[a-z0-9_.]{3,20}$/;
export const cleanUsername = (s) => String(s || "").trim().replace(/^@/, "").toLowerCase();
export const now = () => new Date().toISOString();
// Where a request comes from, from Cloudflare (no permission needed). We store only country and time zone.
export const where = (request) => {
  const cf = request.cf || {};
  const country = /^[A-Z]{2}$/.test(cf.country || "") && cf.country !== "XX" && cf.country !== "T1" ? cf.country : null;
  const lat = cf.latitude != null ? Number(cf.latitude) : null, lon = cf.longitude != null ? Number(cf.longitude) : null;
  return { country, timezone: cf.timezone || null, city: cf.city || null, lat, lon,
    // what we store: whole degrees only (~100 km), enough to know if the sun is up there
    areaLat: lat == null ? null : Math.round(lat), areaLon: lon == null ? null : Math.round(lon) };
};
export const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
// a public view of a user (never the email or the hash)
export const publicUser = (u) => (u ? { id: u.id, username: u.username, name: u.name || u.username } : null);
