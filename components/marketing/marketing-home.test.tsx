// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('components/marketing/marketing-home', () => {
  it('renders shared pricing values', async () => {
    const { MarketingHomeShell } = await import('./marketing-home');

    const html = renderToStaticMarkup(
      <MarketingHomeShell
        authNav={<div>AuthNav</div>}
        primaryCta={<a href="/pricing">Get Started</a>}
      />,
    );

    expect(html).toContain(PRICING_DATA.monthly.price);
    expect(html).toContain(PRICING_DATA.annual.price);
    expect(html).toContain(PRICING_DATA.annual.savings);
  });

  it(
    'renders marketing sections with injected nav and cta',
    { timeout: 15_000 },
    async () => {
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
      // Impact stats
      expect(html).toContain('500+');
      expect(html).toContain('Board-Style Questions');
      // CTA section
      expect(html).toContain('Ready to start studying?');
      // Hero gradient text
      expect(html).toContain('Master Your');
      expect(html).toContain('Board Exams.');
      expect(html).toContain('<main id="main-content"');
    },
  );

  it('renders exactly one main landmark through MarketingHomeShell', async () => {
    const { MarketingHomeShell } = await import('./marketing-home');

    const html = renderToStaticMarkup(
      <MarketingHomeShell
        authNav={<div>AuthNav</div>}
        primaryCta={<a href="/pricing">Get Started</a>}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mainLandmarks = doc.querySelectorAll('main');

    expect(mainLandmarks).toHaveLength(1);
    expect(mainLandmarks[0]?.getAttribute('id')).toBe('main-content');
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
