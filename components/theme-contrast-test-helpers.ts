import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Contrast math for the theme token suites. Colors are sRGB channels in 0..1.

export const GLOBALS_CSS = readFileSync(
  resolve(process.cwd(), 'app/globals.css'),
  'utf-8',
);
export const WCAG_AA_NORMAL_TEXT = 4.5;

export type Rgb = [number, number, number];

export function extractBlock(
  source: string,
  selector: ':root' | '.dark',
): string {
  const selectorEscaped = selector.replace('.', '\\.');
  const regex = new RegExp(`${selectorEscaped}\\s*\\{([^}]+)\\}`);
  const match = source.match(regex);
  if (!match?.[1]) {
    throw new Error(`Could not find ${selector} block in globals.css`);
  }
  return match[1];
}

export function extractToken(block: string, tokenName: string): string {
  const regex = new RegExp(`--${tokenName}:\\s*([^;]+);`);
  const match = block.match(regex);
  if (!match?.[1]) {
    throw new Error(`Missing --${tokenName} in CSS block`);
  }
  return match[1].trim();
}

export function parseHslToken(value: string): [number, number, number] {
  if (
    !/^[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?%\s+[0-9]+(?:\.[0-9]+)?%$/.test(
      value,
    )
  ) {
    throw new Error(`Invalid HSL token value: "${value}"`);
  }
  const parts = value.replaceAll('%', '').split(/\s+/);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function hslToRgb(
  value: [number, number, number],
): [number, number, number] {
  const [h, sRaw, lRaw] = value;
  const s = sRaw / 100;
  const l = lRaw / 100;
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

function relativeLuminance(color: [number, number, number]): number {
  const [r, g, b] = color;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function compositeOver(
  foreground: [number, number, number],
  background: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

// The browser paints 8-bit channels, so a threshold case is judged on the
// rounded color, not the exact one (BUG-309: 4.495:1 rendered, 4.51:1 exact).
export function rendered(color: Rgb): Rgb {
  return [
    Math.round(color[0] * 255) / 255,
    Math.round(color[1] * 255) / 255,
    Math.round(color[2] * 255) / 255,
  ];
}
