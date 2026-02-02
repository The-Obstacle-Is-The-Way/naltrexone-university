// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/practice/[sessionId]', () => {
  it('renders a practice session shell', async () => {
    const PracticeSessionPage = (await import('./page')).default;

    const html = renderToStaticMarkup(
      <PracticeSessionPage params={{ sessionId: 'session-1' }} />,
    );

    expect(html).toContain('Practice');
    expect(html).toContain('End session');
    expect(html).toContain('Back to Dashboard');
  });
});
