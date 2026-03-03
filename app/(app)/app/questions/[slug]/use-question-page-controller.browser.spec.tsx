import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { QuestionOrigin } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPageController } from './use-question-page-controller';

const {
  getQuestionBySlugMock,
  getPreviousAttemptMock,
  submitAnswerMock,
  getPracticeSessionReviewMock,
} = vi.hoisted(() => ({
  getQuestionBySlugMock: vi.fn(),
  getPreviousAttemptMock: vi.fn(),
  submitAnswerMock: vi.fn(),
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/question-view-controller', () => ({
  getQuestionBySlug: getQuestionBySlugMock,
  getPreviousAttempt: getPreviousAttemptMock,
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  submitAnswer: submitAnswerMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function Probe({
  slug = 'q-1',
  mode,
  sessionId,
  attemptId,
  from,
  historySequence,
  historyIndex,
}: {
  slug?: string;
  mode?: 'review' | null;
  sessionId?: string;
  attemptId?: string;
  from?: QuestionOrigin | null;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
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

  const total = output.sessionNavigation?.questions.length ?? null;
  const index = output.sessionNavigation?.currentIndex ?? null;
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
      <div data-testid="session-nav-prev-slug">{prevSlug ?? ''}</div>
      <div data-testid="session-nav-next-slug">{nextSlug ?? ''}</div>
      <div data-testid="is-loading-previous-attempt">
        {output.isLoadingPreviousAttempt ? 'true' : 'false'}
      </div>
      <div data-testid="review-hydration-state">
        {output.reviewHydrationState ?? ''}
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
    </>
  );
}

describe('useQuestionPageController (browser)', () => {
  afterEach(() => {
    getQuestionBySlugMock.mockReset();
    getPreviousAttemptMock.mockReset();
    submitAnswerMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
  });

  it('loads previous attempt and pre-populates state in review mode', async () => {
    getQuestionBySlugMock.mockResolvedValue(
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

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        kind: 'attempt',
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

    expect(getPreviousAttemptMock).toHaveBeenCalledWith({
      questionId: 'question-1',
    });
  });

  it('starts in loading-review state and clears it when previous attempt resolves', async () => {
    getQuestionBySlugMock.mockResolvedValue(
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
    getPreviousAttemptMock.mockReturnValue(deferred.promise);

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

  it('normalizes mixed attemptId and sessionId by preferring sessionId in review mode', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000003';
    const sessionId = '00000000-0000-4000-8000-000000000004';

    getQuestionBySlugMock.mockResolvedValue(
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

    getPracticeSessionReviewMock.mockResolvedValue(
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

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        kind: 'attempt',
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

    expect(getPreviousAttemptMock).toHaveBeenCalledWith({
      questionId: 'question-1',
      sessionId,
    });
  });

  it('fetches the session review when sessionId is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

    getQuestionBySlugMock.mockResolvedValue(
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

    getPracticeSessionReviewMock.mockResolvedValue(
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

    expect(getPracticeSessionReviewMock).toHaveBeenCalledWith({ sessionId });

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
    getQuestionBySlugMock.mockResolvedValue(
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

    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
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

  it('does not refetch the session review when slug changes within the same session', async () => {
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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
    getPracticeSessionReviewMock.mockResolvedValue(
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

    await expect
      .poll(() => getPracticeSessionReviewMock.mock.calls.length)
      .toBe(1);
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('0');

    await screen.getByTestId('set-slug-q-2').click();

    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');
    await expect
      .poll(() => getPracticeSessionReviewMock.mock.calls.length)
      .toBe(1);
  });

  it('clears session navigation when sessionId is removed', async () => {
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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
    getPracticeSessionReviewMock.mockResolvedValue(
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
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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

    getPracticeSessionReviewMock
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

    await expect
      .poll(() => getPracticeSessionReviewMock.mock.calls.length)
      .toBe(2);
    expect(getPracticeSessionReviewMock.mock.calls[1]?.[0]).toEqual({
      sessionId: sessionId2,
    });

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent(/^$/);
  });

  it('discards stale session review response when slug changes mid-flight', async () => {
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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

    getPracticeSessionReviewMock
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

    await expect
      .poll(() => getPracticeSessionReviewMock.mock.calls.length)
      .toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect
      .poll(() => getPracticeSessionReviewMock.mock.calls.length)
      .toBe(2);

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

    getQuestionBySlugMock
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

    await expect.poll(() => getQuestionBySlugMock.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect.poll(() => getQuestionBySlugMock.mock.calls.length).toBe(2);

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
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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

    getPreviousAttemptMock
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

    await expect.poll(() => getPreviousAttemptMock.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect.poll(() => getPreviousAttemptMock.mock.calls.length).toBe(2);

    deferredSecond.resolve(
      ok({
        kind: 'attempt',
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
    getQuestionBySlugMock
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
    getPreviousAttemptMock.mockReturnValueOnce(deferredPrevious.promise);

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
    getQuestionBySlugMock.mockImplementation(async (input: unknown) => {
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
    submitAnswerMock.mockReturnValueOnce(deferredSubmit.promise);

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
    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);

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

    getQuestionBySlugMock.mockResolvedValue(
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

    getPracticeSessionReviewMock.mockResolvedValue(
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

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        kind: 'attempt',
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

    submitAnswerMock.mockResolvedValue(
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
      .poll(() => submitAnswerMock.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswerMock.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
      retryOfAttemptId: 'attempt-1',
      retryOrigin: 'session_review',
      retrySessionId: sessionId,
    });
  });

  it('maps kind=session_unanswered to reveal state and clears selected choice/result', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';

    getQuestionBySlugMock.mockResolvedValue(
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

    getPracticeSessionReviewMock.mockResolvedValue(
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

    getPreviousAttemptMock.mockResolvedValue(
      ok({
        kind: 'session_unanswered',
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
    getQuestionBySlugMock.mockResolvedValue(
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

    getPreviousAttemptMock.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Boom' },
    });

    submitAnswerMock.mockResolvedValue(
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
      .poll(() => submitAnswerMock.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswerMock.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
    });
    expect(submitAnswerMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'retryOrigin',
    );
    expect(submitAnswerMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'retryOfAttemptId',
    );
  });
});
