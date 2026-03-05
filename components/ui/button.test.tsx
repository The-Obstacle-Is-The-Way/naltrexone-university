// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Button: typeof import('@/components/ui/button').Button;

beforeAll(async () => {
  ({ Button } = await import('@/components/ui/button'));
});

describe('components/ui/button', () => {
  it('renders a button with expected slot attribute', () => {
    const html = renderToStaticMarkup(<Button type="button">Click</Button>);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('Click');
    expect(html).toContain('type="button"');
  });

  it('defaults to type="button" when type is omitted', () => {
    const html = renderToStaticMarkup(<Button>Click</Button>);

    expect(html).toContain('type="button"');
  });

  it('does not add a default type when rendered asChild', () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/pricing">Pricing</a>
      </Button>,
    );

    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('type="button"');
  });

  it('renders success variant classes', () => {
    const html = renderToStaticMarkup(<Button variant="success">Click</Button>);

    expect(html).toContain('bg-success');
    expect(html).toContain('text-success-foreground');
  });

  it('uses stronger dark-mode outline boundary tokens', () => {
    const html = renderToStaticMarkup(
      <Button variant="outline">Outline</Button>,
    );

    expect(html).toContain('dark:border-foreground/40');
    expect(html).toContain('dark:hover:border-foreground/70');
    expect(html).not.toContain('dark:border-input');
  });
});
