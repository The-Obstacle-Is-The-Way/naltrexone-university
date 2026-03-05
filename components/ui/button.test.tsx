// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/button', () => {
  it('renders a button with expected slot attribute', async () => {
    const { Button } = await import('@/components/ui/button');

    const html = renderToStaticMarkup(<Button type="button">Click</Button>);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('Click');
    expect(html).toContain('type="button"');
  });

  it('defaults to type="button" when type is omitted', async () => {
    const { Button } = await import('@/components/ui/button');

    const html = renderToStaticMarkup(<Button>Click</Button>);

    expect(html).toContain('type="button"');
  });

  it('does not add a default type when rendered asChild', async () => {
    const { Button } = await import('@/components/ui/button');

    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/pricing">Pricing</a>
      </Button>,
    );

    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('type="button"');
  });

  it('renders success variant classes', async () => {
    const { Button } = await import('@/components/ui/button');

    const html = renderToStaticMarkup(<Button variant="success">Click</Button>);

    expect(html).toContain('bg-success');
    expect(html).toContain('text-success-foreground');
  });

  it('uses stronger dark-mode outline boundary tokens', async () => {
    const { Button } = await import('@/components/ui/button');

    const html = renderToStaticMarkup(
      <Button variant="outline">Outline</Button>,
    );

    expect(html).toContain('dark:border-foreground/40');
    expect(html).toContain('dark:hover:border-foreground/70');
    expect(html).not.toContain('dark:border-input');
  });
});
