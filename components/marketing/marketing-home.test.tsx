// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('components/marketing/marketing-home', () => {
  it('renders marketing sections with injected nav and cta', async () => {
    const { MarketingHomeShell } = await import('./marketing-home');

    const html = renderToStaticMarkup(
      <MarketingHomeShell
        authNav={<div>AuthNav</div>}
        primaryCta={<a href="/pricing">Get Started</a>}
      />,
    );

    expect(html).toContain('Addiction Boards');
    expect(html).toContain('AuthNav');
    expect(html).toContain('Get Started');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="#features"');
  });

  it('renders via renderMarketingHome with injected deps', async () => {
    const { renderMarketingHome } = await import('./marketing-home');

    const authNavFn = vi.fn(async () => <div>AuthNav</div>);
    const getStartedCtaFn = vi.fn(async () => <div>CTA</div>);

    const element = await renderMarketingHome({ authNavFn, getStartedCtaFn });
    const html = renderToStaticMarkup(element);

    expect(authNavFn).toHaveBeenCalledTimes(1);
    expect(getStartedCtaFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('AuthNav');
    expect(html).toContain('CTA');
  });
});
