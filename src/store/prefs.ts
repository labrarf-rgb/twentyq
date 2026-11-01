import { create } from "zustand";
import { isMuted, setMuted } from "@/audio/sfx";
import { readStore, writeStore } from "@/lib/storage";

type Theme = "light" | "dark";
const THEME_KEY = "twentyq.theme";

function initialTheme(): Theme {
  return readStore(THEME_KEY) === "dark" ? "dark" : "light";
}

function applyTheme(t: Theme) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
}

interface PrefsState {
  theme: Theme;
  muted: boolean;
  toggleTheme: () => void;
  toggleMute: () => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  theme: initialTheme(),
  muted: isMuted(),
  toggleTheme: () => {
    const theme = get().theme === "light" ? "dark" : "light";
    writeStore(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleMute: () => {
    const muted = !get().muted;
    setMuted(muted);
    set({ muted });
  },
}));

applyTheme(usePrefs.getState().theme);
