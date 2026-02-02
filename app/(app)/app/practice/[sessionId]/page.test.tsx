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

  it('renders the session summary view', async () => {
    const { SessionSummaryView } = await import('./page');

    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: {
            answered: 10,
            correct: 7,
            accuracy: 0.7,
            durationSeconds: 123,
          },
        }}
      />,
    );

    expect(html).toContain('Session Summary');
    expect(html).toContain('Answered');
    expect(html).toContain('10');
    expect(html).toContain('Correct');
    expect(html).toContain('7');
    expect(html).toContain('Accuracy');
    expect(html).toContain('70%');
    expect(html).toContain('Duration');
    expect(html).toContain('123s');
    expect(html).toContain('Start another session');
  });
});
