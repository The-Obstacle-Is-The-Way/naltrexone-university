import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf-8');
const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;

/**
 * Extract a CSS custom property value from a given block of text.
 * Handles the pattern: --token-name: value;
 */
function extractToken(block: string, tokenName: string): string | null {
  const regex = new RegExp(`--${tokenName}:\\s*([^;]+);`);
  const match = block.match(regex);
  return match?.[1]?.trim() ?? null;
}

/**
 * Split the CSS into :root and .dark blocks for independent assertion.
 */
function extractBlock(source: string, selector: ':root' | '.dark'): string {
  const selectorEscaped = selector.replace('.', '\\.');
  const regex = new RegExp(`${selectorEscaped}\\s*\\{([^}]+)\\}`);
  const match = source.match(regex);
  if (!match?.[1]) {
    throw new Error(`Could not find ${selector} block in globals.css`);
  }
  return match[1];
}

type HslColor = {
  h: number;
  s: number;
  l: number;
};

function parseHslToken(value: string): HslColor {
  const match = value.match(
    /^([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)%\s+([0-9]+(?:\.[0-9]+)?)%$/,
  );

  if (!match) {
    throw new Error(`Invalid HSL token value: "${value}"`);
  }

  return {
    h: Number.parseFloat(match[1]),
    s: Number.parseFloat(match[2]) / 100,
    l: Number.parseFloat(match[3]) / 100,
  };
}

function hslToRgb({ h, s, l }: HslColor): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const normalizedHue = ((h % 360) + 360) % 360;
  const hue = normalizedHue / 60;
  const x = c * (1 - Math.abs((hue % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue >= 0 && hue < 1) {
    r1 = c;
    g1 = x;
  } else if (hue >= 1 && hue < 2) {
    r1 = x;
    g1 = c;
  } else if (hue >= 2 && hue < 3) {
    g1 = c;
    b1 = x;
  } else if (hue >= 3 && hue < 4) {
    g1 = x;
    b1 = c;
  } else if (hue >= 4 && hue < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

function toLinear(channel: number): number {
  if (channel <= 0.04045) {
    return channel / 12.92;
  }

  return ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: HslColor): number {
  const [r, g, b] = hslToRgb(color);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(a: HslColor, b: HslColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('hslToRgb hue normalization', () => {
  it('returns equivalent rgb values when hue wraps past 360 degrees', () => {
    expect(hslToRgb({ h: 10, s: 0.72, l: 0.29 })).toEqual(
      hslToRgb({ h: 370, s: 0.72, l: 0.29 }),
    );
  });
});

function getRequiredTokenValue(block: string, tokenName: string): string {
  const value = extractToken(block, tokenName);
  if (!value) {
    throw new Error(`Missing --${tokenName} token in CSS block`);
  }
  return value;
}

describe('globals.css light-mode tokens (DEBT-263)', () => {
  const rootBlock = extractBlock(css, ':root');

  it('defines the shared app shell viewport offset token once at the root layer', () => {
    const appShellDefaultChromeHeight = getRequiredTokenValue(
      rootBlock,
      'app-shell-default-chrome-height',
    );

    expect(appShellDefaultChromeHeight).toBe('8rem');
  });

  it('returns pinned success token pair and enforces AA contrast when theme is light', () => {
    const success = getRequiredTokenValue(rootBlock, 'success');
    const successForeground = getRequiredTokenValue(
      rootBlock,
      'success-foreground',
    );

    expect(success).toBe('142 72% 29%');
    expect(successForeground).toBe('0 0% 100%');
    expect(
      contrastRatio(parseHslToken(success), parseHslToken(successForeground)),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
  });

  it('returns pinned destructive token pair and enforces AA contrast when theme is light', () => {
    const destructive = getRequiredTokenValue(rootBlock, 'destructive');
    const destructiveForeground = getRequiredTokenValue(
      rootBlock,
      'destructive-foreground',
    );

    expect(destructive).toBe('0 84.2% 48%');
    expect(destructiveForeground).toBe('210 40% 98%');
    expect(
      contrastRatio(
        parseHslToken(destructive),
        parseHslToken(destructiveForeground),
      ),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
  });
});

describe('globals.css dark-mode tokens are unchanged', () => {
  const darkBlock = extractBlock(css, '.dark');

  it('returns dark-mode success token when theme is dark', () => {
    const value = getRequiredTokenValue(darkBlock, 'success');
    expect(value).toBe('142 70% 42%');
  });

  it('returns dark-mode destructive token when theme is dark', () => {
    const value = getRequiredTokenValue(darkBlock, 'destructive');
    expect(value).toBe('0 72% 51%');
  });
});
