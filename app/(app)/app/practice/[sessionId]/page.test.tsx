// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/practice/[sessionId]', () => {
  it('renders a practice session shell', async () => {
    const PracticeSessionPage = (
      await import('@/app/(app)/app/practice/[sessionId]/page')
    ).default;

    const html = renderToStaticMarkup(
      <PracticeSessionPage params={{ sessionId: 'session-1' }} />,
    );

    expect(html).toContain('Practice');
    expect(html).toContain('End session');
    expect(html).toContain('Back to Dashboard');
  }, 10_000);

  it('renders the session summary view', async () => {
    const { SessionSummaryView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

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

  it('renders the session summary branch in PracticeSessionPageView', async () => {
    const { PracticeSessionPageView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionPageView
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
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Session Summary');
  });

  it('renders bookmarkMessage when provided', async () => {
    const { PracticeSessionPageView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={null}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice-1',
              label: 'A',
              textMd: 'Choice',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={null}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        bookmarkMessage="Question bookmarked."
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Question bookmarked.');
  });

  it('isQuestionBookmarked returns true when questionId is in set', async () => {
    const { isQuestionBookmarked } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    expect(
      isQuestionBookmarked(
        {
          questionId: 'q_1',
          slug: 'q-1',
          stemMd: '#',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        new Set(['q_1']),
      ),
    ).toBe(true);

    expect(isQuestionBookmarked(null, new Set(['q_1']))).toBe(false);
  });
});
