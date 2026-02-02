// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  it('renders subscribe actions when user is not subscribed', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
  });

  it('shows an error banner when checkout=error', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'error',
          message: 'Checkout failed. Please try again.',
        }}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Checkout failed. Please try again.');
  });

  it('shows a cancel banner when checkout=cancel', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'info',
          message: 'Checkout canceled.',
        }}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Checkout canceled.');
  });

  it('hides subscribe actions when user is already subscribed', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('already subscribed');
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });
});
