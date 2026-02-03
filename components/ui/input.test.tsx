// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('components/ui/input', () => {
  it('renders an input with expected slot attribute', async () => {
    const { Input } = await import('./input');

    const html = renderToStaticMarkup(
      <Input type="email" placeholder="Email" aria-invalid="true" />,
    );

    expect(html).toContain('data-slot="input"');
    expect(html).toContain('type="email"');
    expect(html).toContain('placeholder="Email"');
    expect(html).toContain('aria-invalid="true"');
  });
});
