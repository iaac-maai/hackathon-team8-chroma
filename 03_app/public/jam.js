// Chroma jam, on the phone. Chroma's server is the conductor; this file keeps one phone in step with it.
//   clock    : the server's time = Date.now() + offset (measured on every check-in, the fastest round trip wins)
//   check-in : about once a second, GET /api/jams/<id>?since=<seq> → new events, people, driver
//   events   : each has apply_at (server ms). Every phone, the driver's too, applies it at that moment:
//              view  → the same scene card, variation seed (dna) and tempo on every phone
//              tempo → the driver's new tempo, walk and layers
//              driver/end → the page changes who drives, or stops
//   beat     : each event carries the driver's beat grid (step n plays at server time t). At the start a phone lines
//              its beat up on a bar line; after that it only corrects gently, never stopping the music: a wrong count
//              jumps to the driver's step, and a beat more than 12 ms early or late plays a hair slower or faster for one bar.
// The music itself is made on each phone by Bo's engine (engine.chromaLive), so nothing is streamed.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class JamClient {
  constructor({ jamId, me, engine, onState, onEvent }) {
    Object.assign(this, { jamId, me, engine, onState, onEvent });
    this.seq = 0; this.offset = 0; this.bestRtt = Infinity; this.running = false; this.timers = new Set();
    this.lastGrid = null; this.started = false; this.applied = 0;
  }
  serverNow() { return Date.now() + this.offset; }
  measure(t0, t1, serverNow) {                       // NTP-style: the fastest round trip gives the best offset
    const rtt = t1 - t0, off = serverNow - (t0 + t1) / 2;
    this.samples = (this.samples || 0) + 1;
    if (this.samples % 30 === 0) this.bestRtt *= 1.3;  // networks change: slowly accept slower answers again
    if (rtt < this.bestRtt) { this.bestRtt = rtt; this.offset = off; }
    else if (rtt < this.bestRtt * 1.3) this.offset = this.offset * 0.8 + off * 0.2;
  }
  async fetchState() {
    const t0 = Date.now();
    const r = await fetch(`/api/jams/${this.jamId}?since=${this.seq}`);
    const t1 = Date.now();
    if (r.status === 401) { location.href = "/login"; return null; }
    if (!r.ok) return null;
    const s = await r.json();
    this.measure(t0, t1, s.now);
    return s;
  }
  // join the music where it is now, then keep checking in
  async start() {
    this.running = true;
    let s = null;
    for (let i = 0; i < 4; i++) { s = await this.fetchState(); if (s) break; await sleep(500); }   // a few samples for the clock
    for (let i = 0; i < 3 && s; i++) { const more = await this.fetchState(); if (more) s = { ...s, now: more.now }; }
    if (!s) throw new Error("could not reach the jam");
    await this.engine.chromaLive.start({ seed: this.jamId, manual: true });
    this.started = true;
    // a phone whose screen went off: its beat stood still; line it up again as soon as it is back
    this.onVisible = () => { if (document.visibilityState === "visible" && this.running) { this.wokeUp = true; this.keepInStep(true); } };
    document.addEventListener("visibilitychange", this.onVisible);
    this.seq = s.jam.seq;
    if (s.current?.card) this.apply({ type: "view", apply_at: s.current.apply_at, data: s.current }, true);   // late join: the music as it is now
    // the view had no beat position (it came while the driver's music was switching): use the newest one there is
    if (!this.lastGrid && s.beat?.grid && s.beat.bpm) {
      this.lastGrid = { ...s.beat.grid, bpm: s.beat.bpm };
      if (s.beat.type === "view") this.apply({ type: "view", apply_at: s.beat.apply_at, data: { grid: s.beat.grid, bpm: s.beat.bpm } }, true);   // no card: only the beat
      else this.keepInStep(true);
    }
    this.onState?.(s);
    this.loop();
  }
  async loop() {
    while (this.running) {
      try {
        const s = await this.fetchState();
        if (s) {
          for (const e of s.events) {
            if (e.seq <= this.seq) continue;
            this.seq = e.seq;
            this.schedule(e);
          }
          this.onState?.(s);
          if (s.jam.ended_at) { this.running = false; break; }
        }
      } catch {}
      await sleep(900);
    }
  }
  schedule(e) {
    const wait = Math.max(0, e.apply_at - this.serverNow());
    const t = setTimeout(() => { this.timers.delete(t); this.apply(e, false); }, wait);
    this.timers.add(t);
  }
  apply(e, late) {
    const L = this.engine.chromaLive, d = e.data || {};
    try {
      if (e.type === "view" && d.card) {
        L.view(d.card, d.walk || null, { dna: d.dna, bpm: d.bpm });
        L.sync({ walk: d.walk, level: d.level });
        this.applied++;
      } else if (e.type === "tempo") {
        L.sync({ walk: d.walk, level: d.level });
      }
      let grid = d.grid;
      // joining late: this view already switched in on the driver's phone, which restarted its count at 0 on the
      // first bar (or half bar) after apply_at; count from there instead of from the older grid
      if (late && e.type === "view" && grid && d.bpm && e.apply_at < this.serverNow() && grid.at <= e.apply_at) {
        const stepMs = 15000 / d.bpm, unit = 240 / d.bpm > 2.5 ? 8 : 16;
        // the engine prepares each step lookAhead seconds early: steps already prepared at apply_at did not switch yet
        const ahead = (L.grid().lookAhead ?? 0.1) * 1000;
        let s = grid.step + Math.ceil((e.apply_at + ahead - grid.at) / stepMs);
        while (s % unit !== 0) s++;
        grid = { step: 0, at: Math.round(grid.at + (s - grid.step) * stepMs) };
      }
      if (grid && d.bpm) { this.lastGrid = { ...grid, bpm: d.bpm }; this.keepInStep(late || this.applied <= 1); }
    } catch (err) { console.warn("jam apply", err); }
    this.onEvent?.(e);
  }
  // where the driver's beat is now: (step, server time) extrapolated from the newest grid
  keepInStep(force) {
    const g = this.lastGrid; if (!g) return;
    const L = this.engine.chromaLive, G = L.grid(), stepMs = 15000 / g.bpm, now = this.serverNow();
    if (!force && G.running && G.at !== null && !this.wokeUp) {
      // playing: correct gently, never stopping the music
      const myAt = (G.wall + (G.at - G.ctx) * 1000) + this.offset;            // when my next step sounds (server time)
      const k = Math.round((myAt - g.at) / stepMs), loop = G.loop || 0;
      const expectStep = loop ? (g.step + k) % loop : g.step + k, expectAt = g.at + k * stepMs;
      if ((loop ? G.step % loop : G.step) !== expectStep) L.setStep(expectStep);   // the count: jump to the driver's step
      const late = myAt - expectAt;                                               // > 0: my beat comes after the driver's
      clearTimeout(this.nudge);
      if (Math.abs(late) > 12) {
        // catch up (or wait) over one bar with a slightly faster (or slower) tempo, then back to the driver's
        const barSteps = 16, nudgedStepMs = Math.max(stepMs * 0.85, Math.min(stepMs * 1.15, stepMs - late / barSteps));
        L.setBpm(15000 / nudgedStepMs);
        this.nudge = setTimeout(() => L.setBpm(g.bpm), barSteps * nudgedStepMs);
      } else if (Math.abs(G.bpm - g.bpm) >= 0.5) L.setBpm(g.bpm);
      return;
    }
    // the start (first beat, joining, or back from a sleeping screen): start the beat on a bar line a little ahead,
    // where the driver's is. This is the only correction that briefly stops the music.
    this.wokeUp = false;
    let k = Math.ceil((now + 300 - g.at) / stepMs);
    while ((g.step + k) % 16 !== 0) k++;
    const atServer = g.at + k * stepMs;
    const ctxAt = G.ctx + ((atServer - this.offset) - G.wall) / 1000;
    const loop = this.engine.chromaLive.grid().loop || 0;   // the piece loops: wrap the step like the driver's phone does
    this.engine.chromaLive.align(loop ? (g.step + k) % loop : g.step + k, ctxAt, g.bpm);
  }
  // the driver: where my beat is, in server time, to send with an event
  myGrid() {
    const G = this.engine.chromaLive.grid();
    // no grid while a switch is waiting: the count is about to restart, so this position would mislead the others
    if (!G.running || G.at === null || G.switching) return null;
    return { step: G.step, at: Math.round(G.wall + (G.at - G.ctx) * 1000 + this.offset) };
  }
  async send(type, payload) {
    const r = await fetch(`/api/jams/${this.jamId}/event`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, ...payload, grid: payload.grid ?? this.myGrid() }) });
    return r.ok ? r.json() : null;
  }
  stop() {
    this.running = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    clearTimeout(this.nudge);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    try { this.engine.chromaLive.stop(); } catch {}
  }
}
