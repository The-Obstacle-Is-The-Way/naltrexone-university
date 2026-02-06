// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/practice/[sessionId]', () => {
  it('unwraps async params before rendering the client page', async () => {
    const PracticeSessionPage = (
      await import('@/app/(app)/app/practice/[sessionId]/page')
    ).default;

    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
    } as never);

    expect(element).toMatchObject({
      props: { sessionId: 'session-1' },
    });
  }, 20_000);

  it('renders a practice session shell', async () => {
    const PracticeSessionPage = (
      await import('@/app/(app)/app/practice/[sessionId]/page')
    ).default;

    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
    } as never);

    const html = renderToStaticMarkup(element);

    expect(html).toContain('Practice');
    expect(html).toContain('End session');
    expect(html).toContain('Back to Dashboard');
  }, 20_000);

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
    expect(html).toContain('Question breakdown');
    expect(html).toContain('Start another session');
  });

  it('renders per-question breakdown on session summary when review rows are provided', async () => {
    const { SessionSummaryView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
            {
              isAvailable: false,
              questionId: 'q2',
              order: 2,
              isAnswered: false,
              isCorrect: null,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).toContain('Question breakdown');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('[Question no longer available]');
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

  it('renders exam review stage in PracticeSessionPageView', async () => {
    const { PracticeSessionPageView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={null}
        review={{
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              stemMd: 'A long stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: true,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        isMarkingForReview={false}
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onOpenReviewQuestion={() => undefined}
        onFinalizeReview={() => undefined}
      />,
    );

    expect(html).toContain('Review Questions');
    expect(html).toContain('Submit exam');
    expect(html).toContain('Marked for review');
  });

  it('renders in-run question navigator in PracticeSessionPageView', async () => {
    const { PracticeSessionPageView } = await import(
      '@/app/(app)/app/practice/[sessionId]/page'
    );

    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={null}
        review={null}
        reviewLoadState={{ status: 'idle' }}
        navigator={{
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: 'q2',
              stemMd: 'Stem for q2',
              difficulty: 'easy',
              order: 2,
              isAnswered: false,
              isCorrect: null,
              markedForReview: true,
            },
          ],
        }}
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'q1',
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
        isMarkingForReview={false}
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onNavigateQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Question navigator');
    expect(html).toContain('Question 1: Correct');
    expect(html).toContain('Question 2: Unanswered');
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
