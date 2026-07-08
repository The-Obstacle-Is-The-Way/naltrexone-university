// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ExamTimer: typeof import('./exam-timer').ExamTimer;

beforeAll(async () => {
  ExamTimer = (await import('./exam-timer')).ExamTimer;
});

describe('ExamTimer', () => {
  it('renders compact MM:SS timer text with timer semantics', () => {
    const html = renderToStaticMarkup(
      <ExamTimer
        remainingSeconds={754}
        isExpired={false}
        milestoneAnnouncement={null}
      />,
    );

    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-label="Exam time remaining"');
    expect(html).toContain('Time left');
    expect(html).toContain('12:34');
  });

  it.each([
    ['5 minutes remaining'],
    ['1 minute remaining'],
    ['30 seconds remaining'],
  ])('renders the hook-provided "%s" milestone', (announcement) => {
    const html = renderToStaticMarkup(
      <ExamTimer
        remainingSeconds={289}
        isExpired={false}
        milestoneAnnouncement={announcement}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(announcement);
  });

  it('announces expiry assertively', () => {
    const html = renderToStaticMarkup(
      <ExamTimer
        remainingSeconds={0}
        isExpired={true}
        milestoneAnnouncement={null}
      />,
    );

    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('Time is up. Submitting your exam.');
  });

  it('uses a static warning color without motion classes in the final stretch', () => {
    const html = renderToStaticMarkup(
      <ExamTimer
        remainingSeconds={45}
        isExpired={false}
        milestoneAnnouncement={null}
      />,
    );

    expect(html).toContain('text-destructive');
    expect(html).not.toContain('animate-');
    expect(html).not.toContain('motion-safe');
  });
});
