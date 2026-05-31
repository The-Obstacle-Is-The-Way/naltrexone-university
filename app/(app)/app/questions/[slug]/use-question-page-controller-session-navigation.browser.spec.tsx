import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  getPracticeSessionReview,
  getQuestionBySlug,
  getQuestionPageQuestionIdForSlug,
  Probe,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_CHOICE_2_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  QUESTION_PAGE_QUESTION_2_ID,
  reportClientErrorSpy,
  setupQuestionPageControllerBrowserSpec,
} from './use-question-page-controller-test-helpers';

setupQuestionPageControllerBrowserSpec();

describe('useQuestionPageController (browser)', () => {
  it('fetches the session review when sessionId is provided', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_2_ID,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
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
        questionId: QUESTION_PAGE_QUESTION_2_ID,
        slug: 'q-2',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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

  it('does not refetch the session review when slug changes within the same session', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_2_ID,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'easy',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
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
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_2_ID,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'easy',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
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
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
              questionId: QUESTION_PAGE_QUESTION_1_ID,
              slug: 'q-1',
              stemMd: 'Stem',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: QUESTION_PAGE_QUESTION_2_ID,
              slug: 'q-2',
              stemMd: 'Stem 2',
              difficulty: 'easy',
              order: 2,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
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
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
          questionId: QUESTION_PAGE_QUESTION_1_ID,
          slug: 'q-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          order: 1,
          isAnswered: true,
          isCorrect: true,
          isOmitted: false,
          markedForReview: false,
        },
        {
          isAvailable: true,
          questionId: QUESTION_PAGE_QUESTION_2_ID,
          slug: 'q-2',
          stemMd: 'Stem 2',
          difficulty: 'easy',
          order: 2,
          isAnswered: true,
          isCorrect: false,
          isOmitted: false,
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
});
