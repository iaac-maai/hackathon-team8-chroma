// LOCAL TESTING ONLY: makes three demo accounts that are already friends, on a local dev server.
//   BASE=http://localhost:8791 node scripts/seed-demo.mjs
// Accounts: @ana_demo, @bo_demo, @cy_demo. The password is SEED_PASSWORD, or a random one printed at the end.
// Never run this against the live app.
const BASE = (process.env.BASE || "http://localhost:8791").replace(/\/+$/, "");
if (!/localhost|127\.0\.0\.1|192\.168\./.test(BASE)) { console.error("Local servers only."); process.exit(2); }
const PASSWORD = process.env.SEED_PASSWORD || `demo-${Math.random().toString(36).slice(2, 12)}`;   // never a fixed password in git
const USERS = [["ana_demo", "Ana"], ["bo_demo", "Bo"], ["cy_demo", "Cy"]];

async function session(username, name) {
  const form = (o) => new URLSearchParams(o).toString();
  const post = (path, body) => fetch(BASE + path, { method: "POST", body: form(body), headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
  let r = await post("/api/register", { username, name, email: `${username}@example.test`, password: PASSWORD });
  if (!r.headers.get("set-cookie")) r = await post("/api/login", { login: username, password: PASSWORD });   // already made
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const jars = {};
for (const [u, n] of USERS) jars[u] = await session(u, n);
const ask = (from, to) => fetch(`${BASE}/api/friends`, { method: "POST", headers: { cookie: jars[from], "content-type": "application/json" }, body: JSON.stringify({ username: to }) });
for (const [a, b] of [["ana_demo", "bo_demo"], ["ana_demo", "cy_demo"], ["bo_demo", "cy_demo"]]) { await ask(a, b); await ask(b, a); }
const f = await (await fetch(`${BASE}/api/friends`, { headers: { cookie: jars.ana_demo } })).json();
console.log(`@ana_demo's friends: ${f.friends.map((x) => "@" + x.username).join(", ")}`);
if (!process.env.SEED_PASSWORD) console.log(`Local demo password (this run only): ${PASSWORD}`);
