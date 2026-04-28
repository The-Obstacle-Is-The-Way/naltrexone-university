import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import type { QuestionOrigin } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import * as questionViewController from '@/src/adapters/controllers/question-view-controller';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPageController } from './use-question-page-controller';

vi.hoisted(() => {
  Object.assign(globalThis, { process: { env: { NODE_ENV: 'test' } } });
});

vi.mock('@/src/adapters/controllers/question-view-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getQuestionBySlug = vi.mocked(questionViewController.getQuestionBySlug);
const getPreviousAttempt = vi.mocked(questionViewController.getPreviousAttempt);
const submitAnswer = vi.mocked(questionController.submitAnswer);
const getPracticeSessionReview = vi.mocked(
  practiceController.getPracticeSessionReview,
);
const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
const toggleBookmark = vi.mocked(bookmarkController.toggleBookmark);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const shouldReportClientErrorSpy = vi.mocked(
  reportClientError.shouldReportClientError,
);

function shouldReportInternalErrorsOnly(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'INTERNAL_ERROR'
  );
}

function Probe({
  slug = 'q-1',
  mode,
  sessionId,
  attemptId,
  from,
  historySequence,
  historyIndex,
  onRender,
}: {
  slug?: string;
  mode?: 'review' | null;
  sessionId?: string;
  attemptId?: string;
  from?: QuestionOrigin | null;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
  onRender?: (snapshot: {
    mode?: 'review' | null;
    isLoadingPreviousAttempt: boolean;
    reviewHydrationState: string | null;
  }) => void;
}) {
  const output = useQuestionPageController({
    slug,
    mode,
    sessionId,
    attemptId,
    from,
    historySequence,
    historyIndex,
  });

  onRender?.({
    mode,
    isLoadingPreviousAttempt: output.isLoadingPreviousAttempt,
    reviewHydrationState: output.reviewHydrationState,
  });

  const total = output.sessionNavigation?.questions.length ?? null;
  const index = output.sessionNavigation?.currentIndex ?? null;
  const currentWasRetried =
    index === null
      ? null
      : (output.sessionNavigation?.questions[index]?.wasRetried ?? null);
  const prevSlug =
    index === null || index <= 0
      ? null
      : (output.sessionNavigation?.questions[index - 1]?.slug ?? null);
  const nextSlug =
    index === null
      ? null
      : (output.sessionNavigation?.questions[index + 1]?.slug ?? null);

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-slug">{output.question?.slug ?? ''}</div>
      <div data-testid="selected-choice">{output.selectedChoiceId ?? ''}</div>
      <div data-testid="attempt-id">{output.submitResult?.attemptId ?? ''}</div>
      <div data-testid="unanswered-reveal-correct-choice">
        {output.sessionUnansweredReveal?.correctChoiceId ?? ''}
      </div>
      <div data-testid="session-nav-total">{total ?? ''}</div>
      <div data-testid="session-nav-index">{index ?? ''}</div>
      <div data-testid="session-nav-current-was-retried">
        {currentWasRetried === null ? '' : currentWasRetried ? 'true' : 'false'}
      </div>
      <div data-testid="session-nav-prev-slug">{prevSlug ?? ''}</div>
      <div data-testid="session-nav-next-slug">{nextSlug ?? ''}</div>
      <div data-testid="is-loading-previous-attempt">
        {output.isLoadingPreviousAttempt ? 'true' : 'false'}
      </div>
      <div data-testid="review-hydration-state">
        {output.reviewHydrationState ?? ''}
      </div>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <div data-testid="is-bookmark-hydrated">
        {output.isBookmarkHydrated ? 'true' : 'false'}
      </div>
      <div data-testid="is-bookmarked">
        {output.isBookmarked ? 'true' : 'false'}
      </div>
      <button
        type="button"
        data-testid="select-choice-1"
        onClick={() => output.onSelectChoice('choice-1')}
      >
        Select choice 1
      </button>
      <button
        type="button"
        data-testid="trigger-reattempt"
        onClick={output.onReattempt}
      >
        Trigger reattempt
      </button>
      <button
        type="button"
        data-testid="trigger-submit"
        onClick={() => void output.onSubmit()}
      >
        Trigger submit
      </button>
      <button
        type="button"
        data-testid="trigger-answer-as-new"
        onClick={output.onAnswerAsNew}
      >
        Trigger answer as new
      </button>
      <button
        type="button"
        data-testid="trigger-toggle-bookmark"
        onClick={() => void output.onToggleBookmark()}
      >
        Trigger toggle bookmark
      </button>
    </>
  );
}

