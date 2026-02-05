import { expect, test } from '@playwright/test';

type Rgba = { r: number; g: number; b: number; a: number };

function parseRgba(raw: string): Rgba {
  const trimmed = raw.trim();
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => `${c}${c}`)
            .join('')
        : hex;

    if (normalized.length !== 6) {
      throw new Error(`Unsupported hex color format: ${raw}`);
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);

    if ([r, g, b].some((value) => Number.isNaN(value))) {
      throw new Error(`Failed to parse color: ${raw}`);
    }

    return { r, g, b, a: 1 };
  }

  if (!trimmed.startsWith('rgb')) {
    throw new Error(`Unsupported color format: ${raw}`);
  }

  const inner = trimmed.slice(
    trimmed.indexOf('(') + 1,
    trimmed.lastIndexOf(')'),
  );
  const hasSlash = inner.includes('/');
  const [channelsPart, alphaPart] = hasSlash
    ? inner.split('/').map((part) => part.trim())
    : [inner, null];

  const channelTokens = channelsPart
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const r = Number(channelTokens[0]);
  const g = Number(channelTokens[1]);
  const b = Number(channelTokens[2]);
  const aFromChannels =
    channelTokens.length >= 4 ? Number(channelTokens[3]) : null;
  const a = alphaPart ? Number(alphaPart) : (aFromChannels ?? 1);

  if ([r, g, b, a].some((value) => Number.isNaN(value))) {
    throw new Error(`Failed to parse color: ${raw}`);
  }

  return { r, g, b, a };
}

function srgbToLinear(channel255: number): number {
  const channel = channel255 / 255;
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const outA = foreground.a + background.a * (1 - foreground.a);
  if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  const r =
    (foreground.r * foreground.a +
      background.r * background.a * (1 - foreground.a)) /
    outA;
  const g =
    (foreground.g * foreground.a +
      background.g * background.a * (1 - foreground.a)) /
    outA;
  const b =
    (foreground.b * foreground.a +
      background.b * background.a * (1 - foreground.a)) /
    outA;

  return { r, g, b, a: outA };
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
  const fgLum = relativeLuminance(foreground);
  const bgLum = relativeLuminance(background);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('marketing contrast', () => {
  test.use({
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('homepage maintains readable hero and stat cards in light mode', async ({
    page,
  }) => {
    await page.goto('/');

    // Creating an Option element and reading option.style.* normalizes computed
    // colors (named colors, hex, rgb(), rgba()) into a consistent rgba()/rgb()
    // string format that parseRgba expects.
    const bodyBg = parseRgba(
      await page.evaluate(() => {
        const option = new Option();
        option.style.backgroundColor = getComputedStyle(
          document.body,
        ).backgroundColor;
        return option.style.backgroundColor;
      }),
    );

    const heroSpan = page
      .locator('h1 span')
      .filter({ hasText: 'Master Your' })
      .first();
    await expect(heroSpan).toBeVisible();

    const heroColorResult = await heroSpan.evaluate((el) => {
      const option = new Option();
      option.style.color = getComputedStyle(el).color;

      let opacity = 1;
      let current: Element | null = el;
      while (current) {
        opacity *= Number(getComputedStyle(current).opacity);
        current = current.parentElement;
      }

      return { color: option.style.color, opacity };
    });
    const heroColorRaw = parseRgba(heroColorResult.color);
    const heroColor = composite(
      { ...heroColorRaw, a: heroColorRaw.a * heroColorResult.opacity },
      bodyBg,
    );

    expect(contrastRatio(heroColor, bodyBg)).toBeGreaterThanOrEqual(3);

    const statsCardTestId = 'impact-stat-board-style-questions';
    const statsCard = page.getByTestId(statsCardTestId);
    await expect(statsCard).toBeVisible();

    const statsValue = statsCard.getByTestId(`${statsCardTestId}-value`);
    const statsValueColorResult = await statsValue.evaluate((el) => {
      const option = new Option();
      option.style.color = getComputedStyle(el).color;

      let opacity = 1;
      let current: Element | null = el;
      while (current) {
        opacity *= Number(getComputedStyle(current).opacity);
        current = current.parentElement;
      }

      return { color: option.style.color, opacity };
    });
    const statsValueColorRaw = parseRgba(statsValueColorResult.color);
    const statsCardBg = parseRgba(
      await statsCard.evaluate((el) => {
        const option = new Option();
        option.style.backgroundColor = getComputedStyle(el).backgroundColor;
        return option.style.backgroundColor;
      }),
    );
    const effectiveStatsCardBg = composite(statsCardBg, bodyBg);
    const statsValueColor = composite(
      {
        ...statsValueColorRaw,
        a: statsValueColorRaw.a * statsValueColorResult.opacity,
      },
      effectiveStatsCardBg,
    );

    const statsFontSizePx = await statsValue.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    const statsFontWeightValue = await statsValue.evaluate(
      (el) => getComputedStyle(el).fontWeight,
    );
    const statsFontWeight =
      Number.parseInt(statsFontWeightValue, 10) || statsFontWeightValue;
    const isBold =
      typeof statsFontWeight === 'number'
        ? statsFontWeight >= 700
        : statsFontWeight === 'bold';
    const isLargeText =
      statsFontSizePx >= 24 || (statsFontSizePx >= 18.66 && isBold);

    // WCAG contrast: >=4.5:1 for normal text, >=3:1 for large text.
    const minContrastRatio = isLargeText ? 3 : 4.5;

    expect(
      contrastRatio(statsValueColor, effectiveStatsCardBg),
    ).toBeGreaterThanOrEqual(minContrastRatio);
  });
});
