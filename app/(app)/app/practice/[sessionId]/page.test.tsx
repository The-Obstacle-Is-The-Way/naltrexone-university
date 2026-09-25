// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const fixtureChoice1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion1Id2 = crypto.randomUUID();
const fixtureQuestion1Id3 = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type PracticeSessionPageModule =
  typeof import('@/app/(app)/app/practice/[sessionId]/page');

let PracticeSessionPage: PracticeSessionPageModule['default'];
let PracticeSessionPageView: PracticeSessionPageModule['PracticeSessionPageView'];
let isQuestionBookmarked: PracticeSessionPageModule['isQuestionBookmarked'];

beforeAll(async () => {
  const module = await import('@/app/(app)/app/practice/[sessionId]/page');
  PracticeSessionPage = module.default;
  PracticeSessionPageView = module.PracticeSessionPageView;
  isQuestionBookmarked = module.isQuestionBookmarked;
});

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
      params: Promise.resolve({ sessionId: fixtureSession1Id }),
    } as never);

    expect(element).toMatchObject({
      props: { sessionId: fixtureSession1Id },
    });
  });

  it('starts searchParams before params resolves', async () => {
    let releaseParams: (() => void) | undefined;
    const params = new Promise<{ sessionId: string }>((resolve) => {
      releaseParams = () => resolve({ sessionId: fixtureSession1Id });
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
        sessionId: fixtureSession1Id,
        toast: 'saved',
      },
    });
  });

  it('renders a practice session shell', async () => {
    const element = await PracticeSessionPage({
      params: Promise.resolve({ sessionId: fixtureSession1Id }),
    } as never);

    const html = renderToStaticMarkup(element);

    expect(html).toContain('Tutor Session');
    expect(html).toContain('End session');
    expect(html).not.toContain('Back to Dashboard');
  });

  it('does not render bookmarkMessage inline when provided', async () => {
    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={null}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoice1Id,
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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'A long stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'A long stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: fixtureQuestion2Id,
              slug: 'q-2',
              stemMd: 'Stem for q2',
              difficulty: 'easy',
              order: 2,
              isAnswered: false,
              isCorrect: null,
              isOmitted: false,
              markedForReview: true,
            },
          ],
        }}
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id3,
          slug: 'question-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoice1Id,
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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
      params: Promise.resolve({ sessionId: fixtureSession1Id }),
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
      params: Promise.resolve({ sessionId: fixtureSession1Id }),
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
      params: Promise.resolve({ sessionId: fixtureSession1Id }),
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
          questionId: fixtureQuestion1Id2,
          slug: 'q-1',
          stemMd: '#',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        new Set([fixtureQuestion1Id2]),
      ),
    ).toBe(true);

    expect(isQuestionBookmarked(null, new Set([fixtureQuestion1Id2]))).toBe(
      false,
    );
  });
});
