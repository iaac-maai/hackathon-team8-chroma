# Sequence diagrams · Chroma

Who talks to whom, in order. **S1** is one request: reading one photo. **S2** is one view of the live walk (the main product).

## S1 · Read a photo

```mermaid
sequenceDiagram
  actor U as Visitor
  participant P as Page (index.html)
  participant F as Pages Functions
  participant R as Model server (Render)
  participant D as D1 (scenes)
  P->>F: GET /api/wake (on page load)
  F->>R: GET / (8 s, just to wake it)
  U->>P: chooses a photo
  P->>P: shrink to 512 px JPEG (~50 KB)
  P->>F: POST /api/predict (photo + auth cookie)
  F->>F: _middleware.js: cookie = hash of APP_PASSWORD? else 401
  loop up to 4 tries, about 90 s (_lib/model.js)
    F->>R: POST /gradio_api/call/predict (base64 photo)
    R-->>F: event_id
    F->>R: GET /gradio_api/call/predict/{event_id}
    R-->>F: scene card
  end
  alt still asleep
    F-->>P: 503 waking → page waits 10 s, sends again (max 9)
  else answer
    F->>D: INSERT row (photo BLOB + card)
    F-->>P: {id, created_at, card}
    P->>P: gradient + tags, Tone.js plays 10 s
    P->>F: GET /api/history
    F->>D: SELECT last 30
    F-->>P: list for “My places”
    P->>F: GET /api/images/{id}
    F->>D: SELECT photo
  end
```

## S2 · Live walk, one view

```mermaid
sequenceDiagram
  actor U as Walker (phone)
  participant P as Live player (public/live, Bo's code)
  participant S as Phone sensors (walk.js)
  participant F as Pages Functions
  participant R as Model server (Render)
  participant D as D1 (live_views)
  U->>P: log in, open /live/chroma, tap Walk
  P->>S: ask motion + compass permission, open camera
  P->>P: start the music (Tone.js)
  loop every 3.5 s walking / 10 s standing
    P->>P: camera frame -> 640 px JPEG
    P->>F: POST /gradio_api/call/predict (frame + auth cookie)
    F->>F: _middleware.js: cookie ok? else 401
    F->>R: POST /gradio_api/call/predict (retry while waking, _lib/model.js)
    R-->>F: event_id
    F-->>P: event_id
    P->>F: GET /gradio_api/call/predict/{event_id}
    F->>R: GET result
    R-->>F: scene card
    F->>D: INSERT view (card, no photo)
    F-->>P: scene card
    P->>P: same place -> keep style; new place (sure or seen twice) -> new sub-genre
  end
  S-->>P: steps per minute, GPS speed (every 1 s)
  P->>P: every 2 s: tempo follows the pace, layers build up (1-4) or drop when still
  S-->>P: turn > 60 degrees (onTurn) -> capture a new view now
  U->>P: tap Stop
  U->>F: back on the home page: GET /api/live -> "My walks" colour strip
```
