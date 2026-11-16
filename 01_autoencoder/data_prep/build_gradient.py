"""Turn Barcelona open data into a gradient map: one value from 0 to 1 per axis,
for every 100 m x 100 m cell of the city.

Each axis is a MEASURED quantity, chosen because it changes what a place sounds
like. The music model reads these numbers (see the README for the mapping).

    axis          source (all CC BY 4.0 unless noted)                 raw unit
    ------------  --------------------------------------------------  ------------------
    energy_day    Strategic Noise Map 2017, total noise, day 7-21 h    dB(A)
    energy_eve    same, evening 21-23 h                                dB(A)
    energy_night  same, night 23-7 h                                   dB(A)
    traffic       same, road traffic only, day-evening-night (Lden)    dB(A)
    nightlife     same, leisure noise at night (bars, terraces)        dB(A)
    pedestrians   same, pedestrian-zone noise, day                     dB(A)
    rail          same, railway noise, Lden                            dB(A)
    nature        street + park trees (201k, 2018) and park area       trees per hectare
    sea           OpenStreetMap coastline (ODbL)                       metres to the sea

How a raw number becomes a gradient value, per axis:
  1. average the raw values that fall in each 100 m cell;
  2. smooth with a Gaussian (sigma 150 m), so values flow from cell to cell
     instead of jumping at street edges: that makes it a gradient;
  3. rank the cells: 0 = the quietest / least green cell of the city,
     1 = the loudest / greenest (percentile rank). Ranks, not dB, because
     dB are logarithmic and the bands are coarse (5 dB steps); a rank says
     "how this spot compares to the rest of Barcelona", which is what the
     music needs. "sea" is reversed: 1 = on the shore, 0 = 3 km or more inland.

Output (in ../data/gradient/):
    grid.parquet       one row per cell: x, y, lat, lon, raw values, gradient values
    maps.png           one map per axis
    photos.parquet     the Streetscapes Barcelona photos with the gradient values
                       at their location (if streetscapes_barcelona.parquet exists)

Run from the 01_autoencoder/ folder:
    python data_prep/build_gradient.py
"""

import json
from pathlib import Path

import geopandas as gpd
import matplotlib
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.ndimage import gaussian_filter
from shapely import wkt
from shapely.geometry import LineString

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "gradient"
CELL = 100            # metres
SIGMA = 1.5           # cells, i.e. 150 m
SEA_MAX = 3000        # metres; further inland counts as "no sea"
TO_LATLON = Transformer.from_crs(25831, 4326, always_xy=True)
TO_UTM = Transformer.from_crs(4326, 25831, always_xy=True)

NOISE_AXES = {
    "energy_day": "TOTAL_D",
    "energy_eve": "TOTAL_E",
    "energy_night": "TOTAL_N",
    "traffic": "TRANSIT_DEN",
    "nightlife": "OCI_N",
    "pedestrians": "VIANANTS_D",
    "rail": "FFCC_DEN",
}


def band_to_db(band):
    """'65 - 70 dB(A)' -> 67.5 ; '< 40 dB(A)' -> 37.5"""
    s = str(band).replace("dB(A)", "").strip()
    if s.startswith("<"):
        return float(s[1:]) - 2.5
    if s.startswith(">"):
        return float(s[1:]) + 2.5
    lo, hi = s.split("-")
    return (float(lo) + float(hi)) / 2


