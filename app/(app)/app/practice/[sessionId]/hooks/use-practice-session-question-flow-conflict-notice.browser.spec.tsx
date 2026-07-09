import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import {
  PracticeSessionConflictMessages,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureChoice1Id = crypto.randomUUID();

function DraftSaveConflictNoticeProbe(input: {
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  saveExamDraftAnswerFn: (
    input: unknown,
  ) => Promise<ActionResult<SaveExamDraftAnswerOutput>>;
}) {
  return (
    <NotificationProvider>
      <DraftSaveConflictNoticeContent
        getNextQuestionFn={input.getNextQuestionFn}
        submitAnswerFn={input.submitAnswerFn}
        saveExamDraftAnswerFn={input.saveExamDraftAnswerFn}
      />
    </NotificationProvider>
  );
}

function DraftSaveConflictNoticeContent(input: {
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  saveExamDraftAnswerFn: (
    input: unknown,
  ) => Promise<ActionResult<SaveExamDraftAnswerOutput>>;
}) {
  const [saveRequested, setSaveRequested] = useState(false);
  const flow = usePracticeSessionQuestionFlow({
    sessionId: fixtureSession1Id,
    isMounted: () => true,
    getNextQuestionFn: input.getNextQuestionFn,
    submitAnswerFn: input.submitAnswerFn,
    saveExamDraftAnswerFn: input.saveExamDraftAnswerFn,
  });

  return (
    <>
      <output data-testid="load-state">{flow.loadState.status}</output>
      <output data-testid="selected-choice">
        {flow.selectedChoiceId ?? 'none'}
      </output>
      <button
        type="button"
        onClick={() => flow.onSelectChoice(fixtureChoice1Id, 'pointer')}
      >
        Select choice
      </button>
      <button
        type="button"
        onClick={() => {
          setSaveRequested(true);
          void flow.saveCurrentExamDraft();
        }}
      >
        Save draft
      </button>
      <output data-testid="save-requested">
        {saveRequested ? 'yes' : 'no'}
      </output>
    </>
  );
}

describe('usePracticeSessionQuestionFlow conflict notices', () => {
  it('announces a transient notice when draft save loses a state-write race', async () => {
    const getNextQuestionFn = vi.fn<
      (input: unknown) => Promise<ActionResult<NextQuestion | null>>
    >(async () =>
      ok(
        createNextQuestion({
          questionId: fixtureQuestion1Id,
          choices: [
            {
              id: fixtureChoice1Id,
              label: 'A',
              textMd: 'Choice A',
              sortOrder: 1,
            },
          ],
          session: {
            sessionId: fixtureSession1Id,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 1,
            isMarkedForReview: false,
            draftSelectedChoiceId: null,
            draftCumulativeMs: 0,
          },
        }),
      ),
    );
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();
    const saveExamDraftAnswerFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>
      >()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: PracticeSessionConflictMessages.StateChangedConcurrently,
          details: {
            reason: PracticeSessionConflictReasons.StateChangedConcurrently,
          },
        },
      } as ActionResult<SaveExamDraftAnswerOutput>);

    const screen = await render(
      <DraftSaveConflictNoticeProbe
        getNextQuestionFn={getNextQuestionFn}
        submitAnswerFn={submitAnswerFn}
        saveExamDraftAnswerFn={saveExamDraftAnswerFn}
      />,
    );

    await expect
      .element(screen.getByTestId('load-state'))
      .toHaveTextContent(/^ready$/);
    await screen.getByRole('button', { name: 'Select choice' }).click();
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(fixtureChoice1Id);

    await screen.getByRole('button', { name: 'Save draft' }).click();

    await expect
      .element(screen.getByTestId('save-requested'))
      .toHaveTextContent(/^yes$/);
    await expect
      .element(screen.getByTestId('load-state'))
      .toHaveTextContent(/^ready$/);
    await expect
      .element(screen.getByTestId('app-toast'))
      .toHaveAttribute('role', 'status');
    await expect
      .element(screen.getByTestId('app-toast'))
      .toHaveTextContent(/changed in another tab/i);
  });
});
