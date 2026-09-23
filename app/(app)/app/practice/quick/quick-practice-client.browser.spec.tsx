import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ROUTES } from '@/lib/routes';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { ok } from '@/tests/test-helpers/ok';
import QuickPracticeClient from './quick-practice-client';

const { pushMock, useSearchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-controller', { spy: true });

const getBookmarkQuestionIds = vi.mocked(
  bookmarkController.getBookmarkQuestionIds,
);
const getNextQuestion = vi.mocked(questionController.getNextQuestion);
const submitAnswer = vi.mocked(questionController.submitAnswer);
const countAvailableQuestions = vi.mocked(
  practiceController.countAvailableQuestions,
);

const fixtureQuestionId = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();

afterEach(() => {
  vi.resetAllMocks();
});

test('pushes a new status query param without scrolling', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getNextQuestion.mockResolvedValue(ok(null));
  getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
  countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

  const screen = await render(<QuickPracticeClient />);

  await screen
    .getByRole('button', { name: 'Incorrect (0)', exact: true })
    .click();

  expect(pushMock).toHaveBeenCalledWith(
    `${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`,
    { scroll: false },
  );
});

test('removes the status query param without scrolling when toggling off', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams('status=incorrect'));
  getNextQuestion.mockResolvedValue(ok(null));
  getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
  countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

  const screen = await render(<QuickPracticeClient />);

  await screen
    .getByRole('button', { name: 'Unanswered (0)', exact: true })
    .click();

  expect(pushMock).toHaveBeenCalledWith(ROUTES.APP_PRACTICE_QUICK, {
    scroll: false,
  });
});

test('submits a keyboard-selected choice from the visible Submit action', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getNextQuestion.mockResolvedValue(
    ok(
      createNextQuestion({
        questionId: fixtureQuestionId,
        choices: [
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
        ],
      }),
    ),
  );
  submitAnswer.mockResolvedValue(
    ok({
      attemptId: crypto.randomUUID(),
      isCorrect: true,
      correctChoiceId: fixtureChoiceBId,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    }),
  );
  getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
  countAvailableQuestions.mockResolvedValue(ok({ count: 1 }));

  const screen = await render(<QuickPracticeClient />);
  const choiceA = screen.getByRole('radio', { name: 'Choice Alpha' });
  choiceA.element().focus();
  await expect.element(choiceA).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');

  await screen.getByRole('button', { name: 'Submit' }).click();

  await expect.poll(() => submitAnswer.mock.calls.length).toBe(1);
  expect(submitAnswer).toHaveBeenCalledWith(
    expect.objectContaining({ choiceId: fixtureChoiceBId }),
  );
  screen.unmount();
});
