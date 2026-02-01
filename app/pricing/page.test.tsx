// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  it('renders subscribe actions', async () => {
    const PricingPage = (await import('./page')).default;

    const html = renderToStaticMarkup(<PricingPage />);

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
  });
});
