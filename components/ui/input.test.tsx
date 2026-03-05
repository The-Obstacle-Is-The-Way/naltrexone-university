// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Input: typeof import('./input').Input;

beforeAll(async () => {
  ({ Input } = await import('./input'));
});

describe('components/ui/input', () => {
  it('renders an input with expected slot attribute', () => {
    const html = renderToStaticMarkup(
      <Input type="email" placeholder="Email" aria-invalid="true" />,
    );

    expect(html).toContain('data-slot="input"');
    expect(html).toContain('type="email"');
    expect(html).toContain('placeholder="Email"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('dark:border-foreground/40');
    expect(html).not.toContain('dark:border-input');
  });
});