def noise_points():
    """Street segments -> points every 25 m, each carrying its segment's dB values."""
    df = pd.read_csv(RAW / "noise" / "2017_tramer_soroll.csv")
    rows = []
    for _, r in df.iterrows():
        geom = wkt.loads(r["GEOM_WKT"])
        lines = getattr(geom, "geoms", [geom])
        vals = {axis: band_to_db(r[col]) for axis, col in NOISE_AXES.items()}
        for line in lines:
            n = max(1, int(line.length // 25))
            for i in range(n + 1):
                p = line.interpolate(i / n, normalized=True)
                rows.append({"x": p.x, "y": p.y, **vals})
    return pd.DataFrame(rows)


def trees():
    frames = []
    for f in ["2018_1T_arbrat_viari.csv", "2018_2T_arbrat_zona.csv"]:
        d = pd.read_csv(RAW / "bcn" / f, usecols=["X_ETRS89", "Y_ETRS89"], encoding="latin-1")
        frames.append(d.rename(columns={"X_ETRS89": "x", "Y_ETRS89": "y"}))
    return pd.concat(frames).dropna()


def coastline():
    data = json.loads((RAW / "bcn" / "coastline.json").read_text(encoding="utf-8"))
    lines = []
    for way in data["elements"]:
        xs, ys = TO_UTM.transform([p["lon"] for p in way["geometry"]],
                                  [p["lat"] for p in way["geometry"]])
        if len(xs) > 1:
            lines.append(LineString(zip(xs, ys)))
    return gpd.GeoSeries(lines, crs=25831).union_all()


def rank01(a, mask):
    """Percentile rank inside the city mask: 0 = lowest cell, 1 = highest."""
    out = np.full(a.shape, np.nan)
    v = a[mask]
    # Many cells share the floor value (e.g. no nightlife noise at all). Those must
    # rank 0, not in the middle, so ties take their LOWEST rank, rescaled to 0..1.
    r = pd.Series(v).round(3).rank(method="min").to_numpy()
    out[mask] = (r - 1) / max(r.max() - 1, 1)
    return out


def smooth_mean(sum_grid, count_grid):
    """Gaussian-smoothed average, ignoring empty cells (normalised convolution)."""
    s = gaussian_filter(sum_grid, SIGMA)
    c = gaussian_filter(count_grid, SIGMA)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(c > 1e-3, s / c, np.nan)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Reading noise map ...")
    noise = noise_points()
    print(f"  {len(noise):,} sample points along streets")
    tree = trees()
    print(f"  {len(tree):,} trees")
    parks = gpd.read_file(RAW / "bcn" / "parcs.gpkg").to_crs(25831)

    x0, y0 = noise["x"].min() - 500, noise["y"].min() - 500
    x1, y1 = noise["x"].max() + 500, noise["y"].max() + 500
    nx, ny = int((x1 - x0) // CELL) + 1, int((y1 - y0) // CELL) + 1
    col = lambda x: ((x - x0) // CELL).astype(int)  # noqa: E731
    row = lambda y: ((y - y0) // CELL).astype(int)  # noqa: E731
    print(f"Grid: {nx} x {ny} cells of {CELL} m")

    # City mask: cells within ~300 m of a mapped street.
    count = np.zeros((ny, nx))
    np.add.at(count, (row(noise["y"]), col(noise["x"])), 1)
    mask = gaussian_filter((count > 0).astype(float), 3) > 0.05

    grid = {}
    raw = {}
    for axis in NOISE_AXES:
        s = np.zeros((ny, nx))
        np.add.at(s, (row(noise["y"]), col(noise["x"])), noise[axis].to_numpy())
        raw[axis] = smooth_mean(s, count)
        grid[axis] = rank01(np.nan_to_num(raw[axis], nan=np.nanmin(raw[axis])), mask)

    # Nature: trees per hectare, plus park area counted as dense canopy.
    t = np.zeros((ny, nx))
    inside = (tree["x"] > x0) & (tree["x"] < x1) & (tree["y"] > y0) & (tree["y"] < y1)
    np.add.at(t, (row(tree.loc[inside, "y"]), col(tree.loc[inside, "x"])), 1)
    cx = x0 + (np.arange(nx) + 0.5) * CELL
    cy = y0 + (np.arange(ny) + 0.5) * CELL
    centres = gpd.GeoSeries(gpd.points_from_xy(*[a.ravel() for a in np.meshgrid(cx, cy)]), crs=25831)
    in_park = centres.within(parks.union_all()).to_numpy().reshape(ny, nx)
    trees_ha = t + in_park * 60          # a park cell counts like 60 trees per hectare
    raw["nature"] = gaussian_filter(trees_ha, SIGMA)
    grid["nature"] = rank01(raw["nature"], mask)

    # Sea: distance to the coastline.
    coast = coastline()
    dist = centres.distance(coast).to_numpy().reshape(ny, nx)
    raw["sea"] = dist
    grid["sea"] = np.where(mask, 1 - np.clip(dist / SEA_MAX, 0, 1), np.nan)

    # Table: one row per cell inside the city.
    X, Y = np.meshgrid(cx, cy)
    lon, lat = TO_LATLON.transform(X[mask], Y[mask])
    table = pd.DataFrame({"x": X[mask], "y": Y[mask], "lat": lat, "lon": lon})
    for axis in grid:
        table[axis] = np.round(grid[axis][mask], 4)
        table[f"raw_{axis}"] = np.round(raw[axis][mask], 2)
    table.to_parquet(OUT / "grid.parquet", index=False)
    print(f"Wrote {len(table):,} cells to {OUT / 'grid.parquet'}")

    # Maps.
    axes = list(grid)
    fig, axs = plt.subplots(3, 3, figsize=(15, 13))
    for ax, axis in zip(axs.flat, axes):
        im = ax.imshow(grid[axis], origin="lower", cmap="magma" if axis != "nature" else "viridis",
                       vmin=0, vmax=1, extent=[x0, x1, y0, y1])
        ax.set_title(axis)
        ax.set_xticks([]), ax.set_yticks([])
    fig.colorbar(im, ax=axs, shrink=0.6, label="gradient value (0 = lowest in Barcelona, 1 = highest)")
    fig.savefig(OUT / "maps.png", dpi=90, bbox_inches="tight")
    print(f"Wrote {OUT / 'maps.png'}")

    # Photos: look up the gradient at each Streetscapes photo.
    photos = RAW / "streetscapes_barcelona.parquet"
    if photos.exists():
        p = pd.read_parquet(photos).dropna(subset=["lat", "lon"])
        px, py = TO_UTM.transform(p["lon"].to_numpy(), p["lat"].to_numpy())
        c, r = col(px), row(py)
        ok = (c >= 0) & (c < nx) & (r >= 0) & (r < ny)
        p = p[ok].copy()
        c, r = c[ok], r[ok]
        p["in_city"] = mask[r, c]
        for axis in grid:
            p[axis] = np.round(grid[axis][r, c], 4)
        p.to_parquet(OUT / "photos.parquet", index=False)
        print(f"Wrote {len(p):,} photos with gradient values ({int(p['in_city'].sum()):,} inside the city grid)")

    print("\nCorrelation between axes (cells):")
    print(table[axes].corr().round(2))


if __name__ == "__main__":
    main()
