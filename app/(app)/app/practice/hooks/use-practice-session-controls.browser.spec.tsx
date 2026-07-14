import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import { err } from '@/src/adapters/controllers/action-result';
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
const discardPracticeSession = vi.mocked(
  practiceController.discardPracticeSession,
);
const endPracticeSession = vi.mocked(practiceController.endPracticeSession);
const getIncompletePracticeSession = vi.mocked(
  practiceController.getIncompletePracticeSession,
);
const startPracticeSession = vi.mocked(practiceController.startPracticeSession);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      <div data-testid="incomplete-session-id">
        {output.incompleteSession?.sessionId ?? ''}
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
          void output.onStartSession();
        }}
      >
        start-session
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

  it('passes a generated idempotency key when abandoning an incomplete session', async () => {
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
      idempotencyKey: expect.stringMatching(UUID_PATTERN),
    });
    expect(endPracticeSession.mock.calls[0]?.[0]).not.toMatchObject({
      idempotencyKey: sessionId,
    });
    expect(discardPracticeSession).not.toHaveBeenCalled();
  });

  it('preserves the generated abandon idempotency key across a non-cached failure', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111113';

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
    endPracticeSession
      .mockResolvedValueOnce(err('INTERNAL_ERROR', 'Nope'))
      .mockResolvedValueOnce(
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
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('error');

    const firstCallInput = endPracticeSession.mock.calls[0]?.[0] as
      | { idempotencyKey?: unknown }
      | undefined;
    const firstKey = firstCallInput?.idempotencyKey;
    expect(firstKey).toEqual(expect.stringMatching(UUID_PATTERN));

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();

    const secondCallInput = endPracticeSession.mock.calls[1]?.[0] as
      | { idempotencyKey?: unknown }
      | undefined;
    const secondKey = secondCallInput?.idempotencyKey;
    expect(secondKey).toEqual(expect.stringMatching(UUID_PATTERN));
    // INTERNAL_ERROR aborts the claim server-side, so the same-key retry is
    // the intended re-execution path; rotating would orphan it.
    expect(secondKey).toBe(firstKey);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');
  });

  it('uses discard instead of end when abandoning an incomplete exam session', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111112';

    getTags.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        answeredCount: 0,
        totalCount: 10,
        startedAt: '2026-02-08T00:00:00.000Z',
      }),
    );
    discardPracticeSession.mockResolvedValue(ok({ discarded: true }));
    countAvailableQuestions.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();

    expect(discardPracticeSession).toHaveBeenCalledWith({
      sessionId,
      idempotencyKey: expect.stringMatching(UUID_PATTERN),
    });
    expect(discardPracticeSession.mock.calls[0]?.[0]).not.toMatchObject({
      idempotencyKey: sessionId,
    });
    expect(endPracticeSession).not.toHaveBeenCalled();
  });

  it('refreshes and exposes the resume panel state after a start conflict', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111114';
    getTags.mockResolvedValue(ok({ rows: [] }));
    countAvailableQuestions.mockResolvedValue(ok({ count: 20 }));
    getIncompletePracticeSession
      .mockResolvedValueOnce(ok(null))
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-13T00:00:00.000Z',
        }),
      );
    startPracticeSession.mockResolvedValue(
      err('CONFLICT', 'Incomplete session exists', undefined, {
        reason: 'incomplete_practice_session_exists',
      }),
    );

    const screen = await render(<PracticeSessionControlsHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'start-session' }).click();

    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);
  });
});
