# Chroma · demo checklist

Live app: https://chroma-app-26c.pages.dev. Talk outline: [TALK_OUTLINE.md](TALK_OUTLINE.md).

## Thursday night: record the backup video

Record it **on the iPhone**: iPhone screen recording also records the app's sound, and that's the real use (walking with the phone).

1. **Silent switch off** (orange not showing) and volume about 70%. The ring/silent switch mutes web audio on iPhone.
2. Control Centre → **Screen Recording** (add it in Settings → Control Centre if it's missing).
3. Record the happy path below, about 90 seconds:
   - log in → take or pick a photo → the result appears and plays 10 s;
   - walk mode: walk ~15 seconds outside or along a corridor, turn a corner, stop for 5 seconds;
   - reload → the reading is in the history.
4. Stop the recording. Check the sound plays. Save it as `chroma_demo_backup.mov` on the laptop **and** on the phone
   (and in the team drive), so whoever presents has it offline.
5. Don't put the video in git (it's too big). Put a link in `04_final/README.md` if the team wants one.

## Friday 08:00

- [ ] **Wake the model:** open the app once (or Akshat opens the Render URL). It takes about a minute after sleeping.
      Open it again at 09:40 so it's awake for the talk.
- [ ] Phone charged; laptop charged and on the room's Wi-Fi; phone on a hotspot as backup.
- [ ] Logged in on the demo phone and the laptop (**before** the talk, not on stage).
- [ ] Camera and motion allowed for the site (iPhone: "Allow" when walk mode asks; the motion prompt
      only appears after a tap).
- [ ] Sound: phone silent switch off, volume up. Test with the room speaker or hold the phone to the mic.
- [ ] Backup video open on the laptop, paused at the start.
- [ ] Tabs ready on the laptop: the app, Hugging Face model page, the diagrams (`04_final/README.md`), Miro.

## On stage: the happy path

| Step | Do | Say |
|---|---|---|
| 1 | Show the app, already logged in | "This is Chroma on my phone." |
| 2 | Take a photo of the room (or the window) | "The model reads the place, the light and the colours." |
| 3 | Result appears, music plays | Read the result out loud: place, time, genre, key, bpm |
| 4 | Press Walk, walk across the front | "The drums come in when I walk. The tempo follows my steps." |
| 5 | Point the camera at something different | "New view: the music changes on the next beat." |
| 6 | Stand still | "When I stop, it falls back to the calm layer." |
| 7 | Stop, reload, open history | "The reading is saved: it's still here after a reload." |

## If something goes wrong

| Problem | Do |
|---|---|
| "Model is waking up" | Say "the free server is waking up, about a minute" and carry on talking. Still stuck after 90 s → backup video. |
| Wrong place recognised | Say it plainly: "it thinks this is a park; that's the recognition limit we mentioned." Keep going. |
| No sound | Silent switch, volume, tap the screen once (browsers only start sound after a tap). Then backup video. |
| Walk mode doesn't follow steps | Sensors weren't allowed: carry on with the photo demo. |
| No internet / login fails | Backup video straight away. Don't debug on stage. |

## Friday 09:00: rehearsal

- [ ] One full run with a timer (target 7:00, max 8:00).
- [ ] Every speaker knows their handover sentence.
- [ ] Practise switching to the backup video once.
