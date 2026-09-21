import { defineConfig } from "vite";

// Project Pages is served at https://shifat7.github.io/skia/
export default defineConfig({
  base: "/skia/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
