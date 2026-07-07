import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { useExamTimer } from './use-exam-timer';

function TimerProbe(props: {
  initialDeadlineAt: string | null;
  isExamActive?: boolean;
  onExpire: () => boolean | undefined | Promise<boolean | undefined>;
}) {
  const [deadlineAt, setDeadlineAt] = useState(props.initialDeadlineAt);
  const timer = useExamTimer({
    deadlineAt,
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
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useExamTimer', () => {
  it('counts down from the absolute deadline', async () => {
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
      .toHaveTextContent('3');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('2');

    await vi.advanceTimersByTimeAsync(2_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('0');
    await expect
      .element(screen.getByTestId('expired'))
      .toHaveTextContent('true');
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
      .toHaveTextContent('300');

    vi.setSystemTime(new Date('2026-05-22T12:06:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('0');
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

    await expect.element(screen.getByTestId('milestone')).toHaveTextContent('');

    vi.setSystemTime(new Date('2026-05-22T12:00:31.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));

    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('289');
    await expect
      .element(screen.getByTestId('milestone'))
      .toHaveTextContent('5 minutes remaining');

    window.dispatchEvent(new Event('focus'));

    await expect.element(screen.getByTestId('milestone')).toHaveTextContent('');
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
      .toHaveTextContent('20');
    await expect
      .element(screen.getByTestId('milestone'))
      .toHaveTextContent('30 seconds remaining');
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
      .toHaveTextContent('300');
    await expect
      .element(screen.getByTestId('milestone'))
      .toHaveTextContent('5 minutes remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect.element(screen.getByTestId('milestone')).toHaveTextContent('');

    await vi.advanceTimersByTimeAsync(239_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('60');
    await expect
      .element(screen.getByTestId('milestone'))
      .toHaveTextContent('1 minute remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect.element(screen.getByTestId('milestone')).toHaveTextContent('');

    await vi.advanceTimersByTimeAsync(29_000);
    await expect
      .element(screen.getByTestId('remaining'))
      .toHaveTextContent('30');
    await expect
      .element(screen.getByTestId('milestone'))
      .toHaveTextContent('30 seconds remaining');

    await vi.advanceTimersByTimeAsync(1_000);
    await expect.element(screen.getByTestId('milestone')).toHaveTextContent('');
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
      .toHaveTextContent('0');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('returns null and never fires when no exam deadline exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const onExpire = vi.fn();

    const screen = await render(
      <TimerProbe initialDeadlineAt={null} onExpire={onExpire} />,
    );

    await expect.element(screen.getByTestId('remaining')).toHaveTextContent('');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
