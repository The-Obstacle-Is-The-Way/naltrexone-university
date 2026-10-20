import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { useExamTimer } from './use-exam-timer';

function TimerProbe(props: {
  initialDeadlineAt: string | null;
  isExamActive?: boolean;
  onExpire: () => boolean | undefined | Promise<boolean | undefined>;
}) {
  const [deadlineAt, setDeadlineAt] = useState(props.initialDeadlineAt);
  const timer = useExamTimer({
    deadlineAt,
    remainingMs:
      deadlineAt === null
        ? null
        : Math.max(
            0,
            Date.parse(deadlineAt) - Date.parse('2026-05-22T12:00:00.000Z'),
          ),
    readTiming: async () => ({
      deadlineAt,
      remainingMs:
        deadlineAt === null
          ? null
          : Math.max(0, Date.parse(deadlineAt) - Date.now()),
    }),
    isExamActive: props.isExamActive ?? true,
    onExpire: props.onExpire,
  });

  return (
    <>
      <div data-testid="remaining">
        {timer ? String(timer.remainingSeconds) : ''}
      </div>
      <div data-testid="expired">{timer ? String(timer.isExpired) : ''}</div>
      <div data-testid="milestone">
        {timer ? (timer.milestoneAnnouncement ?? '') : ''}
      </div>
      <button
        type="button"
        onClick={() => setDeadlineAt('2026-05-22T11:59:59.000Z')}
      >
        move-deadline-past
      </button>
      <button
        type="button"
        onClick={() => setDeadlineAt('2026-05-22T12:05:21.000Z')}
      >
        move-deadline-future
      </button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useExamTimer', () => {
  it.each([5_000, 20_000, -20_000])(
    'uses server time with a browser clock offset of %i ms',
    async (offsetMs) => {
      vi.useFakeTimers();
      vi.setSystemTime(
        new Date(Date.parse('2026-05-22T12:00:00.000Z') + offsetMs),
      );
      const onExpire = vi.fn();
      function ServerTimer() {
        const timer = useExamTimer({
          deadlineAt: '2026-05-22T12:00:03.000Z',
          remainingMs: 3_000,
          isExamActive: true,
          onExpire,
          readTiming: async () => ({
            deadlineAt: '2026-05-22T12:00:03.000Z',
            remainingMs: 3_000,
          }),
        });
        return (
          <div data-testid="server-remaining">{timer?.remainingSeconds}</div>
        );
      }
      const screen = await render(<ServerTimer />);
      await expect
        .element(screen.getByTestId('server-remaining'))
        .toHaveTextContent('3');
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      await vi.advanceTimersByTimeAsync(1_000);
      await expect
        .element(screen.getByTestId('server-remaining'))
        .toHaveTextContent('2');
      expect(onExpire).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(onExpire).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps a pending expiry retryable across a new sample for the same deadline', async () => {
    vi.useFakeTimers();
    const finalization = createDeferred<boolean>();
    const onExpire = vi
      .fn()
      .mockImplementationOnce(() => finalization.promise)
      .mockResolvedValue(true);
    function Timer() {
      const [remainingMs, setRemainingMs] = useState(1_000);
      useExamTimer({
        deadlineAt: '2026-05-22T12:00:01.000Z',
        remainingMs,
        isExamActive: true,
        onExpire,
        readTiming: async () => null,
      });
      return (
        <button type="button" onClick={() => setRemainingMs(0)}>
          receive-new-sample
        </button>
      );
    }
    const screen = await render(<Timer />);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await screen.getByRole('button', { name: 'receive-new-sample' }).click();
    expect(onExpire).toHaveBeenCalledTimes(1);
    finalization.resolve(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('does not delay expiry while a server timing refresh is pending', async () => {
    vi.useFakeTimers();
    const timing = createDeferred<{
      deadlineAt: string;
      remainingMs: number;
    }>();
    const onExpire = vi.fn().mockResolvedValue(true);
    function Timer() {
      useExamTimer({
        deadlineAt: '2026-05-22T12:00:01.000Z',
        remainingMs: 1_000,
        isExamActive: true,
        onExpire,
        readTiming: () => timing.promise,
      });
      return null;
    }
    const screen = await render(<Timer />);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await screen.unmount();
    timing.resolve({ deadlineAt: '2026-05-22T12:00:01.000Z', remainingMs: 0 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  // The server refused an early finalization (exam_not_expired). A retry
  // waits for a fresh server sample, so ticks do not become a mutation each
  // second against the same countdown.
  it('retries a refused expiry once a fresh server sample arrives', async () => {
    vi.useFakeTimers();
    const timing = createDeferred<{
      deadlineAt: string;
      remainingMs: number;
    }>();
    const reads = [Promise.resolve(null), timing.promise];
    const onExpire = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    function Timer() {
      useExamTimer({
        deadlineAt: '2026-05-22T12:00:01.000Z',
        remainingMs: 1_000,
        isExamActive: true,
        onExpire,
        readTiming: () => reads.shift() ?? Promise.resolve(null),
      });
      return null;
    }
    await render(<Timer />);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    timing.resolve({
      deadlineAt: '2026-05-22T12:00:01.000Z',
      remainingMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('retries a refused expiry after a pause when no fresh sample comes', async () => {
    vi.useFakeTimers();
    const onExpire = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const readTiming = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValue(new Error('Timing read failed'));
    function Timer() {
      useExamTimer({
        deadlineAt: '2026-05-22T12:00:01.000Z',
        remainingMs: 1_000,
        isExamActive: true,
        onExpire,
        readTiming,
      });
      return null;
    }
    await render(<Timer />);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('counts down from the server remaining time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:00:03.000Z"
        onExpire={onExpire}
      />,
    );

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('3');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('2');

    await vi.advanceTimersByTimeAsync(2_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('0');
    await expect
      .element(screen.getByTestId('expired'))
      .toMatchTextContent('true');
    expect(onExpire).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('fires once when returning after the deadline has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:00.000Z"
        onExpire={onExpire}
      />,
    );

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('300');

    vi.setSystemTime(new Date('2026-05-22T12:06:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('0');
    expect(onExpire).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('announces a crossed milestone when the next update skips the exact threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:20.000Z"
        onExpire={onExpire}
      />,
    );

    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);

    vi.setSystemTime(new Date('2026-05-22T12:00:31.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('289');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent('5 minutes remaining');

    // Tab return fires visibilitychange AND window focus back-to-back. The
    // second update must not wipe the announcement before assistive tech can
    // announce it — it only clears once the countdown actually advances.
    window.dispatchEvent(new Event('focus'));

    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^5 minutes remaining$/);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);
  });

  it('announces only the lowest milestone crossed by one long update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:20.000Z"
        onExpire={onExpire}
      />,
    );

    vi.setSystemTime(new Date('2026-05-22T12:05:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('20');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^30 seconds remaining$/);
  });

  it('announces each milestone once during a normal second-by-second countdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:02.000Z"
        onExpire={onExpire}
      />,
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('300');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent('5 minutes remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);

    await vi.advanceTimersByTimeAsync(239_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('60');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent('1 minute remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);

    await vi.advanceTimersByTimeAsync(29_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('30');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent('30 seconds remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);
  });

  it('preserves a milestone crossed during hidden-tab ticks and announces it on return', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:10.000Z"
        onExpire={onExpire}
      />,
    );

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('310');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      // A throttled background tick fires after the 5-minute threshold has
      // passed. It must not consume the crossing while the user cannot hear
      // the announcement.
      vi.setSystemTime(new Date('2026-05-22T12:00:31.000Z'));
      await vi.advanceTimersByTimeAsync(1_000);
      await expect
        .element(screen.getByTestId('milestone'))
        .toMatchTextContent(/^$/);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }

    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent('5 minutes remaining');
  });

  it('resets the milestone baseline when the deadline changes while hidden', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:10.000Z"
        onExpire={onExpire}
      />,
    );

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('310');

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      // The deadline changes while the tab is hidden. The stale 310s baseline
      // from the old deadline must be discarded: against the new deadline
      // (remaining ~290s on return) it would fabricate a 5-minute crossing
      // that never happened.
      vi.setSystemTime(new Date('2026-05-22T12:00:31.000Z'));
      await screen
        .getByRole('button', { name: 'move-deadline-future' })
        .click();
      await vi.advanceTimersByTimeAsync(1_000);
      await expect
        .element(screen.getByTestId('milestone'))
        .toMatchTextContent(/^$/);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }

    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('289');
    await expect
      .element(screen.getByTestId('milestone'))
      .toMatchTextContent(/^$/);
  });

  it('retries an expired deadline when onExpire reports that recovery failed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn().mockReturnValueOnce(false);

    await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:00:01.000Z"
        onExpire={onExpire}
      />,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('retries an expired deadline when onExpire rejects', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi
      .fn()
      .mockRejectedValueOnce(new Error('Finalize failed'));

    await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:00:01.000Z"
        onExpire={onExpire}
      />,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('retries an expired deadline when onExpire throws synchronously', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn(() => {
      throw new Error('Finalize failed');
    });

    await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:00:01.000Z"
        onExpire={onExpire}
      />,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('re-latches when a future deadline is replaced by a past deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe
        initialDeadlineAt="2026-05-22T12:05:00.000Z"
        onExpire={onExpire}
      />,
    );

    await screen.getByRole('button', { name: 'move-deadline-past' }).click();

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent('0');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('returns null and never fires when no exam deadline exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe initialDeadlineAt={null} onExpire={onExpire} />,
    );

    await expect
      .element(screen.getByTestId('remaining'))
      .toMatchTextContent(/^$/);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
