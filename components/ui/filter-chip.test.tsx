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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector('button');
    const classTokens = getClassTokens(button?.getAttribute('class') ?? '');

    expect(html).toContain('aria-pressed="true"');
    expect(button).not.toBeNull();
    expect(classTokens.has('rounded-md')).toBe(true);
    expect(classTokens.has('rounded-full')).toBe(false);
    expect(classTokens.has('border')).toBe(false);
    expect(classTokens.has('focus-visible:border-ring')).toBe(false);
    expect(classTokens.has('focus-visible:outline-none')).toBe(true);
    expect(classTokens.has('outline-none')).toBe(false);
    expect(classTokens.has('border-primary')).toBe(false);
    expect(classTokens.has('text-sm')).toBe(true);
    expect(classTokens.has('font-medium')).toBe(true);
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
    expect(classTokens.has('rounded-md')).toBe(true);
    expect(classTokens.has('rounded-full')).toBe(false);
    expect(classTokens.has('border')).toBe(false);
    expect(classTokens.has('focus-visible:border-ring')).toBe(false);
    expect(classTokens.has('focus-visible:outline-none')).toBe(true);
    expect(classTokens.has('outline-none')).toBe(false);
    expect(classTokens.has('focus-visible:ring-ring/50')).toBe(true);
    expect(classTokens.has('focus-visible:ring-[3px]')).toBe(true);
    expect(classTokens.has('text-sm')).toBe(true);
    expect(classTokens.has('font-medium')).toBe(true);
    expect(classTokens.has('bg-primary')).toBe(false);
    expect(classTokens.has('bg-foreground/[0.07]')).toBe(true);
    expect(classTokens.has('bg-transparent')).toBe(false);
    expect(classTokens.has('bg-background')).toBe(false);
    expect(classTokens.has('border-border')).toBe(false);
    expect(classTokens.has('border-foreground/45')).toBe(false);
    expect(classTokens.has('text-foreground/80')).toBe(true);
    expect(classTokens.has('text-foreground')).toBe(false);
    expect(classTokens.has('text-foreground/60')).toBe(false);
    expect(classTokens.has('hover:bg-foreground/[0.12]')).toBe(true);
    expect(classTokens.has('hover:bg-foreground/[0.10]')).toBe(false);
    expect(classTokens.has('hover:text-foreground')).toBe(true);
    expect(classTokens.has('hover:border-foreground/60')).toBe(false);
    expect(classTokens.has('cursor-pointer')).toBe(true);
    expect(classTokens.has('dark:border-foreground/40')).toBe(false);
    expect(classTokens.has('dark:hover:border-foreground/70')).toBe(false);
    expect(classTokens.has('hover:bg-accent')).toBe(false);
    expect(classTokens.has('hover:text-accent-foreground')).toBe(false);
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
