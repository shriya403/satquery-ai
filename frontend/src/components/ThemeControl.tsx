"use client";

import { THEMES, useTheme } from "./ThemeProvider";

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className={compact ? "theme-control theme-control-compact" : "theme-control"}>
      <legend className="sr-only">Visual theme</legend>
      {THEMES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="theme-button"
          aria-pressed={theme === item.id}
          onClick={() => setTheme(item.id)}
          title={`${item.label}: ${item.atmosphere}`}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}
