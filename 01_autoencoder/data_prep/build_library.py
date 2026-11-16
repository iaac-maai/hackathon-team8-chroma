"""Build a local photo library to look at the data and fix labels.

Input:  ../data/labels_auto.csv (from label_time_season.py)
Output: ../data/library.html     open it in a browser (it reads the photos next to it)

In the library you can filter by place, time of day and season, see how sure the
model was, and click a photo to correct its labels. Corrections are kept in your
browser; "Export CSV" downloads labels_reviewed.csv. Save that file into data/.

The library stays on your machine (data/ is not committed): Places365 photos
belong to their owners and must not be republished.

Run from the 01_autoencoder/ folder:
    python data_prep/build_library.py
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

TIMES = ["day", "golden hour", "night"]
SEASONS = ["spring", "summer", "autumn", "winter", "unknown"]
PLACES = ["market", "street", "beach", "mountains", "metro", "airport", "unsorted"]

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chroma Photo Library</title>
<style>
:root {
  --bg: #f6f5f2; --panel: #ffffff; --ink: #1d1d1b; --muted: #6b6a66; --line: #e3e1dc;
  --accent: #3a5ccc; --warn: #c2410c; --ok: #15803d; --chip: #efede8;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #141413; --panel: #1f1f1d; --ink: #f1efe9; --muted: #9c9a94; --line: #34332f;
          --accent: #8aa4ff; --warn: #fb923c; --ok: #4ade80; --chip: #2a2a27; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
       font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { position: sticky; top: 0; z-index: 5; background: var(--bg);
         border-bottom: 1px solid var(--line); padding: 14px 20px; }
h1 { margin: 0 0 2px; font-size: 20px; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 13px; }
.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
select, button, label.tog { font: inherit; color: var(--ink); background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
button { cursor: pointer; } button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
label.tog { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; padding: 16px 20px 0; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.card h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.row { display: grid; grid-template-columns: 96px 1fr 34px; gap: 8px; align-items: center; font-size: 13px; margin: 3px 0; }
.track { height: 8px; background: var(--chip); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.num { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
main { padding: 16px 20px 40px; }
.count { color: var(--muted); margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
        cursor: pointer; transition: transform .08s; }
.tile:hover { transform: translateY(-2px); }
.tile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.meta { padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 4px; }
.chip { background: var(--chip); border-radius: 999px; padding: 1px 8px; font-size: 12px; white-space: nowrap; }
.chip.place { font-weight: 600; }
.chip.low { color: var(--warn); outline: 1px dashed var(--warn); }
.swatch { display: flex; height: 14px; }
.swatch span { display: block; height: 100%; }
.music { font-size: 11px; color: var(--muted); padding: 0 10px 8px; }
.chip.edited { color: var(--ok); outline: 1px solid var(--ok); }
dialog { border: none; border-radius: 14px; padding: 0; background: var(--panel); color: var(--ink);
         width: min(760px, 94vw); }
dialog::backdrop { background: rgb(0 0 0 / .55); }
.dlg { display: grid; grid-template-columns: 1fr 1fr; }
.dlg img { width: 100%; height: 100%; object-fit: cover; display: block; }
.form { padding: 18px; }
.form h2 { margin: 0 0 4px; font-size: 16px; }
.group { margin: 14px 0; }
.group b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 6px; }
.opts { display: flex; flex-wrap: wrap; gap: 6px; }
.opt { border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; background: var(--bg); }
.opt.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.opt small { opacity: .75; margin-left: 4px; }
.nav { display: flex; gap: 8px; justify-content: space-between; margin-top: 18px; }
.hint { color: var(--muted); font-size: 12px; margin-top: 10px; }
@media (max-width: 600px) { .dlg { grid-template-columns: 1fr; } .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<header>
  <h1>Chroma photo library</h1>
  <div class="sub">Places365 and our own Barcelona photos · time of day and season guessed by CLIP · our photos also carry the true labels from their date. Click a photo to correct it.</div>
  <div class="bar">
    <select id="fKeep"><option value="1">Scenes kept</option><option value="0">Removed (close-ups)</option><option value="">Kept and removed</option></select>
    <select id="fSource"><option value="">All sources</option><option value="places365">Places365</option><option value="own">Our photos</option></select>
    <select id="fPlace"><option value="">All places</option></select>
    <select id="fTime"><option value="">Any time</option></select>
    <select id="fSeason"><option value="">Any season</option></select>
    <label class="tog"><input type="checkbox" id="fLow"> Only uncertain (&lt; 60 %)</label>
    <label class="tog"><input type="checkbox" id="fEdited"> Only corrected</label>
    <span style="flex:1"></span>
    <button id="reset">Clear corrections</button>
    <button class="primary" id="export">Export CSV</button>
  </div>
</header>
<section class="stats" id="stats"></section>
<main>
  <div class="count" id="count"></div>
  <div class="grid" id="grid"></div>
</main>
<dialog id="dlg">
  <div class="dlg">
    <img id="dImg" alt="">
    <div class="form">
      <h2 id="dTitle"></h2>
      <div class="sub" id="dSub"></div>
      <div class="group"><b>Use this photo?</b><div class="opts" id="dKeep"></div></div>
      <div class="group"><b>Place</b><div class="opts" id="dPlace"></div></div>
      <div class="group"><b>Time of day</b><div class="opts" id="dTime"></div></div>
      <div class="group"><b>Season</b><div class="opts" id="dSeason"></div></div>
      <div class="nav">
        <button id="prev">← Previous</button>
        <button id="close">Close</button>
        <button id="next">Next →</button>
      </div>
      <div class="hint">Keys: X keep/remove · 1–3 time · Q W E R T season · ← → move · Esc close. Percentages are the model's confidence.</div>
    </div>
  </div>
</dialog>
<script>
const DATA = __DATA__;
const TIMES = __TIMES__, SEASONS = __SEASONS__, PLACES = __PLACES__;
const KEY = "chroma-library-edits-v1";
let edits = {};
try { edits = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { edits = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch (e) {} };

const final = r => ({ keep: edits[r.file]?.keep ?? String(r.keep), place: edits[r.file]?.place ?? r.place, time: edits[r.file]?.time ?? r.time, season: edits[r.file]?.season ?? r.season });
const isEdited = r => !!edits[r.file];
const pct = x => Math.round(x * 100) + "%";
const $ = id => document.getElementById(id);

for (const [id, list] of [["fPlace", PLACES], ["fTime", TIMES], ["fSeason", SEASONS]])
  for (const v of list) $(id).insertAdjacentHTML("beforeend", `<option>${v}</option>`);

let view = [], cur = -1;

function filtered() {
  const kp = $("fKeep").value, src = $("fSource").value, p = $("fPlace").value, t = $("fTime").value, s = $("fSeason").value;
  return DATA.filter(r => {
    const f = final(r);
    if (kp && f.keep !== kp) return false;
    if (src && r.source !== src) return false;
    if (p && f.place !== p) return false;
    if (t && f.time !== t) return false;
    if (s && f.season !== s) return false;
    if ($("fLow").checked && !(r.time_conf < .6 || (r.season !== "unknown" && r.season_conf < .6))) return false;
    if ($("fEdited").checked && !isEdited(r)) return false;
    return true;
  });
}

function bars(title, keys, counter) {
  const counts = keys.map(k => [k, counter(k)]);
  const max = Math.max(1, ...counts.map(c => c[1]));
  return `<div class="card"><h3>${title}</h3>${counts.map(([k, n]) =>
    `<div class="row"><span>${k}</span><div class="track"><div class="fill" style="width:${n / max * 100}%"></div></div><span class="num">${n}</span></div>`
  ).join("")}</div>`;
}

function render() {
  view = filtered();
  const rows = view;
  $("stats").innerHTML =
    bars("Place", PLACES, k => rows.filter(r => final(r).place === k).length) +
    bars("Time of day", TIMES, k => rows.filter(r => final(r).time === k).length) +
    bars("Season", SEASONS, k => rows.filter(r => final(r).season === k).length);
  const nEdit = DATA.filter(isEdited).length;
  $("count").textContent = `${view.length} of ${DATA.length} photos shown · ${nEdit} corrected`;
  $("grid").innerHTML = view.map((r, i) => {
    const f = final(r), ed = isEdited(r);
    const lowT = !ed && r.time_conf < .6, lowS = !ed && r.season !== "unknown" && r.season_conf < .6;
    return `<div class="tile" data-i="${i}">
      <img loading="lazy" src="${r.file}" alt="${r.place}">
      ${swatch(r)}
      <div class="meta">
        <span class="chip place">${f.place}</span>${r.source === "own" ? '<span class="chip">ours</span>' : ""}${f.keep === "0" ? `<span class="chip low">removed: ${r.subject}</span>` : ""}
        <span class="chip ${ed ? "edited" : lowT ? "low" : ""}">${f.time}${ed ? "" : " " + pct(r.time_conf)}</span>
        <span class="chip ${ed ? "edited" : lowS ? "low" : ""}">${f.season}${ed || f.season === "unknown" ? "" : " " + pct(r.season_conf)}</span>
        ${r.time_true ? `<span class="chip" title="true labels from the photo date">true: ${r.time_true}, ${r.season_true}</span>` : ""}
      </div>${r.scale ? `<div class="music">${r.scale} · ${r.n_colours} colours · warmth ${r.warmth.toFixed(2)}${r.melody ? " · melody" : ""}</div>` : ""}</div>`;
  }).join("");
}
function swatch(r) {
  if (!r.palette) return "";
  const p = JSON.parse(r.palette).sort((a, b) => a.height - b.height);
  return `<div class="swatch">${p.map(c => `<span title="${c.hex} · ${Math.round(c.weight * 100)}%" style="width:${c.weight * 100}%;background:${c.hex}"></span>`).join("")}</div>`;
}

function opts(el, keys, chosen, probs, field) {
  el.innerHTML = keys.map((k, i) => {
    const p = probs[k];
    return `<span class="opt ${k === chosen ? "on" : ""}" data-k="${k}">${k}${p != null ? `<small>${pct(p)}</small>` : ""}</span>`;
  }).join("");
  el.querySelectorAll(".opt").forEach(o => o.onclick = () => setLabel(field, o.dataset.k));
}

function open(i) {
  if (i < 0 || i >= view.length) return;
  cur = i;
  const r = view[i], f = final(r);
  $("dImg").src = r.file;
  $("dTitle").textContent = f.place + (isEdited(r) ? " · corrected" : "");
  $("dImg").title = "";
  const musicLine = r.scale ? ` · ${r.scale}, ${r.n_colours} colours, brightness ${r.brightness}, saturation ${r.saturation}, contrast ${r.contrast}, warmth ${r.warmth}` : "";
  $("dSub").textContent = (r.source === "own"
    ? `our photo · taken ${r.taken_at || "date unknown"}` + (r.time_true ? ` · true: ${r.time_true}, ${r.season_true}` : "")
    : `${r.places365_category} · ${r.file.split("/").pop()}`) + musicLine;
  opts($("dPlace"), PLACES, f.place, {}, "place");
  const kl = { "1": "keep (scene)", "0": "remove (close-up)" };
  $("dKeep").innerHTML = ["1", "0"].map(k => `<span class="opt ${k === f.keep ? "on" : ""}" data-k="${k}">${kl[k]}${k === "0" ? `<small>${r.subject}${r.subject_conf != null ? " " + pct(r.subject_conf) : ""}</small>` : ""}</span>`).join("");
  $("dKeep").querySelectorAll(".opt").forEach(o => o.onclick = () => setLabel("keep", o.dataset.k));
  const pt = Object.fromEntries(TIMES.map(k => [k, r["p_time_" + k.replace(" ", "_")]]));
  const ps = Object.fromEntries(SEASONS.map(k => [k, r["p_season_" + k]]));
  opts($("dTime"), TIMES, f.time, pt, "time");
  opts($("dSeason"), SEASONS, f.season, ps, "season");
  if (!$("dlg").open) $("dlg").showModal();
}

function setLabel(field, value) {
  const r = view[cur];
  const e = { ...(edits[r.file] || {}), [field]: value };
  const n = { keep: e.keep ?? String(r.keep), place: e.place ?? r.place, time: e.time ?? r.time, season: e.season ?? r.season };
  if (n.keep === String(r.keep) && n.place === r.place && n.time === r.time && n.season === r.season) delete edits[r.file];
  else edits[r.file] = n;
  save(); open(cur); renderKeep();
}
function renderKeep() { const keep = cur; render(); cur = Math.min(keep, view.length - 1); }

$("grid").onclick = e => { const t = e.target.closest(".tile"); if (t) open(+t.dataset.i); };
$("prev").onclick = () => open(cur - 1);
$("next").onclick = () => open(cur + 1);
$("close").onclick = () => $("dlg").close();
document.addEventListener("keydown", e => {
  if (!$("dlg").open) return;
  if (e.key === "ArrowLeft") open(cur - 1);
  else if (e.key === "ArrowRight") open(cur + 1);
  else if ("123".includes(e.key) && e.key) setLabel("time", TIMES[+e.key - 1]);
  else if (e.key.toLowerCase() === "x") setLabel("keep", final(view[cur]).keep === "1" ? "0" : "1");
  else { const j = "qwert".indexOf(e.key.toLowerCase()); if (j >= 0 && e.key.length === 1) setLabel("season", SEASONS[j]); }
});
["fKeep", "fSource", "fPlace", "fTime", "fSeason", "fLow", "fEdited"].forEach(id => $(id).onchange = render);
$("reset").onclick = () => { if (confirm("Remove all your corrections?")) { edits = {}; save(); render(); } };
$("export").onclick = () => {
  const cols = ["file", "source", "keep", "subject", "place", "places365_category", "indoor", "time", "season", "time_auto", "time_conf", "season_auto", "season_conf", "time_true", "season_true", "taken_at", "reviewed"];
  const lines = [cols.join(",")].concat(DATA.map(r => {
    const f = final(r);
    return [r.file, r.source, f.keep, r.subject, f.place, r.places365_category, r.indoor, f.time, f.season, r.time, r.time_conf, r.season, r.season_conf, r.time_true ?? "", r.season_true ?? "", r.taken_at ?? "", isEdited(r) ? 1 : 0]
      .map(v => /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",");
  }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = "labels_reviewed.csv"; a.click();
};
render();
</script>
</body>
</html>
"""


