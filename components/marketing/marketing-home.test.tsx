// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type MarketingHomeModule = typeof import('./marketing-home');

let MarketingHomeShell: MarketingHomeModule['MarketingHomeShell'];
let renderMarketingHome: MarketingHomeModule['renderMarketingHome'];

beforeAll(async () => {
  const module = await import('./marketing-home');
  MarketingHomeShell = module.MarketingHomeShell;
  renderMarketingHome = module.renderMarketingHome;
});

describe('components/marketing/marketing-home', () => {
  function renderDoc() {
    const html = renderToStaticMarkup(
      <MarketingHomeShell
        authNav={<div>AuthNav</div>}
        primaryCta={<a href="/pricing">Get Started</a>}
      />,
    );
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('renders shared pricing values', async () => {
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

  it('renders marketing sections with injected nav and cta', async () => {
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
  });

  it('renders exactly one main landmark through MarketingHomeShell', async () => {
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
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);
    const getStartedCtaFn = vi.fn(async () => <div>CTA</div>);

    const element = await renderMarketingHome({ authNavFn, getStartedCtaFn });
    const html = renderToStaticMarkup(element);

    expect(authNavFn).toHaveBeenCalledTimes(1);
    expect(getStartedCtaFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('AuthNav');
    expect(html).toContain('CTA');
  });

  it('labels all major landing sections with aria-label', async () => {
    const doc = await renderDoc();
    const sectionLabels = Array.from(doc.querySelectorAll('section')).map(
      (section) => section.getAttribute('aria-label'),
    );

    expect(sectionLabels).toEqual([
      'Hero',
      'Impact statistics',
      'Features',
      'Pricing',
      'Get started',
    ]);
  });

  it('uses consistent "Sign in" casing in CTA', async () => {
    const doc = await renderDoc();
    const ctaLink = Array.from(doc.querySelectorAll('a')).find(
      (link) =>
        (link.textContent ?? '').trim() === 'Sign in' &&
        link.getAttribute('href') === '/sign-in',
    );

    expect(ctaLink).not.toBeUndefined();
    expect(
      Array.from(doc.querySelectorAll('a')).some(
        (link) => (link.textContent ?? '').trim() === 'Sign In',
      ),
    ).toBe(false);
  });

  it('exposes the hero heading with accessible name "Master Your Board Exams."', async () => {
    const doc = await renderDoc();
    const heading = doc.querySelector('h1');

    expect(heading).not.toBeNull();
    expect(heading?.getAttribute('aria-label')).toBeNull();
    const accessibleName = (heading?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(accessibleName).toBe('Master Your Board Exams.');
  });
});
