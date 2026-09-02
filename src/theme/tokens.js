/**
 * Design tokens — the SINGLE SOURCE OF TRUTH for this boilerplate.
 *
 * This file is CommonJS on purpose: it is consumed both by `tailwind.config.js`
 * (Node/CJS) and by the app's TypeScript code (through `src/theme/index.ts`).
 * Changing a token here updates both sides at once.
 *
 * When starting a new app from this boilerplate, you normally only need to
 * replace `colors.brand` and `typography.fontFamily`.
 */

/** Colour scales. Keep the full 50→950 range so dark mode has contrast to work with. */
const colors = {
  // Primary brand colour. REPLACE THIS when cloning the boilerplate.
  brand: {
    50: '#eef4ff',
    100: '#d9e6ff',
    200: '#bcd3ff',
    300: '#8eb7ff',
    400: '#5990ff',
    500: '#3366ff',
    600: '#1f44f5',
    700: '#1a34e1',
    800: '#1c2eb6',
    900: '#1c2d8f',
    950: '#151c57',
  },
  neutral: {
    0: '#ffffff',
    50: '#f7f8fa',
    100: '#eef0f4',
    200: '#dfe3e9',
    300: '#c6ccd6',
    400: '#98a1b0',
    500: '#6b7482',
    600: '#4d5563',
    700: '#3a4150',
    800: '#252b36',
    900: '#161a22',
    950: '#0b0e14',
  },
  success: { 50: '#ecfdf3', 500: '#12b76a', 600: '#039855', 700: '#027a48' },
  warning: { 50: '#fffaeb', 500: '#f79009', 600: '#dc6803', 700: '#b54708' },
  danger: { 50: '#fef3f2', 500: '#f04438', 600: '#d92d20', 700: '#b42318' },
  info: { 50: '#eff8ff', 500: '#2e90fa', 600: '#1570ef', 700: '#175cd3' },
};

/**
 * Semantic aliases. Prefer these in screens (`bg-surface`, `text-content-muted`)
 * over raw colours (`bg-neutral-100`): it keeps dark mode and rebranding in one
 * place.
 */
const semanticColors = {
  background: colors.neutral[50],
  surface: colors.neutral[0],
  'surface-muted': colors.neutral[100],
  border: colors.neutral[200],
  'border-strong': colors.neutral[300],
  content: colors.neutral[900],
  'content-muted': colors.neutral[500],
  'content-inverse': colors.neutral[0],
  primary: colors.brand[500],
  'primary-pressed': colors.brand[600],
  // `tailwind.config.js` spreads these over `colors`, so this alias shadows the
  // raw `danger` scale: `text-danger` resolves here, `text-danger-500` no
  // longer resolves at all. That is the intent of rule 6 in AGENTS.md.
  danger: colors.danger[600],
  'danger-surface': colors.danger[50],
};

/**
 * Spacing on a 4pt grid. Values are CSS strings because NativeWind compiles
 * Tailwind to CSS before converting it to native styles.
 */
const spacing = {
  0: '0px',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
};

const typography = {
  /**
   * `null` means the system font (San Francisco / Roboto). Null entries are
   * filtered out in `tailwind.config.js`. To plug in a custom font, load it with
   * `expo-font` and set the family name here (e.g. 'Inter_400Regular').
   */
  fontFamily: {
    sans: null,
    mono: null,
  },
  fontSize: {
    xs: ['12px', { lineHeight: '16px' }],
    sm: ['14px', { lineHeight: '20px' }],
    base: ['16px', { lineHeight: '24px' }],
    lg: ['18px', { lineHeight: '28px' }],
    xl: ['20px', { lineHeight: '28px' }],
    '2xl': ['24px', { lineHeight: '32px' }],
    '3xl': ['30px', { lineHeight: '36px' }],
    '4xl': ['36px', { lineHeight: '40px' }],
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

const radius = {
  none: '0px',
  sm: '4px',
  DEFAULT: '8px',
  md: '10px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
};

module.exports = { colors, semanticColors, spacing, typography, radius };
