import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as reportClientError from '@/lib/report-client-error';
import { err } from '@/src/adapters/controllers/action-result';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import * as tagController from '@/src/adapters/controllers/tag-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
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

  it('retires the preserved start key after the recovery session is abandoned', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111115';
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
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    // The cache-error-and-throw arm: the start committed but its outcome
    // store failed, so the preserved key replays a cached INTERNAL_ERROR.
    startPracticeSession.mockResolvedValue(
      err(
        'INTERNAL_ERROR',
        'Idempotency outcome could not be recorded after committed success',
      ),
    );
    endPracticeSession.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        questionCount: 20,
        endedAt: '2026-07-14T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
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

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    await screen.getByRole('button', { name: 'start-session' }).click();
    await vi.waitFor(() =>
      expect(startPracticeSession).toHaveBeenCalledTimes(2),
    );

    const firstKey = (
      startPracticeSession.mock.calls[0]?.[0] as
        | { idempotencyKey?: unknown }
        | undefined
    )?.idempotencyKey;
    const secondKey = (
      startPracticeSession.mock.calls[1]?.[0] as
        | { idempotencyKey?: unknown }
        | undefined
    )?.idempotencyKey;
    expect(firstKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondKey).toEqual(expect.stringMatching(UUID_PATTERN));
    // Abandoning the recovery session consumed everything the preserved key's
    // outcome referred to; the next start is a new intent and must not replay
    // the stale cached outcome for session A.
    expect(secondKey).not.toBe(firstKey);
  });

  it('reuses one abandon key when a second click races the first request', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111118';
    const summary = ok({
      sessionId,
      mode: 'tutor' as const,
      questionCount: 20,
      endedAt: '2026-07-14T01:00:00.000Z',
      totals: {
        answered: 0,
        correct: 0,
        accuracy: 0,
        durationSeconds: 60,
      },
    });
    const deferred = createDeferred<typeof summary>();

    getTags.mockResolvedValue(ok({ rows: [] }));
    countAvailableQuestions.mockResolvedValue(ok({ count: 20 }));
    getIncompletePracticeSession
      .mockResolvedValueOnce(
        ok({
          sessionId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    endPracticeSession
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValueOnce(summary);

    const screen = await render(<PracticeSessionControlsHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionId);

    // Both clicks target the same session while the first request is still
    // in flight: they must share one key so the second lands on the first's
    // in-progress claim instead of executing a second abandon.
    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(2));
    deferred.resolve(summary);

    const firstKey = (
      endPracticeSession.mock.calls[0]?.[0] as
        | { idempotencyKey?: unknown }
        | undefined
    )?.idempotencyKey;
    const secondKey = (
      endPracticeSession.mock.calls[1]?.[0] as
        | { idempotencyKey?: unknown }
        | undefined
    )?.idempotencyKey;
    expect(firstKey).toEqual(expect.stringMatching(UUID_PATTERN));
    expect(secondKey).toBe(firstKey);
  });

  it('scopes the abandon key to its target session across the recovery flow', async () => {
    const sessionAId = '11111111-1111-4111-8111-111111111116';
    const sessionBId = '11111111-1111-4111-8111-111111111117';
    const summaryFor = (sessionId: string) =>
      ok({
        sessionId,
        mode: 'tutor' as const,
        questionCount: 20,
        endedAt: '2026-07-14T01:00:00.000Z',
        totals: {
          answered: 0,
          correct: 0,
          accuracy: 0,
          durationSeconds: 60,
        },
      });

    getTags.mockResolvedValue(ok({ rows: [] }));
    countAvailableQuestions.mockResolvedValue(ok({ count: 20 }));
    getIncompletePracticeSession
      .mockResolvedValueOnce(
        ok({
          sessionId: sessionAId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        ok({
          sessionId: sessionBId,
          mode: 'tutor',
          answeredCount: 0,
          totalCount: 20,
          startedAt: '2026-07-14T00:30:00.000Z',
        }),
      )
      .mockResolvedValue(ok(null));
    endPracticeSession
      .mockResolvedValueOnce(summaryFor(sessionAId))
      .mockResolvedValueOnce(summaryFor(sessionBId));
    startPracticeSession.mockResolvedValue(err('INTERNAL_ERROR', 'Nope'));

    const screen = await render(<PracticeSessionControlsHookProbe />);
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionAId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(/^$/);

    // A failed start surfaces the next incomplete session (B) on this mount.
    await screen.getByRole('button', { name: 'start-session' }).click();
    await expect
      .element(screen.getByTestId('incomplete-session-id'))
      .toHaveTextContent(sessionBId);

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();
    await vi.waitFor(() => expect(endPracticeSession).toHaveBeenCalledTimes(2));

    const firstCall = endPracticeSession.mock.calls[0]?.[0] as
      | { sessionId?: unknown; idempotencyKey?: unknown }
      | undefined;
    const secondCall = endPracticeSession.mock.calls[1]?.[0] as
      | { sessionId?: unknown; idempotencyKey?: unknown }
      | undefined;
    expect(firstCall?.sessionId).toBe(sessionAId);
    expect(secondCall?.sessionId).toBe(sessionBId);
    // Session A's completed abandon outcome must not be replayed for B: the
    // key is bound to the session it was minted for.
    expect(secondCall?.idempotencyKey).toEqual(
      expect.stringMatching(UUID_PATTERN),
    );
    expect(secondCall?.idempotencyKey).not.toBe(firstCall?.idempotencyKey);
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
