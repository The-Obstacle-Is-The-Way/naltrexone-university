// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type MarketingHomeModule =
  typeof import('@/components/marketing/marketing-home');

let MarketingHomeShell: MarketingHomeModule['MarketingHomeShell'];
let renderMarketingHome: MarketingHomeModule['renderMarketingHome'];

beforeAll(async () => {
  const module = await import('@/components/marketing/marketing-home');
  MarketingHomeShell = module.MarketingHomeShell;
  renderMarketingHome = module.renderMarketingHome;
});

describe('components/marketing/marketing-home', () => {
  async function renderDoc() {
    const element = await MarketingHomeShell({
      authNavSlot: <div>AuthNav</div>,
      primaryCtaSlot: <a href="/pricing">Get Started</a>,
    });
    const html = renderToStaticMarkup(element);
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function renderShell(
    props?: Parameters<typeof MarketingHomeShell>[0],
  ): Promise<string> {
    const element = await MarketingHomeShell(props ?? {});
    return renderToStaticMarkup(element);
  }

  function getClassTokens(className: string): Set<string> {
    return new Set(className.split(/\s+/).filter(Boolean));
  }

  it('renders shared pricing values', async () => {
    const html = await renderShell({
      authNavSlot: <div>AuthNav</div>,
      primaryCtaSlot: <a href="/pricing">Get Started</a>,
    });

    expect(html).toContain(PRICING_DATA.monthly.price);
    expect(html).toContain(PRICING_DATA.annual.price);
    expect(html).toContain(PRICING_DATA.annual.savings);
  });

  it('renders injected auth nav content', async () => {
    const html = (await renderDoc()).documentElement.innerHTML;

    expect(html).toContain('AuthNav');
  });

  it('renders static fallbacks when auth-driven slots are unresolved', async () => {
    const html = await renderShell();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const header = doc.querySelector('header');
    const heroSection = doc.querySelector('section[aria-label="Hero"]');

    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
    expect(
      heroSection?.querySelector('a[href="/pricing"]')?.textContent?.trim(),
    ).toBe('Get Started');
  });

  it('renders injected primary CTA link and feature anchor', async () => {
    const html = (await renderDoc()).documentElement.innerHTML;

    expect(html).toContain('Get Started');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="#features"');
  });

  it('renders hero heading copy', async () => {
    const html = (await renderDoc()).documentElement.innerHTML;

    expect(html).toContain('Addiction Boards');
    expect(html).toContain(
      'Authored by a practicing, double board-certified addiction psychiatrist. Grounded in primary literature with citations.',
    );
    expect(html).toContain('Master the');
    expect(html).toContain('Addiction Boards.');
  });

  it('renders impact statistics copy', async () => {
    const doc = await renderDoc();
    const html = doc.documentElement.innerHTML;
    const studyModesValue = doc.querySelector(
      '[data-testid="impact-stat-study-modes-value"]',
    );

    expect(html).toContain('900+');
    expect(html).toContain('Board-Style Questions');
    expect(studyModesValue?.textContent?.trim()).toBe('3');
    expect(html).toContain('Study Modes');
  });

  it('renders tightened hero subtitle copy', async () => {
    const html = (await renderDoc()).documentElement.innerHTML;

    expect(html).toContain(
      'High-yield questions with detailed explanations for Addiction Psychiatry and Medicine. Practice with confidence and track your progress.',
    );
    expect(html).not.toContain(
      'High-yield questions with detailed explanations for Addiction Psychiatry and Addiction Medicine.',
    );
  });

  it('renders get-started section copy', async () => {
    const html = (await renderDoc()).documentElement.innerHTML;

    expect(html).toContain('Ready to start studying?');
  });

  it('renders standard marketing lede with explicit text-base sizing', async () => {
    const doc = await renderDoc();
    const lede = Array.from(doc.querySelectorAll('p')).find((element) =>
      element.textContent?.includes(
        'Clean workflows, zero fluff. Stay in the question loop and learn from every attempt.',
      ),
    );
    const ledeClassTokens = getClassTokens(lede?.getAttribute('class') ?? '');

    expect(lede).not.toBeNull();
    expect(ledeClassTokens.has('text-base')).toBe(true);
    expect(ledeClassTokens.has('text-muted-foreground')).toBe(true);
  });

  it('renders exactly one main landmark through MarketingHomeShell', async () => {
    const doc = await renderDoc();
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

  it('renderMarketingHome uses static fallbacks when no overrides are provided', async () => {
    const element = await renderMarketingHome();
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const header = doc.querySelector('header');
    const heroSection = doc.querySelector('section[aria-label="Hero"]');

    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
    expect(
      heroSection?.querySelector('a[href="/pricing"]')?.textContent?.trim(),
    ).toBe('Get Started');
  });

  it('renderMarketingHome preserves the primary CTA when auth nav falls back', async () => {
    const getStartedCtaFn = vi.fn(async () => <div>CTA</div>);

    const element = await renderMarketingHome({ getStartedCtaFn });
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const header = doc.querySelector('header');

    expect(getStartedCtaFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('CTA');
    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
  });

  it('renderMarketingHome preserves the auth nav when the CTA falls back', async () => {
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);

    const element = await renderMarketingHome({ authNavFn });
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heroSection = doc.querySelector('section[aria-label="Hero"]');

    expect(authNavFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('AuthNav');
    expect(
      heroSection?.querySelector('a[href="/pricing"]')?.textContent?.trim(),
    ).toBe('Get Started');
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

  it('uses outline variant for marketing pills without custom hover overrides', async () => {
    const doc = await renderDoc();
    const pricingLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'View pricing',
    );
    const signInCta = Array.from(doc.querySelectorAll('a')).find(
      (link) =>
        link.textContent?.trim() === 'Sign in' &&
        link.getAttribute('href') === '/sign-in',
    );

    // D-9: pills should not have custom hover:bg-muted or bg-card overrides
    for (const pill of [pricingLink, signInCta]) {
      expect(pill).not.toBeUndefined();
      const cls = pill?.getAttribute('class') ?? '';
      expect(cls).toContain('hover:bg-accent');
      expect(cls).not.toContain('hover:bg-muted');
      expect(cls).not.toContain('bg-card');
      expect(cls).not.toContain('border-border');
    }
  });

  it('uses outline monthly CTA and default annual CTA in pricing cards', async () => {
    const doc = await renderDoc();
    const pricingSection = doc.querySelector('section[aria-label="Pricing"]');
    const ctas = Array.from(
      pricingSection?.querySelectorAll('a[href="/pricing"]') ?? [],
    ).filter((link) => link.textContent?.trim() === 'Get Started');

    expect(ctas).toHaveLength(2);

    const monthlyCtaClass = ctas[0]?.getAttribute('class') ?? '';
    const annualCtaClass = ctas[1]?.getAttribute('class') ?? '';

    // D-14: monthly should be outline variant (not secondary)
    expect(monthlyCtaClass).toContain('hover:bg-accent');
    expect(monthlyCtaClass).not.toContain('bg-secondary');
    expect(monthlyCtaClass).not.toContain('hover:bg-secondary/80');

    // D-10: annual should use default variant classes (no manual fg/bg bypass)
    expect(annualCtaClass).toContain('bg-primary');
    expect(annualCtaClass).toContain('hover:bg-primary/90');
    expect(annualCtaClass).not.toContain('bg-foreground');
    expect(annualCtaClass).not.toContain('text-background');
  });

  it('marks MetallicCtaButton with a div debt-exception wrapper', async () => {
    const doc = await renderDoc();
    const exceptionWrapper = doc.querySelector('[data-debt-exception="D-15"]');
    const metallicCta = exceptionWrapper?.querySelector('a[href="/pricing"]');

    // D-15: machine-verifiable marker and valid block wrapper semantics.
    expect(exceptionWrapper).not.toBeNull();
    expect(exceptionWrapper?.tagName).toBe('DIV');
    expect(metallicCta).not.toBeNull();
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

  it('exposes the hero heading with accessible name "Master the Addiction Boards."', async () => {
    const doc = await renderDoc();
    const heading = doc.querySelector('h1');

    expect(heading).not.toBeNull();
    expect(heading?.getAttribute('aria-label')).toBeNull();
    const accessibleName = (heading?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(accessibleName).toBe('Master the Addiction Boards.');
  });
});
