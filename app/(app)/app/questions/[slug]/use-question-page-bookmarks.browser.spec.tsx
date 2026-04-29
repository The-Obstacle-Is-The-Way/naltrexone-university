import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPageBookmarks } from './use-question-page-bookmarks';

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
const toggleBookmark = vi.mocked(bookmarkController.toggleBookmark);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const shouldReportClientErrorSpy = vi.mocked(
  reportClientError.shouldReportClientError,
);

let shouldReportClientErrorActual: typeof reportClientError.shouldReportClientError;

function createQuestion(): GetQuestionBySlugOutput {
  return {
    questionId: 'question-1',
    slug: 'q-1',
    stemMd: 'Stem',
    difficulty: 'easy',
    choices: [{ id: 'choice-1', label: 'A', textMd: 'Choice A' }],
  };
}

const defaultQuestion = createQuestion();

function Probe({
  question = defaultQuestion,
  mode = 'review',
}: {
  question?: GetQuestionBySlugOutput | null;
  mode?: 'review' | null;
}) {
  const output = useQuestionPageBookmarks({
    mode,
    question,
    isMounted: () => true,
  });

  return (
    <>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <div data-testid="is-bookmark-hydrated">
        {output.isBookmarkHydrated ? 'true' : 'false'}
      </div>
      <div data-testid="is-bookmarked">
        {output.isBookmarked ? 'true' : 'false'}
      </div>
      <button
        type="button"
        data-testid="trigger-toggle-bookmark"
        onClick={() => void output.onToggleBookmark()}
      >
        Trigger toggle bookmark
      </button>
    </>
  );
}

describe('useQuestionPageBookmarks (browser)', () => {
  const emptyBookmarksResult: { ok: true; data: GetBookmarksOutput } = ok({
    rows: [],
  });

  beforeAll(async () => {
    shouldReportClientErrorActual = (
      await vi.importActual<typeof import('@/lib/report-client-error')>(
        '@/lib/report-client-error',
      )
    ).shouldReportClientError;
  });

  beforeEach(() => {
    getBookmarks.mockResolvedValue(emptyBookmarksResult);
    toggleBookmark.mockResolvedValue(ok({ bookmarked: false }));
    reportClientErrorSpy.mockImplementation(() => undefined);
    shouldReportClientErrorSpy.mockImplementation(
      shouldReportClientErrorActual,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads bookmark state for the current review question', async () => {
    getBookmarks.mockResolvedValue(
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });

  it('toggles bookmark state for the current review question', async () => {
    toggleBookmark.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('false');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    expect(toggleBookmark).toHaveBeenCalledWith({
      questionId: 'question-1',
      idempotencyKey: expect.any(String),
    });
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });
});
