import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';
import {
  compositeOver,
  contrastRatio,
  extractBlock,
  extractToken,
  GLOBALS_CSS,
  hslToRgb,
  parseHslToken,
  type Rgb,
  rendered,
  WCAG_AA_NORMAL_TEXT,
} from './theme-contrast-test-helpers';

// BUG-309: the app forces its dark theme, so these are the only product
// colors. Each case measures small text on every surface it sits on, as the
// browser paints it (8-bit channels).
const dark = extractBlock(GLOBALS_CSS, '.dark');
const token = (name: string): Rgb =>
  hslToRgb(parseHslToken(extractToken(dark, name)));

const page = token('background');
const card = token('card');
const muted = token('muted');
const foreground = token('foreground');
const destructive = token('destructive');

// Foreground-ramp row fills (Pattern Registry I-1, I-2) and their hovers.
const rowSurfaces: [string, Rgb][] = [
  ['card row (foreground/5 on card)', compositeOver(foreground, card, 0.05)],
  ['card row hover (/8 on card)', compositeOver(foreground, card, 0.08)],
  ['page row (/8 on page)', compositeOver(foreground, page, 0.08)],
  ['page row hover (/12 on page)', compositeOver(foreground, page, 0.12)],
];

function minimumContrast(text: Rgb, surfaces: [string, Rgb][]): number {
  return Math.min(
    ...surfaces.map(([, surface]) =>
      contrastRatio(rendered(text), rendered(surface)),
    ),
  );
}

describe('dark theme small-text contrast (BUG-309)', () => {
  it('destructive text clears AA on every surface it sits on', () => {
    const surfaces: [string, Rgb][] = [
      ['page', page],
      ['card', card],
      ...rowSurfaces,
      [
        'error card (destructive/10 on page)',
        compositeOver(destructive, page, 0.1),
      ],
      [
        'error card (destructive/10 on card)',
        compositeOver(destructive, card, 0.1),
      ],
      [
        'incorrect choice (destructive/15 on card)',
        compositeOver(destructive, card, 0.15),
      ],
      [
        'feedback section (destructive/5 on card)',
        compositeOver(destructive, card, 0.05),
      ],
    ];

    expect(minimumContrast(destructive, surfaces)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  it('muted text clears AA on the tonal rows and the muted tab container', () => {
    const surfaces: [string, Rgb][] = [...rowSurfaces, ['muted', muted]];

    expect(
      minimumContrast(token('muted-foreground'), surfaces),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    // The value BUG-309 measured fails the same surfaces.
    expect(minimumContrast(hslToRgb([0, 0, 51.5]), surfaces)).toBeLessThan(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  it('light text clears AA on the destructive fills, at rest and on the dark hover', () => {
    const white: Rgb = [1, 1, 1];
    const fills: [string, Rgb][] = [
      ['rest (destructive/60 on page)', compositeOver(destructive, page, 0.6)],
      ['rest (destructive/60 on card)', compositeOver(destructive, card, 0.6)],
      ['hover (destructive/50 on page)', compositeOver(destructive, page, 0.5)],
      ['hover (destructive/50 on card)', compositeOver(destructive, card, 0.5)],
    ];

    expect(minimumContrast(white, fills)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(
      minimumContrast(token('destructive-foreground'), fills),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('keeps the destructive button on the fills measured above in dark mode', () => {
    expect(buttonVariants({ variant: 'destructive' }).split(/\s+/)).toEqual(
      expect.arrayContaining([
        'dark:bg-destructive/60',
        'dark:hover:bg-destructive/50',
      ]),
    );
  });
});
