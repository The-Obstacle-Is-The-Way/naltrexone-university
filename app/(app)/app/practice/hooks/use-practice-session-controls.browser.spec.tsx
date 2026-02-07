import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { usePracticeSessionControls } from './use-practice-session-controls';

const {
  getTagsMock,
  startPracticeSessionMock,
  endPracticeSessionMock,
  getIncompletePracticeSessionMock,
  getSessionHistoryMock,
  getPracticeSessionReviewMock,
} = vi.hoisted(() => ({
  getTagsMock: vi.fn(),
  startPracticeSessionMock: vi.fn(),
  endPracticeSessionMock: vi.fn(),
  getIncompletePracticeSessionMock: vi.fn(),
  getSessionHistoryMock: vi.fn(),
  getPracticeSessionReviewMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/tag-controller', () => ({
  getTags: getTagsMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  startPracticeSession: startPracticeSessionMock,
  endPracticeSession: endPracticeSessionMock,
  getIncompletePracticeSession: getIncompletePracticeSessionMock,
  getSessionHistory: getSessionHistoryMock,
  getPracticeSessionReview: getPracticeSessionReviewMock,
}));

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function PracticeSessionControlsHookProbe() {
  const output = usePracticeSessionControls();

  return (
    <>
      <div data-testid="tag-load-status">{output.tagLoadStatus}</div>
      <div data-testid="incomplete-load-status">
        {output.incompleteSessionStatus}
      </div>
      <div data-testid="history-load-status">{output.sessionHistoryStatus}</div>
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
    getSessionHistoryMock.mockResolvedValue(
      ok({ rows: [], total: 0, limit: 10, offset: 0 }),
    );

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('incomplete-load-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('history-load-status'))
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
    getSessionHistoryMock.mockResolvedValue(
      ok({ rows: [], total: 0, limit: 10, offset: 0 }),
    );

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
    getSessionHistoryMock.mockResolvedValue(
      ok({ rows: [], total: 0, limit: 10, offset: 0 }),
    );

    const screen = await render(<PracticeSessionControlsHookProbe />);

    await expect
      .element(screen.getByTestId('tag-load-status'))
      .toHaveTextContent('error');
  });
});
