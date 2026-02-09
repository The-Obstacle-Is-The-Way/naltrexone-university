// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/practice/quick', () => {
  it('renders a quick practice shell', async () => {
    const QuickPracticePage = (
      await import('@/app/(app)/app/practice/quick/page')
    ).default;

    const html = renderToStaticMarkup(<QuickPracticePage />);
    expect(html).toContain('Quick Practice');
    expect(html).toContain('Back to Practice');
  }, 20_000);
});
