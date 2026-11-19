import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run phone`: serves on your Wi-Fi with https, so a phone can use the camera and
// motion sensors (phones only allow them on https). Open the "Network" address it prints,
// then accept the browser's certificate warning once (it's your own laptop).
export default defineConfig(({ mode }) => ({
  plugins: mode === "phone" ? [basicSsl()] : [],
  server: mode === "phone" ? { host: true } : {},
  build: { rollupOptions: { input: { main: "index.html", chroma: "chroma.html" } } },
}));
