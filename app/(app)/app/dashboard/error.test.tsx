// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/(app)/app/dashboard/error', () => {
  it('renders a contextual error boundary', async () => {
    const DashboardError = (await import('./error')).default;

    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <DashboardError error={error} reset={() => {}} />,
    );

    expect(html).toContain('Dashboard');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(html).toContain('focus-visible:ring-[3px]');
  });
});
