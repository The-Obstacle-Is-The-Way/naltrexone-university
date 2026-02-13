import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ROUTES } from '@/lib/routes';
import { ok } from '@/tests/test-helpers/ok';
import QuickPracticeClient from './quick-practice-client';

const {
  pushMock,
  useSearchParamsMock,
  getNextQuestionMock,
  submitAnswerMock,
  getBookmarksMock,
  toggleBookmarkMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
  getNextQuestionMock: vi.fn(),
  submitAnswerMock: vi.fn(),
  getBookmarksMock: vi.fn(),
  toggleBookmarkMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: getBookmarksMock,
  toggleBookmark: toggleBookmarkMock,
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  getNextQuestion: getNextQuestionMock,
  submitAnswer: submitAnswerMock,
}));

afterEach(() => {
  pushMock.mockReset();
  useSearchParamsMock.mockReset();
  getNextQuestionMock.mockReset();
  submitAnswerMock.mockReset();
  getBookmarksMock.mockReset();
  toggleBookmarkMock.mockReset();
});

test('pushes a new status query param without scrolling', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getNextQuestionMock.mockResolvedValue(ok(null));
  getBookmarksMock.mockResolvedValue(ok({ rows: [] }));

  const screen = await render(<QuickPracticeClient />);

  await screen.getByRole('button', { name: 'Incorrect' }).click();

  expect(pushMock).toHaveBeenCalledWith(
    `${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`,
    { scroll: false },
  );
});

test('removes the status query param without scrolling when toggling off', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams('status=incorrect'));
  getNextQuestionMock.mockResolvedValue(ok(null));
  getBookmarksMock.mockResolvedValue(ok({ rows: [] }));

  const screen = await render(<QuickPracticeClient />);

  await screen.getByRole('button', { name: 'Incorrect' }).click();

  expect(pushMock).toHaveBeenCalledWith(ROUTES.APP_PRACTICE_QUICK, {
    scroll: false,
  });
});
