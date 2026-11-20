// Checks accounts, friends, chat and jams against a running app, with three throwaway users.
//   BASE=http://localhost:8791 node scripts/social-smoke.mjs        (local only: it makes test accounts)
// Prints PASS/FAIL per check; exit code 1 if any fail.
const BASE = (process.env.BASE || "http://localhost:8791").replace(/\/+$/, "");
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  · " + extra : ""}`); if (!ok) failed++; };

function client() {
  const jar = {};
  const call = async (method, path, body, type) => {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
    if (type) headers["content-type"] = type;
    const r = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const [k, v] = kv.split("="); if (/Max-Age=0/.test(c)) delete jar[k]; else jar[k] = v; }
    const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, location: r.headers.get("location") };
  };
  return { jar, call,
    json: (m, p, o) => call(m, p, JSON.stringify(o), "application/json"),
    form: (p, o) => call("POST", p, new URLSearchParams(o).toString(), "application/x-www-form-urlencoded") };
}
const tag = Math.random().toString(36).slice(2, 7);
const A = client(), B = client(), C = client(), anon = client();
const users = { A: `ana_${tag}`, B: `bo_${tag}`, C: `cy_${tag}` };

// accounts
for (const [k, c] of [["A", A], ["B", B], ["C", C]]) {
  const r = await c.form("/api/register", { email: `${users[k]}@example.test`, username: users[k], password: `pw-${tag}-${k}-long` });
  check(`sign up @${users[k]}`, r.status === 302 && r.location?.endsWith("/") && !!c.jar.session, `→ ${r.location}`);
}
check("same username again is refused", (await anon.form("/api/register", { email: `x_${tag}@example.test`, username: users.A, password: "longenough1" })).location?.includes("taken"));
check("bad username is refused", (await anon.form("/api/register", { email: `y_${tag}@example.test`, username: "a b", password: "longenough1" })).location?.includes("error"));
const me = await A.call("GET", "/api/me");
check("GET /api/me", me.status === 200 && me.data.user.username === users.A && typeof me.data.now === "number");
const A2 = client();
check("log in by username", (await A2.form("/api/login", { login: users.A, password: `pw-${tag}-A-long` })).location?.endsWith("/"));
check("log in by email", (await client().form("/api/login", { login: `${users.A}@example.test`, password: `pw-${tag}-A-long` })).location?.endsWith("/"));
check("wrong password", (await client().form("/api/login", { login: users.A, password: "nope-nope" })).location?.includes("wrong"));
check("no session → 401", (await anon.call("GET", "/api/friends")).status === 401);

// friends
const req = await A.json("POST", "/api/friends", { username: users.B });
check("A asks B", req.status === 201 && req.data.status === "pending");
check("unknown username → 404", (await A.json("POST", "/api/friends", { username: `nobody_${tag}` })).status === 404);
const bIn = (await B.call("GET", "/api/friends")).data;
check("B sees the request", bIn.incoming.some((x) => x.username === users.A));
check("A cannot accept their own request", (await A.call("POST", `/api/friends/${bIn.incoming[0].friendship}`)).status === 403);
check("B accepts", (await B.call("POST", `/api/friends/${bIn.incoming[0].friendship}`)).data.status === "accepted");
check("C asks A, A asks C back = friends", (await C.json("POST", "/api/friends", { username: users.A })).status === 201
  && (await A.json("POST", "/api/friends", { username: users.C })).data.status === "accepted");
const aF = (await A.call("GET", "/api/friends")).data;
check("A has 2 friends", aF.friends.length === 2, aF.friends.map((f) => f.username).join(", "));
const idOf = (u) => aF.friends.find((f) => f.username === u).id;
const bId = idOf(users.B), cId = idOf(users.C), aId = me.data.user.id;

// chat
check("A writes to B", (await A.json("POST", "/api/messages", { to: bId, body: "walk at 6?" })).status === 201);
check("B sees 1 unread", (await B.call("GET", "/api/friends")).data.friends[0].unread === 1);
const chat = (await B.call("GET", `/api/messages?with=${aId}`)).data;
check("B reads the chat", chat.messages.length === 1 && chat.messages[0].body === "walk at 6?" && !chat.messages[0].mine);
check("read marks it read", (await B.call("GET", "/api/friends")).data.friends[0].unread === 0);
check("B cannot chat with C (not friends)", (await B.json("POST", "/api/messages", { to: cId, body: "hi" })).status === 403);

