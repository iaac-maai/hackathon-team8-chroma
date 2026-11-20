# User-flow diagram · Chroma

What a user does, step by step, and what they see. Code for each step: see the arrow check in [system.md](system.md) and [../README.md](../README.md).


```mermaid
flowchart TD
  A[Open chroma-jam.pages.dev] --> B{Logged in?}
  B -- no --> C[Login page: username or email + password,<br/>pick one of five listener types or none]
  C --> N{Have an account?}
  N -- no --> R[Sign-up page: username, email, password 8+] --> RE{Username and email free?}
  RE -- no --> R
  RE -- yes --> E
  N -- yes --> D{Password right?}
  D -- no --> C
  D -- yes --> E[Home page<br/>model starts waking up in the background]
  B -- yes --> E
  E --> F[Take or upload a photo of a place]
  F --> G{Model awake?}
  G -- no --> H[“The model is waking up, about one minute”<br/>page tries again every 10 s] --> G
  G -- yes --> I[See gradient map + place, time, season, warmth, brightness]
  I --> J[Hear the music]
  J --> K[Place saved in “My places” (only mine)]
  K --> F
  E --> PZ["Change the listener type (/persona)"] --> E
  E --> W[Start a live walk: camera on]
  W --> X[Every few seconds: model reads the view]
  X --> Y[Music changes: new place = new style,<br/>steps = tempo, walking = more layers]
  Y --> X
  Y --> Z[Stop: the walk is saved in “My walks”]
  E --> FR[Friends: search by username or exact email,<br/>send a request] --> FA{Accepted?}
  FA -- yes --> CH[Chat with a friend]
  FA -- yes --> JS[Start a jam, invite up to 5 friends]
  JS --> JW[My camera drives: every phone in the jam<br/>plays the same music on the same beat]
  JW --> JT[A friend takes over the camera] --> JW
  JW --> JE[End the jam, or the driver leaves]
  E --> JI[Invite from a friend: join the jam] --> JW
```
