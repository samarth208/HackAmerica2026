import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:              "#030712",
        surface:         "#0d1117",
        "surface-2":     "#161b27",
        border:          "#1e293b",
        "text-primary":  "#f1f5f9",
        "text-muted":    "#64748b",
        "text-data":     "#e2e8f0",
        "threat-green":  "#22c55e",
        "threat-amber":  "#f59e0b",
        "threat-orange": "#f97316",
        "threat-red":    "#ef4444",
        "threat-purple": "#a855f7",
        accent:          "#06b6d4",
      },
      fontFamily: {
        ui:    ["Inter", "sans-serif"],
        data:  ["JetBrains Mono", "monospace"],
        brand: ["Raleway", "sans-serif"],
        label: ["Inter", "sans-serif"],
        panel: ["Inter", "sans-serif"],
        body:  ["Inter", "sans-serif"],
      },
      height: {
        topbar: "48px",
      },
      width: {
        "right-panel": "280px",
      },
      animation: {
        "spin": "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
