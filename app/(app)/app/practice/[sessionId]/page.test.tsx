// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type PracticeSessionPageModule =
  typeof import('@/app/(app)/app/practice/[sessionId]/page');

let PracticeSessionPage: PracticeSessionPageModule['default'];
let SessionSummaryView: PracticeSessionPageModule['SessionSummaryView'];
let PracticeSessionPageView: PracticeSessionPageModule['PracticeSessionPageView'];
let isQuestionBookmarked: PracticeSessionPageModule['isQuestionBookmarked'];

beforeAll(async () => {
  const module = await import('@/app/(app)/app/practice/[sessionId]/page');
  PracticeSessionPage = module.default;
  SessionSummaryView = module.SessionSummaryView;
  PracticeSessionPageView = module.PracticeSessionPageView;
  isQuestionBookmarked = module.isQuestionBookmarked;
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function createTrackedThenable<T>(value: T) {
  const thenSpy = vi.fn();
  const thenFn = <TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ) => {
    thenSpy();
    return Promise.resolve(value).then(onFulfilled, onRejected);
  };

  const proxy = new Proxy(
    {},
    {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return thenFn;
        }

        return Reflect.get(target, prop, receiver);
      },
    },
  );

  return {
    thenable: proxy as PromiseLike<T>,
    thenSpy,
  };
}

