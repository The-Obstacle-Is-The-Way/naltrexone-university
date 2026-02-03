// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/label', () => {
  it('renders a label with expected slot attribute', async () => {
    const { Label } = await import('./label');

    const html = renderToStaticMarkup(<Label htmlFor="email">Email</Label>);

    expect(html).toContain('data-slot="label"');
    expect(html).toContain('for="email"');
    expect(html).toContain('Email');
  });
});
