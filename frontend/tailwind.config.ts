import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "hsl(var(--surface))",
        surfaceAlt: "hsl(var(--surface-alt))",
        outline: "hsl(var(--outline))",
        brand: {
          50: "#eef6ff",
          100: "#dbeaff",
          200: "#b7d5ff",
          300: "#8bb8ff",
          400: "#5a93ff",
          500: "#2d6bff",
          600: "#1f4fd6",
          700: "#1d3ca8",
          800: "#1d3387",
          900: "#1d306e",
        },
      },
      boxShadow: {
        soft: "0 14px 40px -24px rgba(15, 23, 42, 0.45)",
        lift: "0 20px 60px -30px rgba(15, 23, 42, 0.6)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
