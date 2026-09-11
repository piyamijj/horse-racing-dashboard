import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0E14",
        surface: "#131722",
        "surface-alt": "#1B2130",
        border: "#232938",
        primary: {
          DEFAULT: "#22D3EE",
          foreground: "#04141A",
        },
        accent: {
          DEFAULT: "#A78BFA",
          foreground: "#120A2E",
        },
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
        muted: "#8B93A7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px rgba(34, 211, 238, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;