/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'solana': '#14F195',
        'solana-dark': '#0E9E63',
        'pump-fun': '#FD84D4',
        'pump-fun-dark': '#D55FAA',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        solana: {
          "primary": "#14F195",
          "primary-focus": "#0E9E63",
          "primary-content": "#000000",
          "secondary": "#FD84D4",
          "secondary-focus": "#D55FAA",
          "secondary-content": "#000000",
          "accent": "#1FB2A6",
          "accent-focus": "#167F76",
          "accent-content": "#000000",
          "neutral": "#2A2A2A",
          "neutral-focus": "#1A1A1A",
          "neutral-content": "#FFFFFF",
          "base-100": "#121212",
          "base-200": "#1E1E1E",
          "base-300": "#2A2A2A",
          "base-content": "#FFFFFF",
          "info": "#3ABFF8",
          "success": "#36D399",
          "warning": "#FBBD23",
          "error": "#F87272",
        },
      },
    ],
  },
}
