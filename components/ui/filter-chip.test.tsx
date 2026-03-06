// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let FilterChip: typeof import('@/components/ui/filter-chip').FilterChip;

beforeAll(async () => {
  ({ FilterChip } = await import('@/components/ui/filter-chip'));
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('FilterChip', () => {
  it('renders with the provided label', () => {
    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={false} onClick={() => undefined} />,
    );

    expect(html).toContain('Alcohol');
  });

  it('renders as a button element', () => {
    const html = renderToStaticMarkup(
      <FilterChip label="Opioids" selected={false} onClick={() => undefined} />,
    );

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
  });

  it('applies selected styling when selected is true', () => {
    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={true} onClick={() => undefined} />,
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-primary');
  });

  it('applies unselected styling when selected is false', () => {
    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={false} onClick={() => undefined} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector('button');
    const classTokens = getClassTokens(button?.getAttribute('class') ?? '');

    expect(html).toContain('aria-pressed="false"');
    expect(button).not.toBeNull();
    expect(classTokens.has('bg-primary')).toBe(false);
    expect(classTokens.has('hover:bg-muted/50')).toBe(true);
    expect(classTokens.has('dark:border-foreground/40')).toBe(true);
    expect(classTokens.has('hover:bg-accent')).toBe(false);
  });

  it('is disabled when disabled prop is true', () => {
    const html = renderToStaticMarkup(
      <FilterChip
        label="Alcohol"
        selected={false}
        onClick={() => undefined}
        disabled
      />,
    );

    expect(html).toContain('disabled');
  });
});
