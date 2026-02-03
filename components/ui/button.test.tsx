// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/button', () => {
  it('renders a button with expected slot attribute', async () => {
    const { Button } = await import('./button');

    const html = renderToStaticMarkup(<Button type="button">Click</Button>);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('Click');
    expect(html).toContain('type="button"');
  });
});
