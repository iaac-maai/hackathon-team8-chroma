# Data preparation

The data is **not** in this repository. These scripts download and build it in `../data/` (ignored by git).

Run from the `01_autoencoder/` folder, in this order:

| Step | Command | What it does |
|---|---|---|
| 1 | download (see below) | Places365 validation set (525 MB) and file lists (67 MB) into `data/raw/` |
| 2 | `python data_prep/prepare_places365.py` | keeps our six places: 900 photos in `data/places/` |
| 3 | `python data_prep/prepare_own_photos.py` | our own photos from `data/own_raw/<place>/`: 256 px copies without metadata, true time and season from the photo date |
| 4 | `python data_prep/label_time_season.py` | CLIP guesses time of day and season for every photo, with confidence |
| 5 | `python data_prep/build_library.py` | `data/library.html`: browse, filter and correct the labels; export `labels_reviewed.csv` |

Download for step 1:

```bash
curl -L -o data/raw/val_256.tar https://data.csail.mit.edu/places/places365/val_256.tar
curl -L -o data/raw/filelist_places365-standard.tar https://data.csail.mit.edu/places/places365/filelist_places365-standard.tar
```

Open the library through a local server (the browser blocks some features for local files):

```bash
python -m http.server 8765 --directory data
```

then go to http://localhost:8765/library.html.

## Places used

| Our place | Places365 categories | Photos |
|---|---|---|
| market | market/outdoor, market/indoor | 200 |
| street | street | 100 |
| beach | beach | 100 |
| mountains | mountain, mountain_path, mountain_snowy | 300 |
| metro | subway_station/platform | 100 |
| airport | airport_terminal | 100 |

## Licences

- **Places365** (Zhou et al., 2017): free for non-commercial research and teaching; the photos belong to their owners. We do not republish them.
- **Our own photos**: ours. They show people, so they stay local too.
