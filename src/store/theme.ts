import { atom } from "nanostores";

type Theme = "light" | "dark";

export const $theme = atom<Theme>(getInitialTheme());

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function toggleTheme() {
  const next = $theme.get() === "light" ? "dark" : "light";
  $theme.set(next);
  applyTheme(next);
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}
