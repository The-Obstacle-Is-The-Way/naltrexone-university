// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = snapshotProcessEnv();

describe('theme token regression', () => {
  beforeEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses semantic CTA classes in GetStartedCta', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    const { GetStartedCta } = await import('@/components/get-started-cta');
    const ctaHtml = renderToStaticMarkup(await GetStartedCta());

    expect(ctaHtml).toContain('bg-primary');
    expect(ctaHtml).toContain('text-primary-foreground');
    expect(ctaHtml).not.toContain('bg-zinc-100');
  });

  it('uses semantic border tokens in PricingView', async () => {
    const { PricingView } = await import('@/app/pricing/pricing-view');
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

  it('uses semantic hover tokens for dashboard stat cards', async () => {
    const { DashboardView } = await import('@/app/(app)/app/dashboard/page');
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

    expect(dashboardHtml).toContain('hover:border-border');
    expect(dashboardHtml).not.toContain('hover:border-border/80');
    expect(dashboardHtml).toContain('hover:bg-muted/50');
    expect(dashboardHtml).not.toContain('hover:border-zinc-700/50');
    expect(dashboardHtml).not.toContain('hover:bg-zinc-900/80');
  });

  it('uses the same hover token pattern in session summary stat cards', async () => {
    const { DashboardView } = await import('@/app/(app)/app/dashboard/page');
    const { SessionSummaryView } = await import(
      '@/app/(app)/app/practice/[sessionId]/components/session-summary-view'
    );

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

    expect(dashboardHoverCards.length).toBeGreaterThan(0);
    expect(summaryHoverCards.length).toBeGreaterThan(0);

    for (const card of [...dashboardHoverCards, ...summaryHoverCards]) {
      expect(card.getAttribute('class') ?? '').toContain(
        'hover:border-border/80',
      );
    }
  });

  it('uses semantic border token for ChoiceButton selected state', async () => {
    const { ChoiceButton } = await import(
      '@/components/question/choice-button'
    );
    const html = renderToStaticMarkup(
      <ChoiceButton
        name="choices"
        label="A"
        textMd="Answer A"
        selected
        onClick={() => {}}
      />,
    );

    expect(html).not.toContain('border-zinc-400');
    expect(html).toContain('border-ring');
  });

  it('uses semantic success/destructive tokens in question feedback components', async () => {
    const { ChoiceButton } = await import(
      '@/components/question/choice-button'
    );
    const { Feedback } = await import('@/components/question/feedback');

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

    expect(feedbackHtml).toContain('border-success');
    expect(feedbackHtml).toContain('border-destructive');
    expect(feedbackHtml).not.toContain('emerald-');
    expect(feedbackHtml).not.toContain('red-');
  });

  it('uses semantic warning tokens in billing cancellation banner', async () => {
    const { BillingContent } = await import('@/app/(app)/app/billing/page');

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
    const { PricingView } = await import('@/app/pricing/pricing-view');

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
