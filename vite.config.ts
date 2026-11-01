/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

// Served from the portfolio at https://www.labrarf.com/twentyq/, so production
// assets need the "/twentyq/" base. Local dev/preview stay at "/".
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/twentyq/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    // A machine-readable manifest at the site root, so a deploy can be verified:
    // fetch /twentyq/version.json and compare .commit to what you shipped.
    mode === "production" && {
      name: "twentyq-version-json",
      closeBundle() {
        const sha = git("rev-parse --short HEAD");
        const dirty = git("status --porcelain").length > 0;
        const info = { commit: sha ? (dirty ? `${sha}-dev` : sha) : "unknown", builtAt: new Date().toISOString() };
        writeFileSync(fileURLToPath(new URL("./dist/version.json", import.meta.url)), JSON.stringify(info) + "\n");
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
  server: { port: Number(process.env.PORT) || 5173 },
}));
