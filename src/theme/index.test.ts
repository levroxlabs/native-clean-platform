import { parsePixels } from './index';

describe('parsePixels', () => {
  it('converts a CSS pixel token into a plain number', () => {
    expect(parsePixels('16px')).toBe(16);
  });

  it('preserves decimal precision', () => {
    expect(parsePixels('0.5px')).toBe(0.5);
  });

  it('parses a unit-less numeric string', () => {
    expect(parsePixels('24')).toBe(24);
  });

  it('returns NaN for a non-numeric string, matching Number.parseFloat', () => {
    expect(parsePixels('px')).toBeNaN();
  });
});