describe('useQuestionPageController (browser)', () => {
  const emptyBookmarksResult: { ok: true; data: GetBookmarksOutput } = ok({
    rows: [],
  });

  beforeEach(() => {
    getBookmarks.mockResolvedValue(emptyBookmarksResult);
    toggleBookmark.mockResolvedValue(ok({ bookmarked: false }));
    reportClientErrorSpy.mockImplementation(() => undefined);
    shouldReportClientErrorSpy.mockImplementation(
      shouldReportInternalErrorsOnly,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads previous attempt and pre-populates state in review mode', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-1');

    expect(getPreviousAttempt).toHaveBeenCalledWith({
      questionId: 'question-1',
    });
  });

  it('starts in loading-review state and clears it when previous attempt resolves', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    const deferred =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    getPreviousAttempt.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('true');

    deferred.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
  });

  it('shows review loading state on the first render after mode changes to review', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    const deferred =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    getPreviousAttempt.mockReturnValue(deferred.promise);

    const reviewSnapshots: Array<{
      mode?: 'review' | null;
      isLoadingPreviousAttempt: boolean;
      reviewHydrationState: string | null;
    }> = [];

    function Wrapper() {
      const [mode, setMode] = useState<'review' | null>(null);

      return (
        <>
          <Probe
            mode={mode}
            onRender={(snapshot) => {
              if (snapshot.mode === 'review') {
                reviewSnapshots.push(snapshot);
              }
            }}
          />
          <button
            type="button"
            data-testid="set-review-mode"
            onClick={() => setMode('review')}
          >
            Set review mode
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent(/^$/);

    await screen.getByTestId('set-review-mode').click();

    expect(reviewSnapshots[0]).toEqual({
      mode: 'review',
      isLoadingPreviousAttempt: true,
      reviewHydrationState: 'no_prior_attempt',
    });

    deferred.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;
  });

  it('normalizes mixed attemptId and sessionId by preferring sessionId in review mode', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000003';
    const sessionId = '00000000-0000-4000-8000-000000000004';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId,
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(
      <Probe mode="review" attemptId={attemptId} sessionId={sessionId} />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPreviousAttempt).toHaveBeenCalledWith({
      questionId: 'question-1',
      sessionId,
    });
  });

  it('fetches the session review when sessionId is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: 'question-2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const screen = await render(<Probe sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPracticeSessionReview).toHaveBeenCalledWith({ sessionId });

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent('2');
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('0');
    await expect
      .element(screen.getByTestId('session-nav-prev-slug'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('session-nav-next-slug'))
      .toHaveTextContent('q-2');
  });

  it('builds navigation from history sequence when sessionId is absent', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-2',
        slug: 'q-2',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    const screen = await render(
      <Probe
        slug="q-2"
        mode="review"
        from="history"
        historySequence={['q-1', 'q-2']}
        historyIndex={1}
      />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPracticeSessionReview).not.toHaveBeenCalled();
    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent('2');
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');
    await expect
      .element(screen.getByTestId('session-nav-prev-slug'))
      .toHaveTextContent('q-1');
    await expect
      .element(screen.getByTestId('session-nav-next-slug'))
      .toHaveTextContent(/^$/);
  });

  it('loads bookmark state for the current review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    getBookmarks.mockResolvedValue(
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    expect(getBookmarks).toHaveBeenCalledWith({});
  });

  it('keeps bookmark state unhydrated until the bookmark lookup resolves', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    const deferred = createDeferred<ActionResult<GetBookmarksOutput>>();
    getBookmarks.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('loading');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('false');

    deferred.resolve(
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await deferred.promise;

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });

  it('toggles bookmark state for the current review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    toggleBookmark.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('false');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    expect(toggleBookmark).toHaveBeenCalledWith({
      questionId: 'question-1',
      idempotencyKey: expect.any(String),
    });
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });

  it('reports saving state while a bookmark toggle is in flight', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
    toggleBookmark.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('saving');

    deferred.resolve(ok({ bookmarked: true }));
    await deferred.promise;

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
  });

  it('uses a different bookmark idempotency key after moving to a different review question following a failed toggle', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      });
    });
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    toggleBookmark
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      })
      .mockResolvedValueOnce(ok({ bookmarked: true }));

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} mode="review" />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-1');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    const firstInput = toggleBookmark.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('error');

    await screen.getByTestId('set-slug-q-2').click();
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(2);
    const secondInput = toggleBookmark.mock.calls[1]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    expect(firstInput.questionId).toBe('question-q-1');
    expect(secondInput.questionId).toBe('question-q-2');
    expect(secondInput.idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });

  it('does not refetch the session review when slug changes within the same session', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      });
    });

    const sessionId = '00000000-0000-4000-8000-000000000009';
    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-q-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: 'question-q-2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'easy',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} sessionId={sessionId} />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('0');

    await screen.getByTestId('set-slug-q-2').click();

    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');
    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(1);
  });

  it('clears session navigation when sessionId is removed', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      });
    });

    const sessionId = '00000000-0000-4000-8000-000000000005';
    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-q-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: 'question-q-2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'easy',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    function Wrapper() {
      const [activeSessionId, setActiveSessionId] = useState<
        string | undefined
      >(sessionId);

      return (
        <>
          <Probe sessionId={activeSessionId} />
          <button
            type="button"
            data-testid="clear-session"
            onClick={() => setActiveSessionId(undefined)}
          >
            Clear session
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent('2');

    await screen.getByTestId('clear-session').click();

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent(/^$/);
  });

  it('clears session navigation when session review fails', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      });
    });

    const sessionId1 = '00000000-0000-4000-8000-000000000007';
    const sessionId2 = '00000000-0000-4000-8000-000000000008';

    getPracticeSessionReview
      .mockResolvedValueOnce(
        ok({
          sessionId: sessionId1,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: 'question-q-1',
              slug: 'q-1',
              stemMd: 'Stem',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: 'question-q-2',
              slug: 'q-2',
              stemMd: 'Stem 2',
              difficulty: 'easy',
              order: 2,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      });

    function Wrapper() {
      const [activeSessionId, setActiveSessionId] = useState(sessionId1);

      return (
        <>
          <Probe sessionId={activeSessionId} />
          <button
            type="button"
            data-testid="set-session-2"
            onClick={() => setActiveSessionId(sessionId2)}
          >
            Set session 2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent('2');

    await screen.getByTestId('set-session-2').click();

    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(2);
    expect(getPracticeSessionReview.mock.calls[1]?.[0]).toEqual({
      sessionId: sessionId2,
    });

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent(/^$/);
    expect(reportClientErrorSpy).toHaveBeenCalledWith(
      { code: 'INTERNAL_ERROR', message: 'Boom' },
      {
        component: 'UseQuestionPageController',
        action: 'loadSessionNavigation',
      },
    );
  });

  it('discards stale session review response when slug changes mid-flight', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      });
    });

    const sessionId = '00000000-0000-4000-8000-000000000006';
    const reviewOutputNew: GetPracticeSessionReviewOutput = {
      sessionId,
      mode: 'exam',
      totalCount: 2,
      answeredCount: 2,
      markedCount: 0,
      rows: [
        {
          isAvailable: true,
          questionId: 'question-q-1',
          slug: 'q-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          order: 1,
          isAnswered: true,
          isCorrect: true,
          markedForReview: false,
        },
        {
          isAvailable: true,
          questionId: 'question-q-2',
          slug: 'q-2',
          stemMd: 'Stem 2',
          difficulty: 'easy',
          order: 2,
          isAnswered: true,
          isCorrect: false,
          markedForReview: false,
        },
      ],
    };

    const reviewOutputStale: GetPracticeSessionReviewOutput = {
      ...reviewOutputNew,
      rows: [...reviewOutputNew.rows].reverse(),
    };

    const deferred1 =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();
    const deferred2 =
      createDeferred<ActionResult<GetPracticeSessionReviewOutput>>();

    getPracticeSessionReview
      .mockReturnValueOnce(deferred1.promise)
      .mockReturnValueOnce(deferred2.promise);

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} sessionId={sessionId} />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(2);

    // Resolve the second request first (newer)
    deferred2.resolve(ok(reviewOutputNew));
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');

    // Resolve the first request (stale)
    deferred1.resolve(ok(reviewOutputStale));
    await deferred1.promise;
    await Promise.resolve();

    // Still shows q-2 index, not stale q-1 index
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');
  });

  it('discards stale question load response when slug changes mid-flight', async () => {
    const deferredFirst =
      createDeferred<
        ActionResult<{
          questionId: string;
          slug: string;
          stemMd: string;
          difficulty: 'easy';
          choices: Array<{ id: string; label: string; textMd: string }>;
        }>
      >();
    const deferredSecond =
      createDeferred<
        ActionResult<{
          questionId: string;
          slug: string;
          stemMd: string;
          difficulty: 'easy';
          choices: Array<{ id: string; label: string; textMd: string }>;
        }>
      >();

    getQuestionBySlug
      .mockReturnValueOnce(deferredFirst.promise)
      .mockReturnValueOnce(deferredSecond.promise);

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect.poll(() => getQuestionBySlug.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect.poll(() => getQuestionBySlug.mock.calls.length).toBe(2);

    deferredSecond.resolve(
      ok({
        questionId: 'question-q-2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');

    deferredFirst.resolve(
      ok({
        questionId: 'question-q-1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      }),
    );
    await deferredFirst.promise;
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');
  });

  it('discards stale previous-attempt hydration when slug changes mid-flight', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: `Stem ${slug}`,
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      });
    });

    const deferredFirst =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    const deferredSecond =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();

    getPreviousAttempt
      .mockReturnValueOnce(deferredFirst.promise)
      .mockReturnValueOnce(deferredSecond.promise);

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} mode="review" />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect.poll(() => getPreviousAttempt.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect.poll(() => getPreviousAttempt.mock.calls.length).toBe(2);

    deferredSecond.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-q2',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because q2',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-q2');
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-1');

    deferredFirst.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-q1-stale',
        selectedChoiceId: 'choice-2',
        isCorrect: false,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because q1',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferredFirst.promise;
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-q2');
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-1');
  });

  it('clears previous-attempt loading when stale hydration is invalidated by a failed question reload', async () => {
    getQuestionBySlug
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-q-1',
          slug: 'q-1',
          stemMd: 'Stem 1',
          difficulty: 'easy',
          choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Question load failed' },
      });

    const deferredPrevious =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    getPreviousAttempt.mockReturnValueOnce(deferredPrevious.promise);

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} mode="review" />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('true');

    await screen.getByTestId('set-slug-q-2').click();
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');

    deferredPrevious.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-q1-stale',
        selectedChoiceId: 'choice-1',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because q1',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferredPrevious.promise;

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
  });

  it('discards stale submit response when slug changes mid-flight', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: `question-${slug}`,
        slug,
        stemMd: `Stem ${slug}`,
        difficulty: 'easy',
        choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
      });
    });

    const deferredSubmit =
      createDeferred<
        ActionResult<{
          attemptId: string;
          isCorrect: boolean;
          correctChoiceId: string | null;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
        }>
      >();
    submitAnswer.mockReturnValueOnce(deferredSubmit.promise);

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByTestId('select-choice-1').click();
    await screen.getByTestId('trigger-submit').click();
    await expect.poll(() => submitAnswer.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);

    deferredSubmit.resolve(
      ok({
        attemptId: 'attempt-q1-stale',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because q1',
        referenceMd: null,
        choiceExplanations: [],
      }),
    );
    await deferredSubmit.promise;
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);
  });

  it('supports inline retry in session review and submits standalone provenance payload', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000010';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    submitAnswer.mockResolvedValue(
      ok({
        attemptId: 'attempt-2',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-1');
    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('false');

    await screen.getByTestId('trigger-reattempt').click();
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);

    await screen.getByTestId('select-choice-1').click();
    await screen.getByTestId('trigger-submit').click();

    await expect
      .poll(() => submitAnswer.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswer.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
      retryOfAttemptId: 'attempt-1',
      retryOrigin: 'session_review',
      retrySessionId: sessionId,
    });
    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('true');
  });

  it('maps kind=session_unanswered to reveal state and clears selected choice/result', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'session_unanswered',
        sessionMode: null,
        correctChoiceId: 'choice-2',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('unanswered-reveal-correct-choice'))
      .toHaveTextContent('choice-2');
  });

  it('requires explicit answer-as-new action after hydration error before submitting', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Boom' },
    });

    submitAnswer.mockResolvedValue(
      ok({
        attemptId: 'attempt-3',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" from="history" />);

    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('hydration_error');

    await screen.getByTestId('trigger-answer-as-new').click();
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('no_prior_attempt');

    await screen.getByTestId('select-choice-1').click();
    await screen.getByTestId('trigger-submit').click();

    await expect
      .poll(() => submitAnswer.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswer.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
    });
    expect(submitAnswer.mock.calls[0]?.[0]).not.toHaveProperty('retryOrigin');
    expect(submitAnswer.mock.calls[0]?.[0]).not.toHaveProperty(
      'retryOfAttemptId',
    );
  });
});
