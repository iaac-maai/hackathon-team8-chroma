# Chroma: pitch script (film version)

- Film: https://claude.ai/artifact/CWYd7XWkjqGjHmFJs3vqqN (3 min 12 s, 15 scenes, sound on)
- Script page: https://claude.ai/artifact/T6CE9d3Uwa2Vk9m6ZVTeGk
- App: https://chroma-jam.pages.dev (the QR code in the film opens it)
- Length: 3:12 of film + 2–3 min live demo = about 6 minutes (the brief asks for 5 to 8)
- Keys: **space** pause / play, **→** next scene, **M** mute music

**Before you start**
- Wake the Render model about 10 minutes before: open https://team8-chroma-model.onrender.com once.
- Room volume at about half.
- Make two demo accounts that are already friends (Bhavini's and Bo's phones) and run one jam before the talk.
- Log in on both phones at chroma-jam.pages.dev. Never show the team password; the class makes its own accounts.

Who speaks: **Bhavini** opens, closes and leads the jam. **Akshat** covers the images, the model and the system. **Bo** covers the music and walks in the live demo.

| Clock | Scene | Music | Speaker | Line |
|---|---|---|---|---|
| 0:00 | The hook (9 s) | ambient | Bhavini | "What if you could share the tune of your run? Or of your Saturday trip to the market? We are Chroma, and that's what we built." |
| | *record card: Side A · The idea* | | | *(quiet)* |
| 0:09 | Two walks, two tunes (11 s) | rumba catalana | Bhavini | "Your camera sees the place, the light and the colours. A morning run by the sea sounds calm and open. The market sounds warm and busy. Same city, never the same tune." |
| 0:20 | Our data (10 s) | lo-fi hip-hop | Akshat | "We trained on 36,500 Places365 photos, built a labelled library of 731, and found almost 30,000 geotagged Barcelona photos on Wikimedia." |
| 0:30 | Scatter plot (15 s) | lo-fi hip-hop | Akshat | "Here are the 731 photos, placed by the 64 numbers our model gives each one. Coloured by place, they mix: the model never saw a label. Now colour each dot by its own photo, and light sorts itself from dark to bright. The model learned light." |
| | *record card: Side A · The model* | | | *(quiet)* |
| 0:45 | Autoencoder (14 s) | techno | Akshat | "An autoencoder squeezes a photo into 64 numbers and rebuilds it. No labels needed. Similar photos get similar codes, so we search our library by comparing codes. These are real rebuilds from three versions we trained." |
| 0:59 | What we found (12 s) | techno | Akshat | "The nearest five photos share the place 35 percent of the time, 1.6 times chance. A bigger code rebuilds more detail but doesn't search better. So we kept conv-64: small, fast, free to host." |
| | *record card: Side B · Colour* | | | *(quiet)* |
| 1:11 | Photo to gradient map (15 s) | classical | Akshat | "Then colour. We sort every pixel from dark to light, cut them into eight equal groups, and average each group. Eight stops, 24 numbers: the gradient map of that moment." |
| 1:26 | Gradient map to music (15 s) | classical | Bo | "And this is where it becomes music. The place picks the genre, the main colour the key, warm and bright colours a major mode. Dark colours play the bass, light colours the melody." *(Optional: click "Hear this gradient".)* |
| | *record card: Side B · Plaça Reial* | | | *(quiet)* |
| 1:41 | User experience (12 s) | night jazz | Bo | "Sign up and pick how you listen. Press Walk: every few seconds a new view, and your steps set the tempo. Start a jam, and up to six friends hear your walk on the same beat. That's the tune of your run, shared." |
| 1:53 | User flow (11 s) | night jazz | Bhavini | "Open the app, sign up or log in, then a photo, a walk or a jam. If the model is asleep, the page says so and retries. Then the card, the music, and it's saved." |
| 2:04 | System diagram (13 s) | acid techno | Akshat | "The phone talks only to Cloudflare, which checks the login, calls our model on Render and conducts the jams. Results go to a D1 database. The model file lives on Hugging Face." |
| 2:17 | Sequence diagram (13 s) | acid techno | Akshat | "Every 3.5 seconds a frame goes in and a scene card comes back, and we save it. In a jam, the server sends each view 2.5 seconds ahead, so every phone switches together." |
| 2:30 | Services and data (13 s) | lo-fi hip-hop | Bhavini | "What lasts: small photos, every walk view as a card, and accounts with only a hashed password, plus friends, chat and jams. The music is never stored: it's rebuilt each time." |
| | *record card: Side B · Live* | | | *(quiet)* |
| 2:43 | Live demo, QR code (20 s + demo) | rumba catalana | Bhavini | "Now try it yourself. Scan the code, make an account and press Walk. And we'll start a jam right now." |
| 3:03 | Close (9 s) | ambient | Bhavini | "Next: club and square photos in the library, GPS as an extra hint, and saving a jam as a tune you can send. Every street has its own sound. Thank you." |

**Live demo (pause the film at 2:43 for 2–3 minutes)**
1. Bo presses Walk and points her phone at the room or out of the window. Show the scene card and the music changing.
2. Bhavini starts a jam and invites Bo. Both phones play the same music on the same beat.
3. Bhavini takes over the camera: the music on both phones follows her view.
4. Classmates who scanned make an account and press Walk.
5. Press space to finish the film.

**If someone asks**
- *Does it name the place well?* Not yet: 9 of 27 real Barcelona photos got the right place. It is strong on light and colour, which the music uses most.
- *Can I share the tune of my walk?* Yes, live: in a jam, up to six friends hear the same walk at the same moment. Each walk is also saved as a colour strip in My walks.
- *What do you keep about users?* Username, email and a hashed password, never the password itself. Emails are never shown to other users.
- *Is the film's music the real player?* No. The film plays soft versions of Bo's seven genres. The app builds each piece from the scene card.
