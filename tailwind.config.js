/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Electric green — matches web --sidebar-primary (#8aec9f)
        primary: {
          300: '#a6f8bf',
          400: '#8aec9f',
          500: '#6ee07f',
          600: '#50d467',
          700: '#38c257',
        },
        // Dark palette — concrete hex values (no CSS vars in RN)
        dark: {
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#121212',
        },
      },
    },
  },
  plugins: [],
};
