import type { Page } from '@playwright/test';

export type ColorInfo = {
  background: string;
  card: string;
  muted: string;
  border: string;
};

/** Read CSS custom properties from :root in current color scheme. */
export async function getCssVariables(page: Page): Promise<ColorInfo> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    return {
      background: computed.getPropertyValue('--background').trim(),
      card: computed.getPropertyValue('--card').trim(),
      muted: computed.getPropertyValue('--muted').trim(),
      border: computed.getPropertyValue('--border').trim(),
    };
  });
}

/** Get computed background-color of an element. */
export async function getComputedBgColor(
  page: Page,
  selector: string,
): Promise<string> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return 'NOT_FOUND';
    return getComputedStyle(element).backgroundColor;
  }, selector);
}

export function parseRgba(
  rgba: string,
): { r: number; g: number; b: number; a: number } | null {
  const match = rgba.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] !== undefined ? Number(match[4]) : 1,
  };
}

function parseOklabLightness(
  color: string,
): { lightness: number; alpha: number } | null {
  const oklabMatch = color.match(
    /oklab\(\s*([\d.]+)\s+[-+]?[\d.]+\s+[-+]?[\d.]+(?:\s*\/\s*([\d.]+))?\s*\)/i,
  );
  if (oklabMatch?.[1]) {
    return {
      lightness: Number(oklabMatch[1]) * 100,
      alpha: oklabMatch[2] ? Number(oklabMatch[2]) : 1,
    };
  }

  const oklchMatch = color.match(
    /oklch\(\s*([\d.]+)\s+[-+]?[\d.]+\s+[-+]?[\d.]+(?:deg|rad|grad|turn)?(?:\s*\/\s*([\d.]+))?\s*\)/i,
  );
  if (oklchMatch?.[1]) {
    return {
      lightness: Number(oklchMatch[1]) * 100,
      alpha: oklchMatch[2] ? Number(oklchMatch[2]) : 1,
    };
  }

  return null;
}

/** Compute approximate lightness (0-100) from an rgb(a) string. */
export function approximateLightness(
  rgba: string,
  backdropLightness = 0,
): number | null {
  const parsed = parseRgba(rgba);
  if (parsed) {
    // Simple average approach (not perceptual, but good enough for rgb/rgba audits).
    const foregroundLightness =
      ((parsed.r + parsed.g + parsed.b) / 3 / 255) * 100;
    return parsed.a * foregroundLightness + (1 - parsed.a) * backdropLightness;
  }

  const parsedOklab = parseOklabLightness(rgba);
  if (parsedOklab) {
    return (
      parsedOklab.alpha * parsedOklab.lightness +
      (1 - parsedOklab.alpha) * backdropLightness
    );
  }

  return null;
}

export function requireLightness(
  rgba: string,
  label: string,
  backdropLightness = 0,
): number {
  const lightness = approximateLightness(rgba, backdropLightness);
  if (lightness === null) {
    throw new Error(`Could not parse ${label} lightness from "${rgba}"`);
  }
  return lightness;
}
