// Friends, shared by the friends, chat and jam routes.
import { isAdmin, json } from "./auth.js";

// Friends, chat and jams need a personal account (the shared team login has no friends)
export const needAccount = (user) => (isAdmin(user) ? json({ error: "Log in with your own account to use friends, chat and jams." }, 403) : null);

// The friendship row between two users, either direction, or null
export const friendship = (env, a, b) =>
  env.DB.prepare("SELECT * FROM friendships WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)").bind(a, b).first();

export async function areFriends(env, a, b) {
  const f = await friendship(env, a, b);
  return f?.status === "accepted";
}

// All accepted friends' ids of a user
export async function friendIds(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END AS id FROM friendships WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)",
  ).bind(userId).all();
  return results.map((r) => r.id);
}

export async function body(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  return Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
}
