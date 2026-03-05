// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ErrorCard: typeof import('./error-card').ErrorCard;

beforeAll(async () => {
  ErrorCard = (await import('./error-card')).ErrorCard;
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('ErrorCard', () => {
  it('renders a consistent accessible error container', () => {
    const html = renderToStaticMarkup(
      <ErrorCard>Something went wrong.</ErrorCard>,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Something went wrong.');
  });

  it('uses p-6 as the default padding class', () => {
    const html = renderToStaticMarkup(<ErrorCard>Default padding</ErrorCard>);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const card = doc.querySelector('[data-error-card="true"]');
    const className = card?.getAttribute('class') ?? '';
    const classTokens = getClassTokens(className);

    expect(classTokens.has('p-6')).toBe(true);
    expect(classTokens.has('border-destructive')).toBe(true);
    expect(classTokens.has('border-destructive/30')).toBe(false);
    expect(classTokens.has('border-destructive/20')).toBe(false);
    expect(classTokens.has('p-4')).toBe(false);
  });

  it('allows compact p-4 padding override for constrained layouts', () => {
    const html = renderToStaticMarkup(
      <ErrorCard className="p-4">Compact padding</ErrorCard>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const card = doc.querySelector('[data-error-card="true"]');
    const className = card?.getAttribute('class') ?? '';

    expect(className).toContain('p-4');
    expect(className).not.toContain('p-6');
  });
});
