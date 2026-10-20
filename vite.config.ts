import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Every experiment is its own page. `base: "./"` keeps asset paths relative,
// so the build works on GitHub Pages, in a sub-folder of a website, or opened from disk via `vite preview`.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900, // Three.js on its own is ~700 kB minified
    rollupOptions: {
      input: {
        lab: page("./index.html"),
        arcade: page("./arcade/index.html")
      }
    }
  }
});
