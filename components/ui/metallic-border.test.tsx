// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MetallicBorder', () => {
  it('renders children inside the border wrapper', async () => {
    const { MetallicBorder } = await import('@/components/ui/metallic-border');
    const html = renderToStaticMarkup(
      <MetallicBorder>
        <span>Content</span>
      </MetallicBorder>,
    );
    expect(html).toContain('Content');
  });

  it('applies the metallic-border CSS class', async () => {
    const { MetallicBorder } = await import('@/components/ui/metallic-border');
    const html = renderToStaticMarkup(
      <MetallicBorder>
        <span>Content</span>
      </MetallicBorder>,
    );
    expect(html).toContain('metallic-border');
  });

  it('applies custom className', async () => {
    const { MetallicBorder } = await import('@/components/ui/metallic-border');
    const html = renderToStaticMarkup(
      <MetallicBorder className="my-custom-class">
        <span>Content</span>
      </MetallicBorder>,
    );
    expect(html).toContain('my-custom-class');
  });

  it('renders with default border radius and width styles', async () => {
    const { MetallicBorder } = await import('@/components/ui/metallic-border');
    const html = renderToStaticMarkup(
      <MetallicBorder>
        <span>Content</span>
      </MetallicBorder>,
    );
    // Default borderRadius=16 → rounded outer, inner is borderRadius - borderWidth
    expect(html).toContain('border-radius:16px');
    expect(html).toContain('padding:2px');
  });

  it('renders with custom border radius and width', async () => {
    const { MetallicBorder } = await import('@/components/ui/metallic-border');
    const html = renderToStaticMarkup(
      <MetallicBorder borderRadius={9999} borderWidth={3}>
        <span>Content</span>
      </MetallicBorder>,
    );
    expect(html).toContain('border-radius:9999px');
    expect(html).toContain('padding:3px');
  });
});
