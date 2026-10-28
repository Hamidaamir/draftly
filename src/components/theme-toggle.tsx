"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const STORAGE_KEY = "draftly-theme";

export function ThemeToggle() {
  useEffect(() => {
    let initialTheme: Theme = "light";
    try {
      initialTheme = window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      console.warn("Draftly couldn't read the saved theme preference.", error);
    }
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch (error) {
      console.warn("Draftly couldn't persist the theme preference.", error);
    }
  }

  return (
    <button
      className="theme-toggle icon-button"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle light and dark themes"
    >
      <Moon className="theme-moon" size={17} />
      <Sun className="theme-sun" size={17} />
    </button>
  );
}
