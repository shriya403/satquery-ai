"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeName = "space" | "natural" | "minimal" | "analyst";

export const THEMES: Array<{
  id: ThemeName;
  label: string;
  atmosphere: string;
}> = [
  { id: "space", label: "Space", atmosphere: "Orbital mission control" },
  { id: "natural", label: "Natural", atmosphere: "Earth-observation field station" },
  { id: "minimal", label: "Minimal", atmosphere: "Clear scientific workspace" },
  { id: "analyst", label: "Analyst", atmosphere: "Dense technical workstation" }
];

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "satquery-theme";

function isThemeName(value: string | null): value is ThemeName {
  return value === "space" || value === "natural" || value === "minimal" || value === "analyst";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("space");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeName(stored)) {
      setThemeState(stored);
      document.documentElement.dataset.theme = stored;
    } else {
      document.documentElement.dataset.theme = "space";
    }
    document.documentElement.dataset.themeReady = "true";
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);
        document.documentElement.dataset.theme = nextTheme;
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
