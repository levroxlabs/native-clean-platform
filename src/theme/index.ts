export type { Tokens } from './tokens';
export { colors, radius, semanticColors, spacing, typography } from './tokens';

/**
 * Converts a CSS token (`'16px'`) into the plain number that native React Native
 * APIs expect (`StyleSheet`, props of libraries that bypass NativeWind).
 */
export const px = (value: string): number => Number.parseFloat(value);
