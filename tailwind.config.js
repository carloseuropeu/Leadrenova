/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0f0a',
        bg2:     '#111611',
        bg3:     '#171e17',
        bg4:     '#1d261d',
        border:  '#232c23',
        border2: '#2e3a2e',
        green:   '#4ade80',
        green2:  '#22c55e',
        green3:  '#16a34a',
        amber:   '#fbbf24',
        red:     '#f87171',
        blue:    '#60a5fa',
        purple:  '#a78bfa',
        text:    '#dfe8df',
        text2:   '#7a917a',
        text3:   '#4a5e4a',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      backgroundColor: {
        gdim: 'rgba(74,222,128,0.08)',
        adim: 'rgba(251,191,36,0.09)',
        rdim: 'rgba(248,113,113,0.09)',
        bdim: 'rgba(96,165,250,0.09)',
      },
    },
  },
  plugins: [],
}