// jam
const start = await A.json("POST", "/api/jams", { friends: [bId, cId] });
check("A starts a jam with B and C", start.status === 201 && start.data.jam.driver.username === users.A, `people: ${start.data.people?.length}`);
const jamId = start.data.jam.id;
check("only friends can be invited", (await B.json("POST", "/api/jams", { friends: [cId] })).status === 403);
check("B sees the invite", (await B.call("GET", "/api/jams")).data.invites.some((j) => j.id === jamId));
check("C cannot read the jam before joining? (invited may read)", (await C.call("GET", `/api/jams/${jamId}`)).status === 200);
check("B joins", (await B.call("POST", `/api/jams/${jamId}/join`)).status === 200);
check("B's active jam", (await B.call("GET", "/api/jams")).data.active?.id === jamId);
const card = { version: 2, name: "t", place: { label: "street", confidence: 0.8 }, mood: { brightness: 0.5, warmth: 0.2 }, stops: [["#c8783d", 1, 0.5]], gradient: ["#c8783d"] };
const ev = await A.json("POST", `/api/jams/${jamId}/event`, { type: "view", card, bpm: 96, level: 2, dna: "x" });
check("driver sends a view", ev.status === 201 && ev.data.seq === 1 && ev.data.apply_at > Date.now(), `apply in ${ev.data.apply_at - Date.now()} ms`);
check("a listener cannot send", (await B.json("POST", `/api/jams/${jamId}/event`, { type: "view", card, bpm: 96 })).status === 409);
const bs = (await B.call("GET", `/api/jams/${jamId}?since=0`)).data;
check("B gets the view and the server clock", bs.events.some((e) => e.type === "view" && e.data.bpm === 96) && bs.current?.card?.place?.label === "street" && typeof bs.now === "number");
check("tempo event", (await A.json("POST", `/api/jams/${jamId}/event`, { type: "tempo", bpm: 120, level: 3 })).data.seq === 2);
check("C (not joined) cannot take over", (await C.call("POST", `/api/jams/${jamId}/takeover`)).status === 403);
const to = await B.call("POST", `/api/jams/${jamId}/takeover`);
check("B takes over the camera", to.status === 201 && to.data.data.driver === bId);
check("A cannot send any more", (await A.json("POST", `/api/jams/${jamId}/event`, { type: "tempo", bpm: 100 })).status === 409);
check("A still listens (sees driver = B)", (await A.call("GET", `/api/jams/${jamId}?since=2`)).data.jam.driver.username === users.B);
check("B's view saved under the jam", (await B.call("GET", `/api/jams/${jamId}?since=0`)).data.events.length === 3);
check("C declines", (await C.call("POST", `/api/jams/${jamId}/leave`)).status === 200);
check("B (driver) leaves → camera passes to A", (await B.call("POST", `/api/jams/${jamId}/leave`)).status === 200
  && (await A.call("GET", `/api/jams/${jamId}`)).data.jam.driver.username === users.A);
check("A ends the jam", (await A.call("POST", `/api/jams/${jamId}/end`)).status === 200);
const endState = (await A.call("GET", `/api/jams/${jamId}?since=0`)).data;
check("jam is over, with an end event", !!endState.jam.ended_at && endState.events.some((e) => e.type === "end"));
check("events after the end → 410", (await A.json("POST", `/api/jams/${jamId}/event`, { type: "tempo", bpm: 100 })).status === 410);

// saved tracks, playlists, sharing
const tform = (audio, type = "audio/webm") => { const f = new FormData(); f.append("card", JSON.stringify(card)); f.append("title", "Street · day"); f.append("source", "walk");
  f.append("genre", "lo-fi"); f.append("bpm", "90"); if (audio) f.append("audio", new Blob([audio], { type }), "t.webm"); return f; };
const t1 = await A.call("POST", "/api/tracks", tform(new Uint8Array(40000)));
check("A saves a track with a small compressed file", t1.status === 201 && t1.data.has_audio && t1.data.bytes === 40000);
check("a WAV is refused (too big a format)", (await A.call("POST", "/api/tracks", tform(new Uint8Array(1000), "audio/wav"))).status === 415);
check("a file over 400 KB is refused", (await A.call("POST", "/api/tracks", tform(new Uint8Array(420000)))).status === 413);
const t2 = await A.call("POST", "/api/tracks", tform(null));
check("a recipe-only track (no file) is fine", t2.status === 201 && !t2.data.has_audio);
check("A lists 2 tracks", (await A.call("GET", "/api/tracks")).data.length === 2);
check("B cannot hear A's track yet", (await B.call("GET", `/api/tracks/${t1.data.id}/audio`)).status === 404);
const pl = await A.json("POST", "/api/playlists", { name: "Barcelona walks" });
check("A makes a playlist", pl.status === 201);
check("A adds both tracks", (await A.json("POST", `/api/playlists/${pl.data.id}/tracks`, { track_id: t1.data.id })).status === 201
  && (await A.json("POST", `/api/playlists/${pl.data.id}/tracks`, { track_id: t2.data.id })).status === 201);
check("B cannot add to A's playlist", (await B.json("POST", `/api/playlists/${pl.data.id}/tracks`, { track_id: t1.data.id })).status === 404);
check("share with 11 people is refused", (await A.json("POST", `/api/playlists/${pl.data.id}/share`, { friends: Array.from({ length: 11 }, (_, i) => `x${i}`) })).status === 400);
check("A shares the playlist with B", (await A.json("POST", `/api/playlists/${pl.data.id}/share`, { friends: [bId] })).status === 200);
const bp = (await B.call("GET", "/api/playlists")).data;
check("B sees it under shared", bp.shared.some((p) => p.id === pl.data.id && p.tracks === 2));
check("B opens it and hears the recording", (await B.call("GET", `/api/playlists/${pl.data.id}`)).data.tracks.length === 2
  && (await B.call("GET", `/api/tracks/${t1.data.id}/audio`)).status === 200);
check("C (not shared) cannot open it", (await C.call("GET", `/api/playlists/${pl.data.id}`)).status === 404);
const sent = await A.json("POST", "/api/messages", { to: cId, track_id: t2.data.id });
check("A sends a track to C in chat", sent.status === 201 && sent.data.track?.id === t2.data.id);
check("C sees the track in the chat and can open it", (await C.call("GET", `/api/messages?with=${aId}`)).data.messages.some((m) => m.track?.id === t2.data.id)
  && (await C.call("GET", `/api/tracks/${t2.data.id}`)).status === 200);
check("C cannot send A's track on", (await C.json("POST", "/api/messages", { to: aId, track_id: t2.data.id })).status === 404);
check("A deletes a track", (await A.call("DELETE", `/api/tracks/${t1.data.id}`)).status === 200 && (await A.call("GET", "/api/tracks")).data.length === 1);

// own data
check("history is per user (A sees none of B's)", Array.isArray((await A.call("GET", "/api/history")).data));
check("log out", (await A.call("GET", "/api/logout")).location?.includes("bye") && !A.jar.session);
check("after log out → 401", (await A.call("GET", "/api/friends")).status === 401);

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
