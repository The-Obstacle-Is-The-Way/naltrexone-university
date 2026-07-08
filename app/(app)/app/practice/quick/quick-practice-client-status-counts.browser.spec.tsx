import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  isValidQuestionProgressStatus,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';
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

const countAvailableQuestions = vi.mocked(
  practiceController.countAvailableQuestions,
);
const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
const setBookmark = vi.mocked(bookmarkController.setBookmark);
const getNextQuestion = vi.mocked(questionController.getNextQuestion);
const submitAnswer = vi.mocked(questionController.submitAnswer);

const fixtureQuestionId = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();

function getRequestedStatus(input: unknown): QuestionProgressStatus {
  const statuses =
    typeof input === 'object' && input !== null && 'statuses' in input
      ? (input as { statuses?: readonly unknown[] }).statuses
      : undefined;
  const status = statuses?.[0];
  if (typeof status !== 'string' || !isValidQuestionProgressStatus(status)) {
    throw new Error('Quick practice count request omitted a valid status');
  }
  return status;
}

function setupQuestion() {
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
}

function setupStatusCounts(
  getCounts: () => {
    unanswered: number;
    incorrect: number;
    bookmarked: number;
  },
) {
  countAvailableQuestions.mockImplementation(async (input) => {
    const status = getRequestedStatus(input);
    const counts = getCounts();
    return ok({ count: counts[status] });
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

test('refreshes quick-practice status badges after an answer is committed', async () => {
  let unansweredCount = 12;
  setupQuestion();
  setupStatusCounts(() => ({
    unanswered: unansweredCount,
    incorrect: 3,
    bookmarked: 2,
  }));
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getBookmarks.mockResolvedValue(ok({ rows: [] }));
  submitAnswer.mockImplementation(async () => {
    unansweredCount = 11;
    return ok({
      attemptId: crypto.randomUUID(),
      isCorrect: true,
      correctChoiceId: fixtureChoiceBId,
      explanationMd: null,
      referenceMd: null,
      choiceExplanations: [],
    });
  });

  const screen = await render(<QuickPracticeClient />);

  await expect
    .element(screen.getByRole('button', { name: /^Unanswered \(12\)$/ }))
    .toBeVisible();
  const choiceA = screen.getByRole('radio', { name: 'Choice Alpha' });
  choiceA.element().focus();
  await userEvent.keyboard('{ArrowDown}');
  await screen.getByRole('button', { name: 'Submit' }).click();

  await expect
    .element(screen.getByRole('button', { name: /^Unanswered \(11\)$/ }))
    .toBeVisible();
});

test('refreshes quick-practice status badges after a bookmark is toggled', async () => {
  let bookmarkedCount = 0;
  setupQuestion();
  setupStatusCounts(() => ({
    unanswered: 12,
    incorrect: 3,
    bookmarked: bookmarkedCount,
  }));
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getBookmarks.mockResolvedValue(ok({ rows: [] }));
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
  setBookmark.mockImplementation(async () => {
    bookmarkedCount = 1;
    return ok({ bookmarked: true });
  });

  const screen = await render(<QuickPracticeClient />);

  await expect
    .element(screen.getByRole('button', { name: /^Bookmarked \(0\)$/ }))
    .toBeVisible();
  const choiceA = screen.getByRole('radio', { name: 'Choice Alpha' });
  choiceA.element().focus();
  await userEvent.keyboard('{ArrowDown}');
  await screen.getByRole('button', { name: 'Submit' }).click();
  await screen.getByRole('button', { name: /^Bookmark$/ }).click();

  await expect
    .element(screen.getByRole('button', { name: /^Bookmarked \(1\)$/ }))
    .toBeVisible();
});
