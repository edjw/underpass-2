import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        processors: "src/processors.ts",
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "processors" ? "processors.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
