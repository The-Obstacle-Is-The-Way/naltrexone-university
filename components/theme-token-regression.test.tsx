// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  compositeOver,
  contrastRatio,
  extractBlock,
  extractToken,
  GLOBALS_CSS,
  hslToRgb,
  parseHslToken,
  WCAG_AA_NORMAL_TEXT,
} from '@/components/theme-contrast-test-helpers';
import {
  collectOpacityIssues,
  collectRawButtonExemptionIssues,
  readProductionUiSources,
} from '@/components/theme-token-regression-source-scan';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import {
  findAnchorByHref,
  findHeadingByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = snapshotProcessEnv();

let GetStartedCta: typeof import('@/components/get-started-cta').GetStartedCta;
let PricingView: typeof import('@/app/pricing/pricing-view').PricingView;
let DashboardView: typeof import('@/app/(app)/app/dashboard/page').DashboardView;
let SessionSummaryView: typeof import('@/app/(app)/app/practice/[sessionId]/components/session-summary-view').SessionSummaryView;
let MarketingHomeShell: typeof import('@/components/marketing/marketing-home').MarketingHomeShell;
let ChoiceButton: typeof import('@/components/question/choice-button').ChoiceButton;
let Feedback: typeof import('@/components/question/feedback').Feedback;
let QuestionRatingFooter: typeof import('@/components/question/question-rating-footer').QuestionRatingFooter;
let BillingContent: typeof import('@/app/(app)/app/billing/page').BillingContent;
let LegalDocument: typeof import('@/components/legal/legal-document').LegalDocument;
let ConsentTerms: typeof import('@/components/consent-terms').ConsentTerms;

describe('theme token regression', () => {
  beforeAll(async () => {
    ({ GetStartedCta } = await import('@/components/get-started-cta'));
    ({ PricingView } = await import('@/app/pricing/pricing-view'));
    ({ DashboardView } = await import('@/app/(app)/app/dashboard/page'));
    ({ SessionSummaryView } = await import(
      '@/app/(app)/app/practice/[sessionId]/components/session-summary-view'
    ));
    ({ MarketingHomeShell } = await import(
      '@/components/marketing/marketing-home'
    ));
    ({ ChoiceButton } = await import('@/components/question/choice-button'));
    ({ Feedback } = await import('@/components/question/feedback'));
    ({ QuestionRatingFooter } = await import(
      '@/components/question/question-rating-footer'
    ));
    ({ BillingContent } = await import('@/app/(app)/app/billing/page'));
    ({ LegalDocument } = await import('@/components/legal/legal-document'));
    ({ ConsentTerms } = await import('@/components/consent-terms'));
  });

  beforeEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
  });

  it('retains exactly one raw button in the documented mobile-nav exception', () => {
    const issues = collectRawButtonExemptionIssues(readProductionUiSources());

    expect(issues).toEqual([]);
  });

  it.each([0, 2])(
    'rejects %i raw buttons in the single-button mobile-nav exception',
    (count) => {
      const issues = collectRawButtonExemptionIssues([
        {
          filePath: 'components/mobile-nav.tsx',
          lines: Array.from({ length: count }, () => '<button />'),
        },
      ]);

      expect(issues).toEqual([
        `components/mobile-nav.tsx expected exactly 1 exempt raw <button> occurrence(s), found ${count}. Pattern Registry I-6 app-shell disclosure toggle exception.`,
      ]);
    },
  );

  it('rejects a missing mobile-nav exception source instead of passing an empty walk', () => {
    expect(collectRawButtonExemptionIssues([])).toEqual([
      'components/mobile-nav.tsx expected exactly 1 exempt raw <button> occurrence(s), found 0. Pattern Registry I-6 app-shell disclosure toggle exception.',
    ]);
  });

  it('blocks undocumented opacity tokens outside documented exemptions', () => {
    const issues = collectOpacityIssues(readProductionUiSources(), {
      enforceExemptionCounts: true,
    });

    expect(issues).toEqual([]);
  });

  it('uses the canonical focus ring on legal document links and table regions', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: [
            '[Privacy Policy](/privacy)',
            '',
            '| Provider | Purpose |',
            '|---|---|',
            '| Example | Testing |',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    // One spelling of the canonical ring across the design system: the shared
    // `ring-focus` utility from globals.css, never a hand-copied literal.
    const link = findAnchorByHref(doc, '/privacy');
    expect(link?.classList.contains('ring-focus')).toBe(true);

    const tableRegion = doc.querySelector('table')?.parentElement;
    expect(tableRegion?.classList.contains('ring-focus')).toBe(true);
  });

  it('uses the registered legal reading measure, hierarchy, and semantic tone', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 8, 2026',
          bodyMarkdown: [
            '## Main section',
            '',
            'Long-form policy body.',
            '',
            '### Subsection',
            '',
            '**Important term.** Supporting detail.',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    const article = doc.querySelector('article');
    expect(article?.classList.contains('max-w-[72ch]')).toBe(true);

    const section = findHeadingByText(doc, 'Main section', { level: 2 });
    expect(section?.classList.contains('border-t')).toBe(true);
    expect(section?.classList.contains('border-border')).toBe(true);
    expect(section?.classList.contains('mt-12')).toBe(true);
    expect(section?.classList.contains('pt-8')).toBe(true);

    const subsection = findHeadingByText(doc, 'Subsection', { level: 3 });
    expect(subsection).not.toBeNull();

    const body = Array.from(doc.querySelectorAll('article > p')).find(
      (paragraph) => paragraph.textContent === 'Long-form policy body.',
    );
    expect(body?.classList.contains('text-foreground/80')).toBe(true);

    const emphasis = doc.querySelector('strong');
    expect(emphasis?.classList.contains('text-foreground')).toBe(true);
  });

  // Pattern Registry I-7 (DEBT-414 F03): the renewal opt-in is a native
  // checkbox, so it carries the canonical non-Button focus ring itself.
  // Checkout and the trial add-card offer both render it through
  // ConsentTerms.
  it.each([
    ['checkout', PRICING_DATA.annual.consent.standard],
    ['add-card', PRICING_DATA.annual.trialPaymentConsent],
  ])(
    'uses the canonical focus ring and primary accent on the %s renewal opt-in',
    (_surface, consent) => {
      const doc = parseHtml(
        renderToStaticMarkup(<ConsentTerms consent={consent} />),
      );
      const optIn = doc.querySelector(
        'input[type="checkbox"][name="renewalOptIn"]',
      );

      for (const token of [
        'focus-visible:outline-none',
        'focus-visible:ring-ring/50',
        'focus-visible:ring-[3px]',
        'accent-primary',
      ]) {
        expect(optIn?.classList.contains(token)).toBe(true);
      }
    },
  );

  it.each([
    ['checkout', PRICING_DATA.monthly.consent.trial],
    ['add-card', PRICING_DATA.monthly.trialPaymentConsent],
  ])(
    'uses the shared focus ring utility on %s legal-consent links',
    (_surface, consent) => {
      const html = renderToStaticMarkup(<ConsentTerms consent={consent} />);
      const doc = parseHtml(html);

      for (const href of [ROUTES.TERMS, ROUTES.PRIVACY]) {
        const link = findAnchorByHref(doc, href);
        expect(link?.classList.contains('ring-focus')).toBe(true);
      }
    },
  );

  it('reports a synthetic undocumented arbitrary opacity token with file and line context', () => {
    const issues = collectOpacityIssues([
      {
        filePath: 'components/example-card.tsx',
        lines: [
          'export function Example() { return <div className="bg-foreground/[0.03]" />; }',
          'export function Other() { return <div className="bg-muted/[13%]" />; }',
          'export function Third() { return <div className="bg-muted/30 border-border/30" />; }',
        ],
      },
    ]);

    expect(issues).toEqual([
      'components/example-card.tsx:1 undocumented opacity token "bg-foreground/[0.03]" is not in the Pattern Registry allowlist. Add the pattern to docs/frontend/pattern-registry.md before using it.',
      'components/example-card.tsx:2 undocumented opacity token "bg-muted/[13%]" is not in the Pattern Registry allowlist. Add the pattern to docs/frontend/pattern-registry.md before using it.',
      'components/example-card.tsx:3 undocumented opacity token "bg-muted/30" is not in the Pattern Registry allowlist. Add the pattern to docs/frontend/pattern-registry.md before using it.',
      'components/example-card.tsx:3 undocumented opacity token "border-border/30" is not in the Pattern Registry allowlist. Add the pattern to docs/frontend/pattern-registry.md before using it.',
    ]);
  });

  it('allows documented foreground-ramp examples from Pattern Registry contexts', () => {
    const issues = collectOpacityIssues([
      {
        filePath: 'app/(app)/app/history/components/history-questions-tab.tsx',
        lines: [
          'className="block rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12]"',
        ],
      },
      {
        filePath: 'components/question/choice-button.tsx',
        lines: [
          'className="hover:border-foreground/55 hover:bg-foreground/[0.06] dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]"',
        ],
      },
    ]);

    expect(issues).toEqual([]);
  });

  it('uses semantic CTA classes in GetStartedCta', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    const ctaHtml = renderToStaticMarkup(await GetStartedCta());

    expect(ctaHtml).toContain('bg-primary');
    expect(ctaHtml).toContain('text-primary-foreground');
    expect(ctaHtml).not.toContain('bg-zinc-100');
  });

  it('uses semantic border tokens in PricingView', async () => {
    const pricingHtml = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(pricingHtml).not.toContain('bg-zinc-100');
    expect(pricingHtml).not.toContain('border-zinc-500');
    expect(pricingHtml).toContain('border-primary');
  });

  it('does not apply hover affordance tokens to non-interactive dashboard stat cards', async () => {
    const dashboardHtml = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 10,
          accuracyOverall: 0.7,
          scoredOverall: 10,
          unscoredQuestionsOverall: 0,
          answeredLast7Days: 5,
          accuracyLast7Days: 0.8,
          scoredLast7Days: 5,
          unscoredQuestionsLast7Days: 0,
          currentStreakDays: 3,
          recentActivity: [],
        }}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );

    expect(dashboardHtml).not.toContain('hover:border-border');
    expect(dashboardHtml).not.toContain('hover:bg-muted/50');
  });

  it('does not use stat-card hover token patterns in session summary cards', async () => {
    const dashboardHtml = renderToStaticMarkup(
      <DashboardView
        stats={{
          totalAnswered: 10,
          accuracyOverall: 0.7,
          scoredOverall: 10,
          unscoredQuestionsOverall: 0,
          answeredLast7Days: 5,
          accuracyLast7Days: 0.8,
          scoredLast7Days: 5,
          unscoredQuestionsLast7Days: 0,
          currentStreakDays: 3,
          recentActivity: [],
        }}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    );
    const summaryHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-07T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 8,
          totals: {
            answered: 8,
            correct: 6,
            accuracy: 0.75,
            durationSeconds: 600,
          },
        }}
        review={null}
        reviewLoadState={{ status: 'idle' }}
      />,
    );

    const dashboardDoc = new DOMParser().parseFromString(
      dashboardHtml,
      'text/html',
    );
    const summaryDoc = new DOMParser().parseFromString(
      summaryHtml,
      'text/html',
    );

    const dashboardHoverCards = Array.from(
      dashboardDoc.querySelectorAll('[data-slot="card"]'),
    ).filter((card) =>
      (card.getAttribute('class') ?? '').includes('hover:bg-muted/50'),
    );
    const summaryHoverCards = Array.from(
      summaryDoc.querySelectorAll('[data-slot="card"]'),
    ).filter((card) =>
      (card.getAttribute('class') ?? '').includes('hover:bg-muted/50'),
    );

    expect(dashboardHoverCards).toHaveLength(0);
    expect(summaryHoverCards).toHaveLength(0);
  });

  it('does not apply non-interactive hover tokens to marketing feature cards', async () => {
    const element = await MarketingHomeShell({
      authNavSlot: <div />,
      primaryCtaSlot: <div />,
    });
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const featureTitles = [
      'High-Yield Explanations',
      'Three Study Modes',
      'Smart Bookmarking',
      'Progress Dashboard',
    ];

    for (const title of featureTitles) {
      const heading = Array.from(doc.querySelectorAll('h3')).find(
        (element) => element.textContent?.trim() === title,
      );
      expect(heading).not.toBeUndefined();
      const featureCard = heading?.closest('[data-slot="card"]');
      expect(featureCard).not.toBeNull();
      const className = featureCard?.getAttribute('class') ?? '';
      expect(className).not.toContain('transition-colors');
      expect(className).not.toContain('hover:bg-muted');
    }
  });

  it('uses the DEBT-313 recessed-surface neutral tokens for ChoiceButton states', async () => {
    const selectedHtml = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Answer A"
        selected
        onClick={() => {}}
      />,
    );
    const unselectedHtml = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="B"
        textMd="Answer B"
        selected={false}
        onClick={() => {}}
      />,
    );

    const selectedDoc = new DOMParser().parseFromString(
      selectedHtml,
      'text/html',
    );
    const selectedTokens = (
      selectedDoc.querySelector('label')?.getAttribute('class') ?? ''
    )
      .split(/\s+/)
      .filter(Boolean);
    const unselectedDoc = new DOMParser().parseFromString(
      unselectedHtml,
      'text/html',
    );
    const unselectedTokens = (
      unselectedDoc.querySelector('label')?.getAttribute('class') ?? ''
    )
      .split(/\s+/)
      .filter(Boolean);

    expect(selectedHtml).not.toContain('border-zinc-400');
    expect(selectedTokens).toContain('border-ring');
    expect(selectedTokens).toContain('bg-foreground/[0.08]');
    expect(selectedTokens).not.toContain('bg-foreground/[0.12]');
    expect(selectedTokens).not.toContain('bg-muted/40');
    expect(unselectedTokens).toContain('border-foreground/50');
    expect(unselectedTokens).toContain('bg-background/50');
    expect(unselectedTokens).not.toContain('bg-foreground/5');
    expect(unselectedTokens).not.toContain('border-border/60');
  });

  it('uses semantic success/destructive tokens in question feedback components', async () => {
    const choiceHtml = renderToStaticMarkup(
      <div>
        <ChoiceButton
          name="choices"
          label="A"
          textMd="Choice A"
          selected
          correctness="correct"
          onClick={() => {}}
        />
        <ChoiceButton
          name="choices"
          label="B"
          textMd="Choice B"
          selected
          correctness="incorrect"
          onClick={() => {}}
        />
      </div>,
    );

    const feedbackHtml = renderToStaticMarkup(
      <div>
        <Feedback isCorrect={true} explanationMd="Correct explanation" />
        <Feedback isCorrect={false} explanationMd="Incorrect explanation" />
      </div>,
    );

    expect(choiceHtml).toContain('border-success');
    expect(choiceHtml).toContain('border-destructive');
    expect(choiceHtml).not.toContain('emerald-');
    expect(choiceHtml).not.toContain('red-');

    expect(feedbackHtml).toContain('bg-success');
    expect(feedbackHtml).toContain('bg-destructive');
    expect(feedbackHtml).not.toContain('emerald-');
    expect(feedbackHtml).not.toContain('red-');
  });

  it('uses the registered post-action footer tokens for question rating footer', async () => {
    const html = renderToStaticMarkup(
      <QuestionRatingFooter
        rating={null}
        feedbackStatus="idle"
        onRate={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const footer = doc.querySelector('[data-testid="question-rating-footer"]');
    const content = doc.querySelector(
      '[data-testid="question-rating-footer-content"]',
    );
    const footerTokens = footer?.getAttribute('class')?.split(/\s+/) ?? [];
    const contentTokens = content?.getAttribute('class')?.split(/\s+/) ?? [];

    expect(footerTokens).toContain('border-t');
    expect(footerTokens).toContain('border-border');
    expect(footerTokens).not.toContain('bg-card');
    expect(footerTokens).not.toContain('bg-muted/20');
    expect(contentTokens).toContain('text-muted-foreground');
    expect(contentTokens).toContain('justify-center');
  });

  it('uses semantic warning tokens in billing cancellation banner', async () => {
    const billingHtml = renderToStaticMarkup(
      <BillingContent
        subscription={{
          id: 'sub_1',
          userId: 'user-1',
          plan: 'annual',
          status: 'active',
          currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          cancelAtPeriodEnd: true,
          startedAt: null,
          billingCycleAnchor: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        }}
        manageBillingAction={async () => undefined}
      />,
    );

    expect(billingHtml).toContain('border-warning');
    expect(billingHtml).toContain('bg-warning');
    expect(billingHtml).not.toContain('amber-');
  });

  it('uses semantic success tokens in pricing savings label', async () => {
    const pricingHtml = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(pricingHtml).toContain('text-success');
    expect(pricingHtml).not.toContain('emerald-');
  });

  it('pins dark muted-foreground to the minimum WCAG-compliant value across DEBT-279 surfaces', () => {
    const darkBlock = extractBlock(GLOBALS_CSS, '.dark');

    expect(extractToken(darkBlock, 'muted-foreground')).toBe('0 0% 55%');

    const background = hslToRgb(
      parseHslToken(extractToken(darkBlock, 'background')),
    );
    const card = hslToRgb(parseHslToken(extractToken(darkBlock, 'card')));
    const muted = hslToRgb(parseHslToken(extractToken(darkBlock, 'muted')));
    const success = hslToRgb(parseHslToken(extractToken(darkBlock, 'success')));
    const warning = hslToRgb(parseHslToken(extractToken(darkBlock, 'warning')));

    const mutedForeground = hslToRgb(
      parseHslToken(extractToken(darkBlock, 'muted-foreground')),
    );
    const belowThreshold = hslToRgb([0, 0, 51.4]);

    const contexts: Array<[number, number, number]> = [
      card,
      muted,
      compositeOver(muted, card, 0.2),
      compositeOver(muted, background, 0.2),
      compositeOver(background, card, 0.5),
      compositeOver(success, card, 0.05),
      background,
      compositeOver(muted, card, 0.5),
      compositeOver(muted, background, 0.5),
      compositeOver(warning, background, 0.1),
    ];

    const minimumWithPinnedToken = Math.min(
      ...contexts.map((context) => contrastRatio(mutedForeground, context)),
    );
    const minimumWithLowerToken = Math.min(
      ...contexts.map((context) => contrastRatio(belowThreshold, context)),
    );

    expect(minimumWithPinnedToken).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(minimumWithLowerToken).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it('uses a dark-mode warning foreground token that passes on warning tints', () => {
    const darkBlock = extractBlock(GLOBALS_CSS, '.dark');
    const warningForeground = extractToken(darkBlock, 'warning-foreground');
    expect(warningForeground).toBe('38 92% 40%');

    const warningForegroundRgb = hslToRgb(parseHslToken(warningForeground));
    const warning = hslToRgb(parseHslToken(extractToken(darkBlock, 'warning')));
    const background = hslToRgb(
      parseHslToken(extractToken(darkBlock, 'background')),
    );

    const warning10Surface = compositeOver(warning, background, 0.1);
    const warning15Surface = compositeOver(warning, background, 0.15);

    expect(
      contrastRatio(warningForegroundRgb, warning10Surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(warningForegroundRgb, warning15Surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});
