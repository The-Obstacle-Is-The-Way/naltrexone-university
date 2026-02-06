// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('FilterChip', () => {
  it('renders with the provided label', async () => {
    const { FilterChip } = await import('@/components/ui/filter-chip');

    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={false} onClick={() => undefined} />,
    );

    expect(html).toContain('Alcohol');
  });

  it('renders as a button element', async () => {
    const { FilterChip } = await import('@/components/ui/filter-chip');

    const html = renderToStaticMarkup(
      <FilterChip label="Opioids" selected={false} onClick={() => undefined} />,
    );

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
  });

  it('applies selected styling when selected is true', async () => {
    const { FilterChip } = await import('@/components/ui/filter-chip');

    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={true} onClick={() => undefined} />,
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-primary');
  });

  it('applies unselected styling when selected is false', async () => {
    const { FilterChip } = await import('@/components/ui/filter-chip');

    const html = renderToStaticMarkup(
      <FilterChip label="Alcohol" selected={false} onClick={() => undefined} />,
    );

    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('bg-primary');
  });

  it('is disabled when disabled prop is true', async () => {
    const { FilterChip } = await import('@/components/ui/filter-chip');

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
