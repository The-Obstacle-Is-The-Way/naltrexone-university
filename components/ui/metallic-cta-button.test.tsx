// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { findAnchorByHref, parseHtml } from '@/tests/shared/dom-helpers';

let MetallicCtaButton: typeof import('@/components/ui/metallic-cta-button').MetallicCtaButton;

beforeAll(async () => {
  ({ MetallicCtaButton } = await import('@/components/ui/metallic-cta-button'));
});

describe('MetallicCtaButton', () => {
  it('renders children text', () => {
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('Get Started');
  });

  it('wraps content with a metallic border', () => {
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('metallic-border');
  });

  it('uses pill border radius (9999)', () => {
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('border-radius:9999px');
  });

  it('renders as a link when href is provided', () => {
    const html = renderToStaticMarkup(
      <MetallicCtaButton href="/pricing">Get Started</MetallicCtaButton>,
    );
    const doc = parseHtml(html);
    const anchor = findAnchorByHref(doc, '/pricing');

    expect(anchor).not.toBeNull();
    expect(anchor?.textContent).toContain('Get Started');
  });

  it('opens external links in a new tab with safe rel attributes', () => {
    const html = renderToStaticMarkup(
      <MetallicCtaButton href="https://example.com">
        Get Started
      </MetallicCtaButton>,
    );
    const doc = parseHtml(html);
    const anchor = findAnchorByHref(doc, 'https://example.com');
    const relTokens = new Set(anchor?.getAttribute('rel')?.split(/\s+/));

    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(relTokens).toEqual(new Set(['noreferrer', 'noopener']));
  });
});
