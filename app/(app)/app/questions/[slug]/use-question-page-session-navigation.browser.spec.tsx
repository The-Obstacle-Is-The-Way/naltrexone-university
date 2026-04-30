import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import type { QuestionOrigin } from '@/lib/routes';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import { useQuestionPageSessionNavigation } from './use-question-page-session-navigation';

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getPracticeSessionReview = vi.mocked(
  practiceController.getPracticeSessionReview,
);

installReportClientErrorMocks(reportClientError);

function Probe({
  slug = 'q-1',
  sessionId,
  from,
  historySequence,
  historyIndex,
}: {
  slug?: string;
  sessionId?: string;
  from?: QuestionOrigin | null;
  historySequence?: readonly string[] | null;
  historyIndex?: number | null;
}) {
  const output = useQuestionPageSessionNavigation({
    slug,
    sessionId,
    from,
    historySequence,
    historyIndex,
    isMounted: () => true,
    startTransition: (fn) => fn(),
  });

  const total = output.sessionNavigation?.questions.length ?? null;
  const index = output.sessionNavigation?.currentIndex ?? null;
  const currentWasRetried =
    index === null
      ? null
      : (output.sessionNavigation?.questions[index]?.wasRetried ?? null);

  return (
    <>
      <div data-testid="session-nav-total">{total ?? ''}</div>
      <div data-testid="session-nav-index">{index ?? ''}</div>
      <div data-testid="session-nav-current-was-retried">
        {currentWasRetried === null ? '' : currentWasRetried ? 'true' : 'false'}
      </div>
      <button
        type="button"
        data-testid="mark-current-retried"
        onClick={output.markCurrentQuestionRetried}
      >
        Mark current retried
      </button>
    </>
  );
}

describe('useQuestionPageSessionNavigation (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('fetches session review and marks the current question as retried', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

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
            difficulty: 'easy',
            order: 2,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const screen = await render(<Probe slug="q-1" sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('session-nav-total'))
      .toHaveTextContent('2');
    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('false');

    await screen.getByTestId('mark-current-retried').click();

    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('true');
  });

  it('reuses cached session questions when slug changes within the same session', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000002';

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
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('0');
    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(1);

    await screen.getByTestId('set-slug-q-2').click();

    await expect
      .element(screen.getByTestId('session-nav-index'))
      .toHaveTextContent('1');
    await expect.poll(() => getPracticeSessionReview.mock.calls.length).toBe(1);
  });
});
