/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from the portfolio at https://www.labrarf.com/twentyq/, so production
// assets need the "/twentyq/" base. Local dev/preview stay at "/".
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/twentyq/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { include: ["src/**/*.test.ts"] },
  server: { port: Number(process.env.PORT) || 5173 },
}));
