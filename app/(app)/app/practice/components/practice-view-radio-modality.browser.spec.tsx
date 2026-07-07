import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { usePracticeSessionQuestionFlow } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow';
import { usePracticeQuestionAnswerFlow } from '@/app/(app)/app/practice/hooks/use-practice-question-answer-flow';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { PracticeView } from './practice-view';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();

const TEST_FILTERS = {
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
} satisfies PracticeFilters;

const CHOICES = [
  {
    id: fixtureChoiceAId,
    label: 'A',
    textMd: 'Choice Alpha',
    sortOrder: 1,
  },
  {
    id: fixtureChoiceBId,
    label: 'B',
    textMd: 'Choice Bravo',
    sortOrder: 2,
  },
] as const;

function createSubmitOutput(choiceId: string): SubmitAnswerOutput {
  return {
    attemptId: fixtureAttempt1Id,
    isCorrect: true,
    correctChoiceId: choiceId,
    explanationMd: null,
    referenceMd: null,
    choiceExplanations: [],
  };
}

function createQuickQuestion(): NextQuestion {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [...CHOICES],
  });
}

function createSessionQuestion(mode: 'tutor' | 'exam'): NextQuestion {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [...CHOICES],
    session: {
      sessionId: fixtureSession1Id,
      mode,
      deadlineAt: mode === 'exam' ? '2099-05-22T12:02:24.000Z' : null,
      index: 0,
      total: 2,
      isMarkedForReview: false,
    },
  });
}

function createSubmitAnswerFn() {
  return vi
    .fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>()
    .mockImplementation(async (input) => {
      const choiceId =
        typeof input === 'object' &&
        input !== null &&
        'choiceId' in input &&
        typeof input.choiceId === 'string'
          ? input.choiceId
          : fixtureChoiceBId;

      return ok(createSubmitOutput(choiceId));
    });
}

function createQuickQuestionFn() {
  return vi
    .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
    .mockResolvedValue(ok(createQuickQuestion()));
}

function createSessionQuestionFn(mode: 'tutor' | 'exam') {
  return vi
    .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
    .mockResolvedValue(ok(createSessionQuestion(mode)));
}

function createSaveExamDraftAnswerFn() {
  return vi
    .fn<(input: unknown) => Promise<ActionResult<SaveExamDraftAnswerOutput>>>()
    .mockResolvedValue(
      ok({
        questionId: fixtureQuestion1Id,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: '2026-02-01T00:00:00.000Z',
        draftCumulativeMs: 0,
      }),
    );
}

function QuickPracticeRadioHarness({
  getNextQuestionFn,
  submitAnswerFn,
}: {
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
}) {
  const output = usePracticeQuestionAnswerFlow({
    filters: TEST_FILTERS,
    isMounted: () => true,
    getNextQuestionFn,
    submitAnswerFn,
  });

  return (
    <PracticeView
      title="Quick Practice"
      loadState={output.loadState}
      question={output.question}
      selectedChoiceId={output.selectedChoiceId}
      isAnswered={output.isAnswered}
      submitResult={output.submitResult}
      isPending={output.isPending}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={output.canSubmit}
      onSubmit={() => {
        void output.onSubmit();
      }}
      onTryAgain={output.onTryAgain}
      onToggleBookmark={() => undefined}
      onSelectChoice={output.onSelectChoice}
      onNextQuestion={output.onNextQuestion}
    />
  );
}

function SessionRadioHarness({
  mode,
  getNextQuestionFn,
  submitAnswerFn,
  saveExamDraftAnswerFn,
}: {
  mode: 'tutor' | 'exam';
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  saveExamDraftAnswerFn: (
    input: unknown,
  ) => Promise<ActionResult<SaveExamDraftAnswerOutput>>;
}) {
  const output = usePracticeSessionQuestionFlow({
    sessionId: fixtureSession1Id,
    isMounted: () => true,
    getNextQuestionFn,
    submitAnswerFn,
    saveExamDraftAnswerFn,
  });

  return (
    <PracticeView
      title={mode === 'exam' ? 'Exam Session' : 'Tutor Session'}
      sessionInfo={output.sessionInfo}
      loadState={output.loadState}
      question={output.question}
      selectedChoiceId={output.selectedChoiceId}
      isAnswered={output.isAnswered}
      submitResult={output.submitResult}
      isPending={output.isPending}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={output.canSubmit}
      onSubmit={() => {
        void output.onSubmit();
      }}
      onTryAgain={output.onTryAgain}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={output.onSelectChoice}
      onNextQuestion={output.onNextQuestion}
      hasNextQuestion
    />
  );
}

async function focusFirstRadioAndArrowDown(
  screen: Awaited<ReturnType<typeof render>>,
) {
  const choiceA = screen.getByRole('radio', { name: 'Choice Alpha' });
  choiceA.element().focus();
  await expect.element(choiceA).toHaveFocus();

  await userEvent.keyboard('{ArrowDown}');

  await expect
    .element(screen.getByRole('radio', { name: 'Choice Bravo' }))
    .toBeChecked();
}

async function flushBrowserTasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function findSubmitButton(): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Submit',
    ) ?? null
  );
}

test('does not commit when ArrowDown browses Quick Practice radios', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();

  await focusFirstRadioAndArrowDown(screen);
  await flushBrowserTasks();

  expect(submitAnswerFn).not.toHaveBeenCalled();
  expect(findSubmitButton()).not.toBeNull();
});

