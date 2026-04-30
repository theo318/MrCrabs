/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF9F6",
        ink: "#0A0A0A",
        rule: "#1A1A1A",
        muted: "#6B6B6B",
        faint: "#D4D2CC",
        soft: "#EFEDE6",
        approve: "#1F6E3D",
        decline: "#A8202A",
        escalate: "#1A2C5C",
        signal: "#C84B17",
      },
      fontFamily: {
        serif: ["'Fraunces'", "'Iowan Old Style'", "Georgia", "serif"],
        sans: ["'Söhne'", "'Neue Haas Grotesk'", "'Helvetica Neue'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "monospace"],
      },
      letterSpacing: {
        widest: "0.18em",
      },
    },
  },
  plugins: [],
};
