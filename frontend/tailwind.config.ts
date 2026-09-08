import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: {
          950: "#10100f",
          900: "#181817",
          850: "#20201e",
          800: "#292926"
        },
        signal: {
          cyan: "#38bdf8",
          teal: "#2dd4bf",
          amber: "#f59e0b",
          green: "#22c55e",
          red: "#ef4444"
        }
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Arial", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Consolas", "monospace"]
      },
      boxShadow: {
        workstation: "0 18px 60px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