describe('app/(app)/app/practice/[sessionId]', () => {
  it('unwraps async params before rendering the client page', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
    } as never);

    expect(element).toMatchObject({
      props: { sessionId: 'session-1' },
    });
  });

  it('starts searchParams before params resolves', async () => {
    let releaseParams: (() => void) | undefined;
    const params = new Promise<{ sessionId: string }>((resolve) => {
      releaseParams = () => resolve({ sessionId: 'session-1' });
    });
    const { thenable: searchParams, thenSpy } = createTrackedThenable({
      toast: 'saved',
    });

    const pagePromise = PracticeSessionPage({
      params,
      searchParams: searchParams as unknown as Promise<
        Record<string, string | string[] | undefined>
      >,
    });

    await Promise.resolve();

    expect(thenSpy).toHaveBeenCalledTimes(1);

    releaseParams?.();

    const element = await pagePromise;

    expect(element).toMatchObject({
      props: {
        sessionId: 'session-1',
        toast: 'saved',
      },
    });
  });

  it('renders a practice session shell', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
    } as never);

    const html = renderToStaticMarkup(element);

    expect(html).toContain('Tutor Session');
    expect(html).toContain('End session');
    expect(html).not.toContain('Back to Dashboard');
  });

  it('renders the session summary view', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 10,
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
    expect(html).toContain('2m 3s');
    expect(html).toContain('Question breakdown');
    expect(html).toContain('View in History');
    expect(html).toContain('href="/app/history"');
    expect(html).toContain('Back to Practice');
    expect(html).toContain(`href="${ROUTES.APP_PRACTICE}"`);
    expect(html).not.toContain('Back to Dashboard');
    expect(html).not.toContain('Start another session');
  });

  it('renders per-question breakdown on session summary when review rows are provided', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
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
              slug: 'q-1',
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
    expect(html).toContain(
      'href="/app/questions/q-1?from=summary&amp;mode=review&amp;sessionId=session-1"',
    );
    expect(html).toContain('[Question no longer available]');
  });

  it('renders exam follow-up CTAs without the removed practice-missed shortcut', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
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
              isAvailable: false,
              questionId: 'q0',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 2,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionLinks = Array.from(doc.querySelectorAll('a')).filter((link) => {
      const text = link.textContent?.trim();
      return (
        text === 'Review your answers' ||
        text === 'Back to Practice' ||
        text === 'View in History' ||
        text === 'Back to Dashboard' ||
        text === 'Start another session'
      );
    });

    expect(actionLinks.map((link) => link.textContent?.trim())).toEqual([
      'Review your answers',
      'Back to Practice',
      'View in History',
    ]);
    expect(html).toContain('Review your answers');
    expect(html).toContain(
      'href="/app/questions/q-1?from=summary&amp;mode=review&amp;sessionId=session-1"',
    );
    expect(html).not.toContain('Practice missed questions');
    expect(html).not.toContain('href="/app/practice/quick?status=incorrect"');
  });

  it('does not render a Review your answers CTA for tutor summaries', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: 'session-1',
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).not.toContain('Review your answers');
  });

  it('does not render a Review your answers CTA while summary review is unavailable', async () => {
    const loadingHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'loading' }}
      />,
    );

    expect(loadingHtml).not.toContain('Review your answers');
  });

  it('does not render a Review your answers CTA when no reviewable slug exists', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
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
              isAvailable: false,
              questionId: 'q1',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
            {
              isAvailable: false,
              questionId: 'q2',
              order: 2,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).not.toContain('Review your answers');
  });

  it('uses a primary Back to Practice CTA when no reviewable slug exists', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
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
              isAvailable: false,
              questionId: 'q1',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backToPracticeLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Back to Practice',
    );
    const tokens = getClassTokens(
      backToPracticeLink?.getAttribute('class') ?? '',
    );

    expect(tokens.has('bg-primary')).toBe(true);
    expect(tokens.has('border')).toBe(false);
  });

  it('announces summary breakdown loading with live semantics', async () => {
    const loadingHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'loading' }}
      />,
    );

    expect(loadingHtml).toContain('Loading question breakdown…');
    expect(loadingHtml).toContain('aria-live="polite"');
  });

  it('announces summary breakdown errors with alert semantics', async () => {
    const errorHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'error', message: 'Review failed' }}
      />,
    );

    expect(errorHtml).toContain('Review failed');
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).not.toContain('Review your answers');
  });

  it('renders the session summary branch in PracticeSessionPageView', async () => {
    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={{
          sessionId: 'session-1',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 10,
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
        isAnswered={false}
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

  it('does not render bookmarkMessage inline when provided', async () => {
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
        isAnswered={false}
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

    expect(html).not.toContain('Question bookmarked.');
  });

  it('renders exam review stage in PracticeSessionPageView', async () => {
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
              slug: 'q-1',
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
        isAnswered={false}
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
        onFinalizeReview={async () => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('h1')?.textContent).toBe('Review & Submit');
    expect(html).toContain('Submit exam');
    expect(html).toContain('Marked for review');
  });

  it('renders exam review submit pending label when isPending=true', async () => {
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
              slug: 'q-1',
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
        isAnswered={false}
        submitResult={null}
        isPending={true}
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
        onFinalizeReview={async () => undefined}
      />,
    );

    expect(html).toContain('Submitting…');
    expect(html).not.toContain('Submit exam');
  });

  it('announces review loading state before exam review is available', async () => {
    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={null}
        review={null}
        reviewLoadState={{ status: 'loading' }}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
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
      />,
    );

    expect(html).toContain('Loading review...');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders in-run question navigator in PracticeSessionPageView', async () => {
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
              slug: 'q-1',
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
              slug: 'q-2',
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
        isAnswered={false}
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
    expect(html).toContain('Question 1: Current, Answered');
    expect(html).toContain('Question 2: Marked for review, Unanswered');
  });

  it('normalizes array-valued toast param to first element', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
      searchParams: Promise.resolve({
        toast: ['session_started', 'ignored'],
      }),
    } as never);

    expect(element).toMatchObject({
      props: { toast: 'session_started' },
    });
  });

  it('normalizes array-valued requestedCount and actualCount params', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
      searchParams: Promise.resolve({
        toast: ['session_started'],
        requestedCount: ['20', '10'],
        actualCount: ['15', '5'],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        toast: 'session_started',
        requestedCount: '20',
        actualCount: '15',
      },
    });
  });

  it('passes scalar toast params unchanged', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
      searchParams: Promise.resolve({
        toast: 'session_started',
        requestedCount: '20',
        actualCount: '15',
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        toast: 'session_started',
        requestedCount: '20',
        actualCount: '15',
      },
    });
  });

  it('isQuestionBookmarked returns true when questionId is in set', async () => {
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
