import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { usePracticeSessionStart } from './use-practice-session-start';

const { startPracticeSessionMock, navigateToMock } = vi.hoisted(() => ({
  startPracticeSessionMock: vi.fn(),
  navigateToMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  startPracticeSession: startPracticeSessionMock,
}));

vi.mock('../client-navigation', () => ({
  navigateTo: navigateToMock,
}));

function getIdempotencyKey(input: unknown): string {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected startPracticeSession to receive an input object');
  }

  const key = (input as Record<string, unknown>).idempotencyKey;
  if (typeof key !== 'string') {
    throw new Error('Expected startPracticeSession to receive idempotencyKey');
  }

  return key;
}

function Probe() {
  const output = usePracticeSessionStart({ isMounted: () => true });

  return (
    <>
      <div data-testid="statuses">{output.filters.statuses.join(',')}</div>
      <button
        type="button"
        data-testid="toggle-incorrect"
        onClick={() => output.onToggleStatus('incorrect')}
      >
        Toggle incorrect
      </button>
      <button
        type="button"
        data-testid="start"
        onClick={() => void output.onStartSession()}
      >
        Start
      </button>
    </>
  );
}

afterEach(() => {
  startPracticeSessionMock.mockReset();
  navigateToMock.mockReset();
});

test('rotates the session start idempotency key when toggling status', async () => {
  startPracticeSessionMock.mockResolvedValue({
    ok: true,
    data: { sessionId: 'session_1' },
  });

  const screen = await render(<Probe />);

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSessionMock.mock.calls.length).toBe(1);
  const firstKey = getIdempotencyKey(
    startPracticeSessionMock.mock.calls[0]?.[0],
  );

  await screen.getByTestId('toggle-incorrect').click();
  await expect
    .element(screen.getByTestId('statuses'))
    .toHaveTextContent('incorrect');

  await screen.getByTestId('start').click();
  await expect.poll(() => startPracticeSessionMock.mock.calls.length).toBe(2);
  const secondKey = getIdempotencyKey(
    startPracticeSessionMock.mock.calls[1]?.[0],
  );

  expect(secondKey).not.toBe(firstKey);
});
