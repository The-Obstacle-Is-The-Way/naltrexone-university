// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MetallicCtaButton', () => {
  it('renders children text', async () => {
    const { MetallicCtaButton } = await import('./metallic-cta-button');
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('Get Started');
  });

  it('wraps content with a metallic border', async () => {
    const { MetallicCtaButton } = await import('./metallic-cta-button');
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('metallic-border');
  });

  it('uses pill border radius (9999)', async () => {
    const { MetallicCtaButton } = await import('./metallic-cta-button');
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('border-radius:9999px');
  });

  it('renders an arrow icon', async () => {
    const { MetallicCtaButton } = await import('./metallic-cta-button');
    const html = renderToStaticMarkup(
      <MetallicCtaButton>Get Started</MetallicCtaButton>,
    );
    // ArrowRight from lucide-react renders as an SVG
    expect(html).toContain('<svg');
  });

  it('renders as a link when href is provided', async () => {
    const { MetallicCtaButton } = await import('./metallic-cta-button');
    const html = renderToStaticMarkup(
      <MetallicCtaButton href="/pricing">Get Started</MetallicCtaButton>,
    );
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('<a');
  });
});
