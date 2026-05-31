import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
import { ok } from '@/tests/test-helpers/ok';
import { installReportClientErrorMocks } from '@/tests/test-helpers/report-client-error-mocks';
import { usePracticeSessionControls } from './use-practice-session-controls';

const fixtureTag1Id = crypto.randomUUID();

vi.mock('@/src/adapters/controllers/tag-controller', { spy: true });
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getTags = vi.mocked(tagController.getTags);
const countAvailableQuestions = vi.mocked(
  practiceController.countAvailableQuestions,
);
const endPracticeSession = vi.mocked(practiceController.endPracticeSession);
const getIncompletePracticeSession = vi.mocked(
  practiceController.getIncompletePracticeSession,
);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);

installReportClientErrorMocks(reportClientError);

function PracticeSessionControlsHookProbe() {
  const output = usePracticeSessionControls();

  return (
    <>
      <div data-testid="available-count-status">
        {output.availableCountStatus}
      </div>
      <div data-testid="available-count">{output.availableCount ?? ''}</div>
      <div data-testid="tag-load-status">{output.tagLoadStatus}</div>
      <div data-testid="incomplete-load-status">
        {output.incompleteSessionStatus}
      </div>
      <div data-testid="available-tags">{output.availableTags.length}</div>
      <div data-testid="session-mode">{output.sessionMode}</div>
      <div data-testid="selected-tags">{output.filters.tagSlugs.join(',')}</div>
      <button type="button" onClick={() => output.onSessionModeChange('exam')}>
        set-mode-exam
      </button>
      <button
        type="button"
        onClick={() => output.onSessionModeChange('invalid-mode')}
      >
        set-mode-invalid
      </button>
      <button type="button" onClick={() => output.onToggleTag('opioids')}>
        toggle-tag-opioids
      </button>
      <button
        type="button"
        onClick={() => {
          void output.onAbandonIncompleteSession();
        }}
      >
        abandon-incomplete-session
      </button>
    </>
  );
}

describe('usePracticeSessionControls (browser)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads control data and applies user selections', async () => {
    getTags.mockResolvedValue(
      ok({
        rows: [
          {
            id: fixtureTag1Id,
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
        ],
      }),
    );
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    countAvailableQuestions.mockResolvedValue(ok({ count: 42 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('available-count-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('available-count'))
      .toHaveTextContent('42');
    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('available-tags'))
      .toHaveTextContent('1');

    await screen.getByRole('button', { name: 'set-mode-exam' }).click();
    await expect
      .element(screen.getByTestId('session-mode'))
      .toHaveTextContent('exam');

    await screen.getByRole('button', { name: 'toggle-tag-opioids' }).click();
    await expect
      .element(screen.getByTestId('selected-tags'))
      .toHaveTextContent('opioids');
  });

  it('ignores unsupported session mode changes', async () => {
    getTags.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('idle');
    await screen.getByRole('button', { name: 'set-mode-invalid' }).click();
    await expect
      .element(screen.getByTestId('session-mode'))
      .toHaveTextContent('tutor');
  });

  it('sets tag load status to error when getTags throws', async () => {
    const error = new Error('Tag service unavailable');

    getTags.mockRejectedValue(error);
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('error');
    expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
      component: 'UsePracticeSessionTags',
      action: 'loadTags',
    });
  });

  it('sets available count status to error when countAvailableQuestions throws', async () => {
    const error = new Error('Count service unavailable');

    getTags.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSession.mockResolvedValue(ok(null));
    countAvailableQuestions.mockRejectedValue(error);

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('available-count-status'))
      .toHaveTextContent('error');
    expect(reportClientErrorSpy).toHaveBeenCalledWith(error, {
      component: 'UsePracticeAvailableQuestionsCount',
      action: 'loadAvailableCount',
    });
  });

  it('passes session id as idempotency key when abandoning an incomplete session', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    getTags.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        answeredCount: 2,
        totalCount: 10,
        startedAt: '2026-02-08T00:00:00.000Z',
      }),
    );
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 10,
        endedAt: '2026-02-08T01:00:00.000Z',
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();

    expect(endPracticeSession).toHaveBeenCalledWith({
      sessionId,
      idempotencyKey: sessionId,
    });
  });
});
