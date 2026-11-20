// GET /api/users/search?q=<text> -> find people to add as friends (up to 10).
//   username: matches the start of a username ("bo" finds @bo_demo); an "@" in front is fine
//   email:    only an exact, full address matches, so nobody can browse other people's emails
// Each result says how you are connected: friend | requested (you asked) | asked_you | none.
// Emails are never sent back.
import { json } from "../../_lib/auth.js";
import { needAccount } from "../../_lib/social.js";

export async function onRequestGet({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().toLowerCase().replace(/^@/, "").slice(0, 120);
  if (q.length < 2) return json({ results: [] });
  const isEmail = q.includes("@");
  const prefix = q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";   // escape LIKE wildcards
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.name, f.status, f.requester_id
       FROM users u
       LEFT JOIN friendships f ON (f.requester_id = ?1 AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = ?1)
      WHERE u.id <> ?1 AND ${isEmail ? "u.email = ?2" : "u.username LIKE ?3 ESCAPE '\\'"}
      ORDER BY (u.username = ?2) DESC, u.username LIMIT 10`,
  ).bind(...(isEmail ? [me, q] : [me, q, prefix])).all();
  return json({
    results: results.map((r) => ({
      id: r.id, username: r.username, name: r.name || r.username,
      relation: r.status === "accepted" ? "friend" : r.status === "pending" ? (r.requester_id === me ? "requested" : "asked_you") : "none",
    })),
  });
}
