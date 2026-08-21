const { colors, semanticColors, spacing, typography, radius } = require('./src/theme/tokens');

/** Strips null entries (e.g. system fontFamily) before handing them to Tailwind. */
const compact = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...colors,
        ...semanticColors,
      },
      spacing,
      borderRadius: radius,
      fontFamily: compact(typography.fontFamily),
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
    },
  },
  plugins: [],
};
