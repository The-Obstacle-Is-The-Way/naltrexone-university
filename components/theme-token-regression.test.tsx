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
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = snapshotProcessEnv();

let GetStartedCta: typeof import('@/components/get-started-cta').GetStartedCta;
let PricingView: typeof import('@/app/pricing/pricing-view').PricingView;
let DashboardView: typeof import('@/app/(app)/app/dashboard/page').DashboardView;
let SessionSummaryView: typeof import('@/app/(app)/app/practice/[sessionId]/components/session-summary-view').SessionSummaryView;
let MarketingHomeShell: typeof import('@/components/marketing/marketing-home').MarketingHomeShell;
let ChoiceButton: typeof import('@/components/question/choice-button').ChoiceButton;
let Feedback: typeof import('@/components/question/feedback').Feedback;
let BillingContent: typeof import('@/app/(app)/app/billing/page').BillingContent;

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
    ({ BillingContent } = await import('@/app/(app)/app/billing/page'));
  });

  beforeEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
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
          answeredLast7Days: 5,
          accuracyLast7Days: 0.8,
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
          answeredLast7Days: 5,
          accuracyLast7Days: 0.8,
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
    const html = renderToStaticMarkup(
      <MarketingHomeShell authNav={<div />} primaryCta={<div />} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const featureTitles = [
      'High-Yield Explanations',
      'Tutor + Exam Modes',
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

  it('uses semantic border tokens for ChoiceButton selected and unselected states', async () => {
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
    expect(selectedTokens).toContain('bg-muted/40');
    expect(unselectedTokens).toContain('border-border/60');
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

    expect(feedbackHtml).toContain('bg-success/15');
    expect(feedbackHtml).toContain('bg-destructive/15');
    expect(feedbackHtml).not.toContain('emerald-');
    expect(feedbackHtml).not.toContain('red-');
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
});
