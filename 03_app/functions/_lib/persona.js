// The listener personality (MUSIC model, Rentfrow et al. 2011): one of five music-taste types the visitor picks.
// It lives in a readable cookie "persona" (not HttpOnly) because Bo's live player also reads it itself,
// e.g. when the phone reads the colours offline. The photo still sets genre and key; the type only shifts
// tempo, chords, drums and sound (Bo/README.md, "Listener personality").

export const PERSONAS = ["mellow", "unpretentious", "sophisticated", "intense", "contemporary"];

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, like the login

// The visitor's type from the cookie, or null (= no type, plain music)
export function personaFrom(request) {
  const cookie = request.headers.get("Cookie") || "";
  const value = cookie.match(/(?:^|;\s*)persona=([a-z]+)/)?.[1];
  return PERSONAS.includes(value) ? value : null;
}

// Set-Cookie header for a type; an unknown or empty type clears the cookie
export function personaCookie(value, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return PERSONAS.includes(value)
    ? `persona=${value}; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`
    : `persona=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

// The scene card field Bo's music reads; only the type, so Bo's defaults for each type apply
export function addListener(card, persona) {
  if (card && persona) card.listener = { type: persona };
  return card;
}
