import { describe, expect, it } from 'vitest';
import {
  compositeOver,
  contrastRatio,
  extractBlock,
  extractToken,
  hslToRgb,
  parseHslToken,
  rendered,
} from './theme-contrast-test-helpers';

describe('theme contrast test helpers', () => {
  it.each([
    [
      [0, 100, 50],
      [1, 0, 0],
    ],
    [
      [60, 100, 50],
      [1, 1, 0],
    ],
    [
      [120, 100, 50],
      [0, 1, 0],
    ],
    [
      [180, 100, 50],
      [0, 1, 1],
    ],
    [
      [240, 100, 50],
      [0, 0, 1],
    ],
    [
      [300, 100, 50],
      [1, 0, 1],
    ],
    [
      [0, 0, 50],
      [0.5, 0.5, 0.5],
    ],
  ] as const)('converts hsl %j to rgb %j', (hsl, rgb) => {
    const converted = hslToRgb([hsl[0], hsl[1], hsl[2]]);
    converted.forEach((channel, index) => {
      expect(channel).toBeCloseTo(rgb[index] ?? Number.NaN, 10);
    });
  });

  it('measures WCAG contrast from white on black to identical colors', () => {
    expect(contrastRatio([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 10);
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 10);
    expect(contrastRatio([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])).toBe(1);
  });

  it('composites a color over another at an alpha', () => {
    expect(compositeOver([1, 1, 1], [0, 0, 0], 0.25)).toEqual([
      0.25, 0.25, 0.25,
    ]);
  });

  it('rounds a color to the 8-bit channels a browser paints', () => {
    expect(rendered([0.5, 0.2, 1])).toEqual([128 / 255, 51 / 255, 1]);
  });

  it('reads a token from a theme block and parses it', () => {
    const block = extractBlock(':root { --x: 0 0% 50%; } .dark { }', ':root');

    expect(parseHslToken(extractToken(block, 'x'))).toEqual([0, 0, 50]);
    expect(() => extractToken(block, 'missing')).toThrow('Missing --missing');
    expect(() => parseHslToken('red')).toThrow('Invalid HSL token value');
    expect(() => extractBlock('body {}', '.dark')).toThrow(
      'Could not find .dark block',
    );
  });
});
