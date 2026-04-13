/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          900: "#0d0d1a",
          800: "#13132b",
          700: "#1a1a3e",
          600: "#2d2b55",
          500: "#3d3b6a",
        },
        accent: {
          DEFAULT: "#7c3aed",
          secondary: "#a855f7",
          hover: "#c084fc",
          dim: "#5b21b6",
        },
        sev: {
          critical: "#ff2d6d",
          high: "#ff6b35",
          medium: "#fbbf24",
          low: "#34d399",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      animation: {
        "fade-in":             "fadeIn 0.25s ease-out",
        "slide-up":            "slideUp 0.25s ease-out",
        "slide-in-right":      "slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        "shimmer":             "shimmer 1.6s infinite linear",
        "pulse-glow-critical": "pulseGlowCritical 2s ease-in-out infinite",
        "pulse-glow-high":     "pulseGlowHigh 2.4s ease-in-out infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%":   { transform: "translateX(60px)", opacity: "0" },
          "100%": { transform: "translateX(0)",    opacity: "1" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
        pulseGlowCritical: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,45,109,0)" },
          "50%":      { boxShadow: "0 0 14px 4px rgba(255,45,109,0.5)" },
        },
        pulseGlowHigh: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,107,53,0)" },
          "50%":      { boxShadow: "0 0 10px 3px rgba(255,107,53,0.35)" },
        },
      },
    },
  },
  plugins: [],
};
