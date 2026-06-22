// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findAnchorByHref, parseHtml } from '@/tests/shared/dom-helpers';

describe('MetallicCtaButton', () => {
  it('renders children text', async () => {
    const { MetallicCtaButton } = await import(
      '@/components/ui/metallic-cta-button'
    );
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('Get Started');
  });

  it('wraps content with a metallic border', async () => {
    const { MetallicCtaButton } = await import(
      '@/components/ui/metallic-cta-button'
    );
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('metallic-border');
  });

  it('uses pill border radius (9999)', async () => {
    const { MetallicCtaButton } = await import(
      '@/components/ui/metallic-cta-button'
    );
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('border-radius:9999px');
  });

  it('renders as a link when href is provided', async () => {
    const { MetallicCtaButton } = await import(
      '@/components/ui/metallic-cta-button'
    );
    const html = renderToStaticMarkup(
      <MetallicCtaButton href="/pricing">Get Started</MetallicCtaButton>,
    );
    const doc = parseHtml(html);
    const anchor = findAnchorByHref(doc, '/pricing');

    expect(anchor).not.toBeNull();
    expect(anchor?.textContent).toContain('Get Started');
  });

  it('opens external links in a new tab with safe rel attributes', async () => {
    const { MetallicCtaButton } = await import(
      '@/components/ui/metallic-cta-button'
    );
    const html = renderToStaticMarkup(
      <MetallicCtaButton href="https://example.com">
        Get Started
      </MetallicCtaButton>,
    );

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});
