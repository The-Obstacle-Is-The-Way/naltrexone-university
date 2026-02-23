import { describe, expect, it } from 'vitest';
import { approximateLightness, requireLightness } from './color-utils';

describe('color-utils', () => {
  it('parses oklab lightness of 0 instead of returning null', () => {
    expect(approximateLightness('oklab(0 0 0)')).toBe(0);
    expect(() => requireLightness('oklab(0 0 0)', 'black')).not.toThrow();
  });

  it('respects alpha=0 for oklab values', () => {
    expect(approximateLightness('oklab(1 0 0 / 0)', 42)).toBe(42);
  });

  it('parses oklch lightness of 0 and alpha=0', () => {
    expect(approximateLightness('oklch(0 0 0)', 10)).toBe(0);
    expect(approximateLightness('oklch(1 0 0 / 0)', 55)).toBe(55);
  });
});
