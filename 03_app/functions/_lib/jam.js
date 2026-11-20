// Jams: up to 6 friends hear the same walk. Chroma's server is the conductor:
// - the jam's start time is the shared beat; every phone sets its clock against the server's (now: Date.now())
// - the driver sends each new view and tempo here; the server numbers it (seq) and stamps apply_at = now + LEAD_MS,
//   so every phone (checking in about once a second) has it in time and switches at the same moment, on the beat
// - anyone in the jam can take over the camera; if the driver stops checking in for a minute, the jam ends
import { json, now, publicUser } from "./auth.js";

export const MAX_PEOPLE = 6;
export const LEAD_MS = 2500;             // how far ahead a change is announced (phones poll about every 1 s)
export const GONE_MS = 60000;            // a driver silent this long ends the jam (unless someone took over)

export async function loadJam(env, id) {
  return env.DB.prepare("SELECT * FROM jams WHERE id = ?").bind(id).first();
}
export async function member(env, jamId, userId) {
  return env.DB.prepare("SELECT * FROM jam_members WHERE jam_id = ? AND user_id = ?").bind(jamId, userId).first();
}
// the next event number, atomically
export async function nextSeq(env, jamId) {
  const r = await env.DB.prepare("UPDATE jams SET seq = seq + 1 WHERE id = ? RETURNING seq").bind(jamId).first();
  return r.seq;
}
export async function addEvent(env, jam, type, userId, data, lead = LEAD_MS) {
  const seq = await nextSeq(env, jam.id), applyAt = Date.now() + lead;
  // the very first beat of the jam: no grid yet, so step 0 starts at the shared moment on every phone
  if (data?.firstBeat) { const { firstBeat, ...rest } = data; data = { ...rest, grid: { step: 0, at: applyAt } }; }
  await env.DB.prepare("INSERT INTO jam_events (jam_id, seq, type, user_id, at, apply_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(jam.id, seq, type, userId, now(), applyAt, JSON.stringify(data)).run();
  return { seq, type, user_id: userId, apply_at: applyAt, data };
}
export async function endJam(env, jam, reason) {
  if (jam.ended_at) return;
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE jams SET ended_at = ?2, end_reason = ?3 WHERE id = ?1 AND ended_at IS NULL").bind(jam.id, t, reason),
    env.DB.prepare("UPDATE jam_members SET status = 'left', left_at = ?2 WHERE jam_id = ?1 AND status = 'joined'").bind(jam.id, t),
  ]);
  await addEvent(env, jam, "end", null, { reason }, 0);
  jam.ended_at = t; jam.end_reason = reason;
}
// everything a phone needs to know about a jam (people, driver, events since a number)
export async function jamState(env, jam, since = 0) {
  const { results: people } = await env.DB.prepare(
    `SELECT m.user_id, m.status, m.joined_at, m.last_seen, u.username, u.name FROM jam_members m JOIN users u ON u.id = m.user_id
      WHERE m.jam_id = ? ORDER BY m.invited_at`,
  ).bind(jam.id).all();
  const { results: events } = await env.DB.prepare(
    "SELECT seq, type, user_id, apply_at, data FROM jam_events WHERE jam_id = ? AND seq > ? ORDER BY seq LIMIT 60",
  ).bind(jam.id, since).all();
  // the newest view and tempo, so a phone that joins late starts from where the music is now
  const lastView = await env.DB.prepare("SELECT seq, apply_at, data FROM jam_events WHERE jam_id = ? AND type = 'view' ORDER BY seq DESC LIMIT 1").bind(jam.id).first();
  // the newest beat position (any event with a grid): a phone joining late lines its beat up with it straight away
  const lastBeat = await env.DB.prepare(
    "SELECT seq, type, apply_at, data FROM jam_events WHERE jam_id = ? AND type IN ('view', 'tempo') AND json_extract(data, '$.grid') IS NOT NULL ORDER BY seq DESC LIMIT 1",
  ).bind(jam.id).first();
  const driver = people.find((p) => p.user_id === jam.driver_id);
  return {
    jam: { id: jam.id, started_at: Date.parse(jam.started_at), ended_at: jam.ended_at, end_reason: jam.end_reason, seq: jam.seq,
      created_by: jam.created_by, driver: driver ? publicUser({ id: driver.user_id, username: driver.username, name: driver.name }) : null },
    people: people.map((p) => ({ ...publicUser({ id: p.user_id, username: p.username, name: p.name }), status: p.status, here: !!p.last_seen && Date.now() - Date.parse(p.last_seen) < 15000 })),
    events: events.map((e) => ({ ...e, data: JSON.parse(e.data) })),
    current: lastView ? { seq: lastView.seq, apply_at: lastView.apply_at, ...JSON.parse(lastView.data) } : null,
    beat: lastBeat ? { seq: lastBeat.seq, type: lastBeat.type, apply_at: lastBeat.apply_at, grid: JSON.parse(lastBeat.data).grid, bpm: JSON.parse(lastBeat.data).bpm } : null,
    now: Date.now(),
  };
}
export const notInJam = () => json({ error: "You are not in this jam." }, 403);
export const jamOver = () => json({ error: "This jam has ended." }, 410);
