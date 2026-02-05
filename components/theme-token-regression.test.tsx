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

  it('uses semantic CTA classes in get-started and pricing components', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    const { GetStartedCta } = await import('@/components/get-started-cta');
    const ctaHtml = renderToStaticMarkup(await GetStartedCta());

    expect(ctaHtml).toContain('bg-primary');
    expect(ctaHtml).toContain('text-primary-foreground');
    expect(ctaHtml).not.toContain('bg-zinc-100');

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
      />,
    );

    expect(dashboardHtml).toContain('hover:border-border/80');
    expect(dashboardHtml).toContain('hover:bg-muted/50');
    expect(dashboardHtml).not.toContain('hover:border-zinc-700/50');
    expect(dashboardHtml).not.toContain('hover:bg-zinc-900/80');
  });

  it('uses semantic border token for ChoiceButton selected state', async () => {
    const { ChoiceButton } = await import('@/components/question/ChoiceButton');
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
});
