# Live app test at phone size (E4) · Thu 19 Nov

Tested on https://chroma-app-26c.pages.dev at 375 × 812 (iPhone size), logged in as Team.
The test browser has **no camera, motion sensor or GPS**, so walking on a real phone still has to be tested by hand (see the end).

## What works ✅

- Login → main page (Chroma Live) fits the phone screen.
- **Start without a camera** → demo mode with the Barcelona example scenes. Music plays (lo-fi hip-hop, 85 bpm).
- **Picking a place by hand** (club) → the music switches to acid techno at 136 bpm.
- **Stop** → the music stops and the walk is saved ("walk saved: 11 views · street → club"); `GET /api/walks` lists it.
- **Photo upload** (How it works page) → `/api/read` answers, result: waterfront · day · **downtempo · C# lydian · 78 bpm**,
  gradient, CD, sliders and "wrong place?" buttons all show. Screenshot: `screens/ok_result_downtempo.jpg`.
- **Reload** → the reading is still there in the radio ("1 readings · 3 walks").
- Model status shows "MODEL: ONLINE".

## Bugs for Bhavini

| # | Where | What happens | Suggested fix |
|---|---|---|---|
| 1 | `public/index.html`, `demoStream()` → `paint` (line ~576) | **Demo mode never changes place.** It should move to a new scene every 12 s but stays on Eixample. Console: `Cannot read properties of undefined (reading 'place')`. The first animation frame's time can be a little *before* `t0`, so the index becomes −1, it crashes and the animation loop stops. The 2 earlier saved walks are also "street" only. Screenshot `screens/1_demo_stuck_on_eixample.jpg` | `const k = Math.max(0, now - t0) / 12000;` |
| 2 | story page, `<input id="file" capture="environment">` | On a phone, `capture` opens the camera straight away, so you **can't pick a photo from the library** although the button says "TAKE OR UPLOAD". | Remove `capture="environment"` (the phone then offers camera *and* library) |
| 3 | story page, the fixed bottom bar ("Vitamins for your ears" + SOUND on/off) | It has no background, so it **covers content**: the "GROUND" colour row and the ↗ buttons of the scene cards. Screenshots `screens/3_bottom_bar_covers_colours.jpg`, `screens/3_bottom_bar_covers_cards.png` | Give the bar a dark background and add `padding-bottom` to the page (about the bar's height) |
| 4 | `journey.js` line 290 and the radio header | Says **"SAVED: PHOTO + MUSIC IN R2"** and "STORED IN D1 + R2", but R2 is off (`photo_key` is null). Screenshot `screens/4_says_saved_in_r2.jpg` | Show "SAVED IN D1" when `photo_key` is empty, or switch R2 on (C6) |
| 5 | wording | "Move your **cursor** over them" (no cursor on a phone); "1 readings"; "1 views" | "Touch or move over them"; singular when 1 |
| 6 | main page footer | In demo mode it still says a camera view goes to the model server every few seconds | Hide that line in demo mode |

## Bug in my part (fixed in `music/`)

- Console: `The time must be greater than or equal to the last scheduled time` from the music engine. During a genre
  change the snare roll, the crash and the score's own hits could land on the same instant on one drum. Fixed in
  `music/src/chroma.js` (each hit on a drum goes a hair after the previous one).
- **Bhavini:** please rebuild the music once with `npm run build:music` and redeploy, so the app gets the fix.

## Still to test on a real phone (Bo, by hand)

- [ ] iPhone Safari: Start → allow camera, motion and location.
- [ ] Walking: the tempo follows your steps, layers build up, and the music falls back when you stop.
- [ ] A new view (turn a corner, point at something else) changes the music on the beat.
- [ ] Silent switch off: sound plays. Camera photo (not library) gives a result.
- [ ] Unknown: repeated `NotSupportedError` in the console. Probably the test browser blocking the camera; check whether it also shows on the phone.
