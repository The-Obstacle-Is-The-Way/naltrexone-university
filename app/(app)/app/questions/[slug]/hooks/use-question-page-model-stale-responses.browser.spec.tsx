import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  getPreviousAttempt,
  getQuestionBySlug,
  getQuestionPageQuestionIdForSlug,
  Probe,
  QUESTION_PAGE_ATTEMPT_1_ID,
  QUESTION_PAGE_ATTEMPT_2_ID,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_CHOICE_2_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  QUESTION_PAGE_QUESTION_2_ID,
  setupQuestionPageModelBrowserSpec,
  submitAnswer,
} from './use-question-page-model-test-helpers';

setupQuestionPageModelBrowserSpec();

describe('useQuestionPageModel (browser)', () => {
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
        questionId: QUESTION_PAGE_QUESTION_2_ID,
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');

    deferredFirst.resolve(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
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
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: `Stem ${slug}`,
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
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
          isOmitted: boolean;
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
          isOmitted: boolean;
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
        attemptId: QUESTION_PAGE_ATTEMPT_2_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because q2',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(QUESTION_PAGE_ATTEMPT_2_ID);
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(QUESTION_PAGE_CHOICE_1_ID);

    deferredFirst.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        isOmitted: false,
        isCorrect: false,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because q1',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferredFirst.promise;
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(QUESTION_PAGE_ATTEMPT_2_ID);
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(QUESTION_PAGE_CHOICE_1_ID);
  });

  it('clears previous-attempt loading when stale hydration is invalidated by a failed question reload', async () => {
    getQuestionBySlug
      .mockResolvedValueOnce(
        ok({
          questionId: QUESTION_PAGE_QUESTION_1_ID,
          slug: 'q-1',
          stemMd: 'Stem 1',
          difficulty: 'easy',
          choices: [
            { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          ],
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
          isOmitted: boolean;
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
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
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
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: `Stem ${slug}`,
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
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
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
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
});
