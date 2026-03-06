// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Input: typeof import('./input').Input;

beforeAll(async () => {
  ({ Input } = await import('./input'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('components/ui/input', () => {
  it('renders an input with expected slot attribute', () => {
    const html = renderToStaticMarkup(
      <Input type="email" placeholder="Email" aria-invalid="true" />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const input = doc.querySelector('[data-slot="input"]');
    const classTokens = getClassTokens(input?.getAttribute('class') ?? '');

    expect(html).toContain('data-slot="input"');
    expect(html).toContain('type="email"');
    expect(html).toContain('placeholder="Email"');
    expect(html).toContain('aria-invalid="true"');
    expect(input).not.toBeNull();
    expect(classTokens.has('dark:border-foreground/40')).toBe(true);
    expect(classTokens.has('dark:border-input')).toBe(false);
  });
});