test('does not commit when ArrowDown browses Tutor radios', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <SessionRadioHarness
      mode="tutor"
      getNextQuestionFn={createSessionQuestionFn('tutor')}
      submitAnswerFn={submitAnswerFn}
      saveExamDraftAnswerFn={createSaveExamDraftAnswerFn()}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();

  await focusFirstRadioAndArrowDown(screen);
  await flushBrowserTasks();

  expect(submitAnswerFn).not.toHaveBeenCalled();
  expect(findSubmitButton()).not.toBeNull();
});

test('commits an arrow-browsed Quick Practice choice exactly once with Submit', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();
  await focusFirstRadioAndArrowDown(screen);

  const submitButton = findSubmitButton();
  expect(submitButton).not.toBeNull();
  submitButton?.click();

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  expect(submitAnswerFn).toHaveBeenCalledWith(
    expect.objectContaining({ choiceId: fixtureChoiceBId }),
  );
});

test('commits an arrow-browsed Tutor choice exactly once with Enter', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <SessionRadioHarness
      mode="tutor"
      getNextQuestionFn={createSessionQuestionFn('tutor')}
      submitAnswerFn={submitAnswerFn}
      saveExamDraftAnswerFn={createSaveExamDraftAnswerFn()}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();
  await focusFirstRadioAndArrowDown(screen);

  await userEvent.keyboard('{Enter}');

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  expect(submitAnswerFn).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      choiceId: fixtureChoiceBId,
    }),
  );
});

test('commits a pointer radio click exactly once when click input and change fire', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  const choiceB = screen.getByRole('radio', { name: 'Choice Bravo' });
  const events: string[] = [];
  const element = choiceB.element();
  for (const eventName of ['click', 'input', 'change']) {
    element.addEventListener(eventName, () => events.push(eventName));
  }

  await choiceB.click();

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  expect(events).toEqual(['click', 'input', 'change']);
  expect(submitAnswerFn).toHaveBeenCalledWith(
    expect.objectContaining({ choiceId: fixtureChoiceBId }),
  );
});

test('keeps a held pointer activation armed until the radio change consumes it', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  const choiceB = screen.getByRole('radio', { name: 'Choice Bravo' });
  const choiceBElement = choiceB.element();
  if (!(choiceBElement instanceof HTMLElement)) {
    throw new Error('Expected Choice Bravo radio to be an HTMLElement');
  }

  choiceBElement.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
    }),
  );
  await flushBrowserTasks();
  choiceBElement.click();

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  expect(submitAnswerFn).toHaveBeenCalledWith(
    expect.objectContaining({ choiceId: fixtureChoiceBId }),
  );
});

test('commits a pointer click that enters through the visible label wrapper', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  await expect.element(screen.getByText('Choice Bravo')).toBeVisible();

  await screen.getByText('Choice Bravo').click();

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  expect(submitAnswerFn).toHaveBeenCalledWith(
    expect.objectContaining({ choiceId: fixtureChoiceBId }),
  );
});

test('programmatic radio click selects but does not commit and exposes Submit', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  const choiceB = screen.getByRole('radio', { name: 'Choice Bravo' });

  const choiceBElement = choiceB.element();
  if (!(choiceBElement instanceof HTMLElement)) {
    throw new Error('Expected Choice Bravo radio to be an HTMLElement');
  }

  choiceBElement.click();
  await flushBrowserTasks();

  await expect.element(choiceB).toBeChecked();
  expect(submitAnswerFn).not.toHaveBeenCalled();
  expect(findSubmitButton()).not.toBeNull();
});

test('Space on an arrow-browsed choice keeps the selection uncommitted', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();
  await focusFirstRadioAndArrowDown(screen);

  await userEvent.keyboard(' ');
  await flushBrowserTasks();

  await expect
    .element(screen.getByRole('radio', { name: 'Choice Bravo' }))
    .toBeChecked();
  expect(submitAnswerFn).not.toHaveBeenCalled();
  expect(findSubmitButton()).not.toBeNull();
});

test('Submit affordance disappears after committing the selected-uncommitted choice', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <QuickPracticeRadioHarness
      getNextQuestionFn={createQuickQuestionFn()}
      submitAnswerFn={submitAnswerFn}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();
  await focusFirstRadioAndArrowDown(screen);
  expect(findSubmitButton()).not.toBeNull();

  findSubmitButton()?.click();

  await expect.poll(() => submitAnswerFn.mock.calls.length).toBe(1);
  await expect.poll(() => findSubmitButton()).toBeNull();
});

test('Exam ArrowDown still updates the draft selection without immediate grading', async () => {
  const submitAnswerFn = createSubmitAnswerFn();
  const screen = await render(
    <SessionRadioHarness
      mode="exam"
      getNextQuestionFn={createSessionQuestionFn('exam')}
      submitAnswerFn={submitAnswerFn}
      saveExamDraftAnswerFn={createSaveExamDraftAnswerFn()}
    />,
  );
  await expect
    .element(screen.getByRole('radio', { name: 'Choice Alpha' }))
    .toBeVisible();

  await focusFirstRadioAndArrowDown(screen);

  await expect
    .element(screen.getByRole('radio', { name: 'Choice Bravo' }))
    .toBeChecked();
  expect(submitAnswerFn).not.toHaveBeenCalled();
  expect(findSubmitButton()).toBeNull();
});
