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
}: {
  slug?: string;
  mode?: 'review' | null;
  sessionId?: string;
  attemptId?: string;
  from?: QuestionOrigin | null;
}) {
  const output = useQuestionPageController({
    slug,
    mode,
    sessionId,
    attemptId,
    from,
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
      <div data-testid="selected-choice">{output.selectedChoiceId ?? ''}</div>
      <div data-testid="attempt-id">{output.submitResult?.attemptId ?? ''}</div>
      <div data-testid="session-nav-total">{total ?? ''}</div>
      <div data-testid="session-nav-index">{index ?? ''}</div>
      <div data-testid="session-nav-prev-slug">{prevSlug ?? ''}</div>
      <div data-testid="session-nav-next-slug">{nextSlug ?? ''}</div>
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
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
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

  it('passes attemptId and sessionId to getPreviousAttempt in review mode when provided', async () => {
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
        attemptId,
        selectedChoiceId: 'choice-2',
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
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
      attemptId,
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
});