def main():
    df = pd.read_csv(DATA / "labels_auto.csv")
    if "source" not in df:
        df["source"] = "places365"
    # Colour parameters and music labels (extract_palette.py).
    pal = DATA / "palette.csv"
    if pal.exists():
        df = df.merge(pd.read_csv(pal), on="file", how="left")
    # The detector's close-up check (filter_closeups.py) replaces CLIP's subject guess.
    closeups = DATA / "closeups.csv"
    if closeups.exists():
        c = pd.read_csv(closeups, keep_default_na=False)[["file", "keep", "reason"]]
        df = df.drop(columns=["keep"], errors="ignore").merge(c, on="file", how="left")
        df["keep"] = df["keep"].fillna(1).astype(int)
        df["subject"] = df["reason"].fillna("")
        df["subject_conf"] = None
    records = json.loads(df.to_json(orient="records"))
    html = (TEMPLATE
            .replace("__DATA__", json.dumps(records))
            .replace("__TIMES__", json.dumps(TIMES))
            .replace("__SEASONS__", json.dumps(SEASONS))
            .replace("__PLACES__", json.dumps(PLACES)))
    out = DATA / "library.html"
    out.write_text(html, encoding="utf-8")
    print(f"Wrote {out} ({len(records)} photos). Open it in a browser.")


if __name__ == "__main__":
    main()
