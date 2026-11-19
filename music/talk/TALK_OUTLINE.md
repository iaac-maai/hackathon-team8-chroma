# Chroma · talk outline (7 minutes)

Friday 20 November, team 8: Akshat · Bo · Bhavini.
The speaker split is a suggestion. Rehearse it once with a timer.

| Time | Part | Who | Show |
|---|---|---|---|
| 0:00–1:00 | 1. The user and the problem | Bo | title slide, one street photo |
| 1:00–2:30 | 2. The model | Akshat | photo → scene card, gradient |
| 2:30–3:30 | 3. Diagrams | Akshat | system diagram, one sequence diagram |
| 3:30–4:30 | 4. Services | Bhavini | Pages + Functions, D1, R2, Render, login |
| 4:30–6:30 | 5. Live demo | Bo (phone) + Bhavini (laptop) | the live app; backup video if it fails |
| 6:30–7:00 | 6. What's next | Bo | three points |

---

## 1. The user and the problem (Bo, 1 min)

- **The user:** someone walking through a city (a visitor, or someone who lives there) who wants to
  *feel* a place, not only see it.
- **The problem:** a photo keeps how a place looks, but not how it feels. Playlists don't know where you are:
  the same song plays in a park and in a club.
- **Our idea:** Chroma turns what your camera sees into music, live. The place picks the genre, the light picks
  the mood, the colours pick the key and melody, and your walking pace sets the tempo.
- One sentence to remember: *"Point your phone at a street and hear it."*

## 2. The model (Akshat, 1.5 min)

- A photo becomes a **scene card**: a small file with the place, the time of day, the season, the colours and
  an 8-colour gradient from shadows to highlights.
- **Our own model:** a convolutional autoencoder trained on 36,500 Places365 photos. It squeezes a photo into a
  short code, and similar places get similar codes, so we find the place type by comparing with a labelled library.
- **Ready-made helpers:** CLIP (time of day, season), SegFormer (paving, trees, people), measured colours (no AI).
- The model is on Hugging Face (`iaac-maai/hackathon-team8-chroma-ae`), 7.6 MB, and runs on Render.
- **Be honest about one result:** we tested 27 real Barcelona photos. The place was right for 9 of 27. The model
  confuses clubs and squares because the library has no photos of them yet. That's the main thing to improve next.

## 3. Diagrams (Akshat, 1 min)

- **System diagram:** phone → Cloudflare page → our server code → Render model → back. Saved data goes to D1, photos to R2.
- **One sequence diagram:** *read a photo* (or *walk*): the order of calls, including what happens while the
  model is waking up.
- One sentence on **Miro vs built:** what we drew on Tuesday and what changed when we built it (the walk mode
  became the main page).

## 4. Services (Bhavini, 1 min)

| Service | What it does | Why |
|---|---|---|
| Cloudflare Pages | serves the page and the music player | free hosting with HTTPS |
| Pages Functions | login, talks to the model, saves readings | the password and the model address stay on the server |
| D1 | readings and walks (one row each) | they are still there after a reload |
| R2 | photos | files are too big for a database row |
| Render | runs the model | Python + ONNX; it sleeps after 15 min, so the page shows a wake-up message |

- **Security:** every `/api/...` route answers 401 without a login. Passwords are stored only as a hash. No secrets in git.

## 5. Live demo (Bo + Bhavini, 2 min)

Follow [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md). Short version:

1. Log in (already done before the talk).
2. **Photo:** take a photo in the room or pick an example. Say the result out loud: *"a square at golden hour,
   so: bossa nova in a major key, 96 bpm"*. Let it play 10 seconds.
3. **Walk mode:** press Walk, walk a few steps across the front. *"Listen, the drums come in when I walk, and the
   tempo follows my steps. When I stop, it falls back to the slow layer."* Point the camera at something
   different (a window, a screen) to show the music changing on the beat.
4. **History:** reload the page. The reading is still there.

If anything fails, don't fix it on stage: *"Here's the same thing recorded this morning"* and play the backup video.

## 6. What's next (Bo, 30 s)

1. **Better place recognition:** add club and square photos to the library, and send whether the photo is indoors.
2. **Location:** use GPS (the neighbourhood, nearby sea or park) as an extra hint next to the camera.
3. **Real instruments:** sampled piano, guitar and drums instead of only synthesisers.

Close: *"Chroma: every street has its own sound. Thank you."*

---

## Facts to have ready for questions

- **How different is the music?** 7 places × 4 sub-genres = 28 styles (house, techno, drum & bass, bossa nova,
  lo-fi, ambient, …). Each piece also picks its own groove, chord progression, melody style and sound. Measured:
  823 different drum grooves and about 100 tempos.
- **When does it go to techno or 180 bpm?** A club or transit view picks techno, house or drum & bass. In walk mode
  drum & bass doubles your pace: 90 steps a minute becomes 180 bpm.
- **Does it work without internet?** The music is made in the browser (Tone.js), so it needs no audio files.
  The place recognition needs the model server.
- **Can I keep the music?** Every photo piece is recorded and can be saved as a WAV file.
