import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf-8');

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

describe('globals.css light-mode tokens (DEBT-263)', () => {
  const rootBlock = extractBlock(css, ':root');

  it('has --success at WCAG AA-safe lightness (L=29%)', () => {
    const value = extractToken(rootBlock, 'success');
    expect(value).toBe('142 72% 29%');
  });

  it('has --destructive at WCAG AA-safe lightness (L=48%)', () => {
    const value = extractToken(rootBlock, 'destructive');
    expect(value).toBe('0 84.2% 48%');
  });
});

describe('globals.css dark-mode tokens are unchanged', () => {
  const darkBlock = extractBlock(css, '.dark');

  it('preserves --success dark-mode value', () => {
    const value = extractToken(darkBlock, 'success');
    expect(value).toBe('142 70% 42%');
  });

  it('preserves --destructive dark-mode value', () => {
    const value = extractToken(darkBlock, 'destructive');
    expect(value).toBe('0 72% 51%');
  });
});
