import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as quickPracticeStatusCounts from '@/app/(app)/app/practice/hooks/use-quick-practice-status-counts';
import { ROUTES } from '@/lib/routes';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import * as questionController from '@/src/adapters/controllers/question-controller';
import { ok } from '@/tests/test-helpers/ok';
import QuickPracticeClient from './quick-practice-client';

const { pushMock, useSearchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
}));

vi.hoisted(() => {
  Object.assign(globalThis, { process: { env: { NODE_ENV: 'test' } } });
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/src/adapters/controllers/question-controller', { spy: true });
vi.mock('@/app/(app)/app/practice/hooks/use-quick-practice-status-counts', {
  spy: true,
});

const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
const getNextQuestion = vi.mocked(questionController.getNextQuestion);
const useQuickPracticeStatusCounts = vi.mocked(
  quickPracticeStatusCounts.useQuickPracticeStatusCounts,
);

afterEach(() => {
  vi.resetAllMocks();
});

test('pushes a new status query param without scrolling', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(''));
  getNextQuestion.mockResolvedValue(ok(null));
  getBookmarks.mockResolvedValue(ok({ rows: [] }));
  useQuickPracticeStatusCounts.mockReturnValue({
    unanswered: null,
    incorrect: null,
    bookmarked: null,
  });

  const screen = await render(<QuickPracticeClient />);

  await screen.getByRole('button', { name: 'Incorrect' }).click();

  expect(pushMock).toHaveBeenCalledWith(
    `${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`,
    { scroll: false },
  );
});

test('removes the status query param without scrolling when toggling off', async () => {
  useSearchParamsMock.mockReturnValue(new URLSearchParams('status=incorrect'));
  getNextQuestion.mockResolvedValue(ok(null));
  getBookmarks.mockResolvedValue(ok({ rows: [] }));
  useQuickPracticeStatusCounts.mockReturnValue({
    unanswered: null,
    incorrect: null,
    bookmarked: null,
  });

  const screen = await render(<QuickPracticeClient />);

  await screen.getByRole('button', { name: 'Unanswered' }).click();

  expect(pushMock).toHaveBeenCalledWith(ROUTES.APP_PRACTICE_QUICK, {
    scroll: false,
  });
});
