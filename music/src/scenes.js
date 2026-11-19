// Chroma scene cards (the hand-made Barcelona examples from chroma/music/examples).
// `mood` and `time_of_day` are the values make_examples.py printed.
// `stops` are the palette colours it built each gradient from:
//   [hex colour, weight (how much of the image), y (0 = top of image, 1 = bottom)]
//
// Scenes with `version: 2` also carry the new labels (indoor, time, season, paving,
// details, gradient, city); the others are version 1 and use the defaults.
//
// Order = a day walking through Barcelona: park → streets → station → market → beach → club → night.

export const scenes = [
  // ---- Imaginary examples: what the image side could send for these photos ----
  {
    // Early morning on Barceloneta beach: pale sky, soft peach sun, calm blue sea, wet sand.
    name: "barceloneta_morning",
    place: { label: "waterfront", confidence: 0.86 },
    time_of_day: "morning",
    mood: { brightness: 0.72, warmth: 0.1, saturation: 0.34, contrast: 0.22, n_colours: 4 },
    stops: [["#cfe3f2", 0.35, 0.1], ["#f4c9a8", 0.12, 0.3], ["#5f9cc4", 0.28, 0.55], ["#e6d6bc", 0.25, 0.88]],
    version: 2,
    indoor: { value: false, confidence: 0.97 }, time: { label: "day", confidence: 0.9 },
    season: { label: "summer", confidence: 0.74 }, paving: { label: "sand", confidence: 0.88 },
    details: { crowd: 0.2, nature: 0.75 },
    gradient: ["#2f5f80", "#4a7fa6", "#5f9cc4", "#8db8d6", "#b9d2e6", "#cfe3f2", "#e6d6bc", "#f4c9a8"],
    city: { noise: 0.3, traffic: 0.2, nightlife: 0.3, trees: 0.1, sea: 1 },
  },
  {
    // Boqueria market mid-afternoon: hot light, red peppers, oranges, green herbs, dark stall roofs.
    name: "boqueria_afternoon",
    place: { label: "market", confidence: 0.79 },
    time_of_day: "afternoon",
    mood: { brightness: 0.63, warmth: 0.44, saturation: 0.74, contrast: 0.52, n_colours: 5 },
    stops: [["#3a2a22", 0.18, 0.08], ["#f2b33d", 0.2, 0.35], ["#d8342a", 0.24, 0.5], ["#5aa036", 0.2, 0.68], ["#f07d2a", 0.18, 0.85]],
    version: 2,
    indoor: { value: true, confidence: 0.7 }, time: { label: "day", confidence: 0.82 },
    season: { label: "autumn", confidence: 0.61 }, paving: { label: "tiles", confidence: 0.77 },
    details: { crowd: 0.85, nature: 0.15 },
    gradient: ["#2a1d17", "#3a2a22", "#7a2a1e", "#d8342a", "#5aa036", "#f07d2a", "#f2b33d", "#f7dc8a"],
    city: { noise: 0.8, traffic: 0.5, nightlife: 0.5, trees: 0.1, sea: 0.3 },
  },
  {
    // Clubbing at night in the Eixample: black room, UV purple, red laser, white strobe flashes.
    name: "eixample_club_night",
    place: { label: "club", confidence: 0.83 },
    time_of_day: "night",
    mood: { brightness: 0.14, warmth: 0.04, saturation: 0.68, contrast: 0.78, n_colours: 4 },
    stops: [["#07050c", 0.45, 0.2], ["#6a1fd0", 0.25, 0.4], ["#e8112d", 0.12, 0.55], ["#f4f1ff", 0.18, 0.7]],
    version: 2,
    indoor: { value: true, confidence: 0.95 }, time: { label: "night", confidence: 0.96 },
    season: { label: "winter", confidence: 0.55 }, paving: { label: "indoor_floor", confidence: 0.8 },
    details: { crowd: 0.9, nature: 0 },
    gradient: ["#030206", "#07050c", "#1c0b38", "#3a1280", "#6a1fd0", "#e8112d", "#c9b8ff", "#f4f1ff"],
    city: { noise: 0.6, traffic: 0.6, nightlife: 0.95, trees: 0.3, sea: 0.2 },
  },
  {
    // Sunday morning in Ciutadella park: fresh green, blue sky, warm gravel paths.
    name: "ciutadella_sunday_morning",
    place: { label: "green", confidence: 0.81 },
    time_of_day: "morning",
    mood: { brightness: 0.66, warmth: 0.08, saturation: 0.52, contrast: 0.3, n_colours: 4 },
    stops: [["#9cc8ec", 0.25, 0.1], ["#5f9e44", 0.4, 0.45], ["#3a6b2c", 0.15, 0.65], ["#d4bf94", 0.2, 0.9]],
    version: 2,
    indoor: { value: false, confidence: 0.98 }, time: { label: "day", confidence: 0.91 },
    season: { label: "spring", confidence: 0.68 }, paving: { label: "gravel", confidence: 0.72 },
    details: { crowd: 0.25, nature: 0.85 },
    gradient: ["#1f3d1a", "#2c5424", "#3a6b2c", "#5f9e44", "#8fbf6a", "#9cc8ec", "#c7e0f4", "#d4bf94"],
    city: { noise: 0.3, traffic: 0.2, nightlife: 0.2, trees: 0.9, sea: 0.5 },
  },
  {
    // Rainy afternoon in a Gràcia street: grey facades, wet asphalt, one yellow shop light.
    name: "gracia_rainy_afternoon",
    place: { label: "street", confidence: 0.69 },
    time_of_day: "afternoon_overcast",
    mood: { brightness: 0.4, warmth: 0.02, saturation: 0.16, contrast: 0.34, n_colours: 4 },
    stops: [["#9aa0a8", 0.35, 0.1], ["#6f6a66", 0.25, 0.4], ["#e3b740", 0.06, 0.55], ["#34363b", 0.34, 0.85]],
    version: 2,
    indoor: { value: false, confidence: 0.93 }, time: { label: "day", confidence: 0.7 },
    season: { label: "autumn", confidence: 0.58 }, paving: { label: "cobblestones", confidence: 0.64 },
    details: { crowd: 0.15, nature: 0.1 },
    gradient: ["#1e1f22", "#2b2c30", "#34363b", "#4f4d4b", "#6f6a66", "#9aa0a8", "#c3c6ca", "#e3b740"],
    city: { noise: 0.5, traffic: 0.4, nightlife: 0.6, trees: 0.4, sea: 0.1 },
  },
  {
    // Late night jazz bar in the Gothic Quarter: candle amber, dark wood, deep red velvet.
    name: "gotic_jazz_night",
    place: { label: "square", confidence: 0.6 },
    time_of_day: "night",
    mood: { brightness: 0.22, warmth: 0.34, saturation: 0.48, contrast: 0.46, n_colours: 4 },
    stops: [["#1b120d", 0.35, 0.15], ["#e0a040", 0.15, 0.4], ["#7a1e22", 0.25, 0.6], ["#4a3022", 0.25, 0.88]],
    version: 2,
    indoor: { value: true, confidence: 0.8 }, time: { label: "night", confidence: 0.93 },
    season: { label: "winter", confidence: 0.52 }, paving: { label: "stone_slabs", confidence: 0.69 },
    details: { crowd: 0.5, nature: 0.05 },
    gradient: ["#0d0806", "#1b120d", "#3a1416", "#7a1e22", "#4a3022", "#a06a34", "#e0a040", "#f6d79a"],
    city: { noise: 0.7, traffic: 0.2, nightlife: 0.9, trees: 0.1, sea: 0.4 },
  },

  // ---- Earlier hand-made examples ----
  {
    name: "ciutadella_midday",
    place: { label: "green", confidence: 0.74 },
    time_of_day: "midday",
    mood: { brightness: 0.5291, warmth: -0.013, saturation: 0.4582, contrast: 0.2786, n_colours: 4 },
    stops: [["#7fb3e6", 0.25, 0.1], ["#4f8a3c", 0.35, 0.45], ["#2f5e2a", 0.2, 0.65], ["#c2a878", 0.2, 0.9]],
  },
  {
    name: "eixample_overcast",
    place: { label: "street", confidence: 0.58 },
    time_of_day: "daytime_overcast",
    mood: { brightness: 0.5708, warmth: 0.0449, saturation: 0.1235, contrast: 0.3971, n_colours: 4 },
    stops: [["#b9bcc2", 0.3, 0.1], ["#c9b79c", 0.3, 0.4], ["#6b6460", 0.15, 0.6], ["#4a4a4e", 0.25, 0.9]],
  },
  {
    name: "sants_station",
    place: { label: "transit", confidence: 0.9 },
    time_of_day: "daytime_overcast",
    mood: { brightness: 0.4734, warmth: 0.008, saturation: 0.1222, contrast: 0.4747, n_colours: 4 },
    stops: [["#d8dde0", 0.2, 0.08], ["#8a9299", 0.3, 0.35], ["#c43b2f", 0.08, 0.55], ["#3b3f44", 0.42, 0.85]],
  },
  {
    name: "boqueria_market",
    place: { label: "market", confidence: 0.47 },
    time_of_day: "golden_hour",
    mood: { brightness: 0.4666, warmth: 0.3773, saturation: 0.5418, contrast: 0.4416, n_colours: 5 },
    stops: [["#e6d2a8", 0.15, 0.1], ["#d83a2a", 0.2, 0.4], ["#f0a020", 0.2, 0.5], ["#4c8a2e", 0.2, 0.65], ["#3a2e28", 0.25, 0.9]],
  },
  {
    name: "barceloneta_golden_hour",
    place: { label: "waterfront", confidence: 0.82 },
    time_of_day: "golden_hour",
    mood: { brightness: 0.62, warmth: 0.2283, saturation: 0.5685, contrast: 0.2906, n_colours: 4 },
    stops: [["#f2a65a", 0.22, 0.08], ["#e07b5f", 0.18, 0.25], ["#3d6e8f", 0.25, 0.5], ["#d9c09a", 0.35, 0.85]],
  },
  {
    // Evening inside a club / late café in El Raval: dark room, magenta and blue neon, amber bar light.
    name: "raval_club_evening",
    place: { label: "club", confidence: 0.71 },
    time_of_day: "evening",
    mood: { brightness: 0.24, warmth: 0.16, saturation: 0.62, contrast: 0.55, n_colours: 5 },
    stops: [["#1a1238", 0.3, 0.1], ["#d02f8a", 0.15, 0.3], ["#2b4fd8", 0.12, 0.45], ["#e89a3c", 0.13, 0.6], ["#0d0b12", 0.3, 0.9]],
    version: 2,
    indoor: { value: true, confidence: 0.9 }, time: { label: "night", confidence: 0.75 },
    season: { label: "summer", confidence: 0.6 }, paving: { label: "wood", confidence: 0.66 },
    details: { crowd: 0.7, nature: 0 },
    gradient: ["#060509", "#0d0b12", "#1a1238", "#2b4fd8", "#7a2a9a", "#d02f8a", "#e89a3c", "#f8d6a0"],
    city: { noise: 0.8, traffic: 0.4, nightlife: 1, trees: 0.1, sea: 0.3 },
  },
  {
    name: "placa_reial_night",
    place: { label: "square", confidence: 0.66 },
    time_of_day: "night",
    mood: { brightness: 0.2031, warmth: 0.0612, saturation: 0.43, contrast: 0.3954, n_colours: 4 },
    stops: [["#0c1030", 0.4, 0.15], ["#e8b04a", 0.12, 0.45], ["#5a3b2a", 0.18, 0.6], ["#2a2622", 0.3, 0.9]],
  },
];
