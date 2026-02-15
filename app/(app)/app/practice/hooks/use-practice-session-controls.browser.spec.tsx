import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionControls } from './use-practice-session-controls';

const {
  getTagsMock,
  startPracticeSessionMock,
  countAvailableQuestionsMock,
  endPracticeSessionMock,
  getIncompletePracticeSessionMock,
} = vi.hoisted(() => ({
  getTagsMock: vi.fn(),
  startPracticeSessionMock: vi.fn(),
  countAvailableQuestionsMock: vi.fn(),
  endPracticeSessionMock: vi.fn(),
  getIncompletePracticeSessionMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/tag-controller', () => ({
  getTags: getTagsMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  startPracticeSession: startPracticeSessionMock,
  countAvailableQuestions: countAvailableQuestionsMock,
  endPracticeSession: endPracticeSessionMock,
  getIncompletePracticeSession: getIncompletePracticeSessionMock,
}));

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
    vi.restoreAllMocks();
  });

  it('loads control data and applies user selections', async () => {
    getTagsMock.mockResolvedValue(
      ok({
        rows: [
          {
            id: 'tag_1',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
        ],
      }),
    );
    getIncompletePracticeSessionMock.mockResolvedValue(ok(null));
    countAvailableQuestionsMock.mockResolvedValue(ok({ count: 42 }));

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
    getTagsMock.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSessionMock.mockResolvedValue(ok(null));
    countAvailableQuestionsMock.mockResolvedValue(ok({ count: 0 }));

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
    getTagsMock.mockRejectedValue(new Error('Tag service unavailable'));
    getIncompletePracticeSessionMock.mockResolvedValue(ok(null));
    countAvailableQuestionsMock.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('error');
  });

  it('sets available count status to error when countAvailableQuestions throws', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    getTagsMock.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSessionMock.mockResolvedValue(ok(null));
    countAvailableQuestionsMock.mockRejectedValue(
      new Error('Count service unavailable'),
    );

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('available-count-status'))
      .toHaveTextContent('error');
    expect(consoleError).toHaveBeenCalled();
  });

  it('passes session id as idempotency key when abandoning an incomplete session', async () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    getTagsMock.mockResolvedValue(ok({ rows: [] }));
    getIncompletePracticeSessionMock.mockResolvedValue(
      ok({
        sessionId,
        mode: 'tutor',
        answeredCount: 2,
        totalCount: 10,
        startedAt: '2026-02-08T00:00:00.000Z',
      }),
    );
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId,
        endedAt: '2026-02-08T01:00:00.000Z',
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    countAvailableQuestionsMock.mockResolvedValue(ok({ count: 0 }));

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');

    await screen
      .getByRole('button', { name: 'abandon-incomplete-session' })
      .click();

    expect(endPracticeSessionMock).toHaveBeenCalledWith({
      sessionId,
      idempotencyKey: sessionId,
    });
  });
});
