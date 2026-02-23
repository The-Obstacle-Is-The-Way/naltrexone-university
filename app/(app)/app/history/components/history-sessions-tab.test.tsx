// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

let HistorySessionsTab: typeof import('./history-sessions-tab').HistorySessionsTab;
let SessionSummaryContent: ComponentType<{
  mode: 'tutor' | 'exam';
  fractionLabel: string;
  accuracyLabel: string;
  durationLabel: string;
  endedOn: string;
}>;

beforeAll(async () => {
  const module = await import('./history-sessions-tab');
  HistorySessionsTab = module.HistorySessionsTab;
  SessionSummaryContent =
    module.SessionSummaryContent as typeof SessionSummaryContent;
});

type SessionHistoryResult = ActionResult<GetSessionHistoryOutput>;

describe('HistorySessionsTab', () => {
  it('renders SessionSummaryContent with mode, score, duration, and date', () => {
    const html = renderToStaticMarkup(
      <SessionSummaryContent
        mode="exam"
        fractionLabel="8/10"
        accuracyLabel="80%"
        durationLabel="20m"
        endedOn="Feb 7, 2026"
      />,
    );

    expect(html).toContain('Exam');
    expect(html).toContain('8/10 correct (80%)');
    expect(html).toContain('20m');
    expect(html).toContain('Feb 7, 2026');
  });

  it('renders session rows with expected summary fields', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: 'q-1',
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('Exam');
    expect(html).toContain('8/10 correct (80%)');
    expect(html).toContain('20m');
    expect(html).toContain('Feb 7, 2026');
    expect(html).toContain('View breakdown');
  });

  it('renders showing-count context and mode filter controls', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: 'q-1',
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 3,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('Showing 1–1 of 3 sessions');
    expect(html).toContain('mode=tutor');
    expect(html).toContain('mode=exam');
  });

  it('renders the session summary as a primary review link when a first question exists', () => {
    const row = {
      sessionId: 'session-1',
      mode: 'exam' as const,
      questionCount: 10,
      answered: 10,
      correct: 8,
      accuracy: 0.8,
      durationSeconds: 1200,
      startedAt: '2026-02-07T00:00:00.000Z',
      endedAt: '2026-02-07T00:20:00.000Z',
      firstQuestionSlug: 'q-1',
    };
    const result = {
      ok: true as const,
      data: {
        rows: [row],
        total: 1,
        limit: 20,
        offset: 0,
      },
    } satisfies SessionHistoryResult;

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const reviewLink = Array.from(doc.querySelectorAll('a')).find((link) =>
      link.textContent?.includes('8/10 correct (80%)'),
    );

    expect(reviewLink?.getAttribute('href')).toContain('/app/questions/q-1');
    expect(reviewLink?.getAttribute('href')).toContain('mode=review');
    expect(reviewLink?.getAttribute('href')).toContain('sessionId=session-1');
    expect(html).toContain('data-session-summary-content="true"');
  });

  it('renders clickable row affordances when session review is available', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: 'q-1',
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('cursor-pointer');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('hover:bg-accent');
  });

  it('does not render clickable row affordances when session review is unavailable', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: null,
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).not.toContain('cursor-pointer');
    expect(html).not.toContain('tabindex="0"');
  });

  it('uses SessionSummaryContent for non-link session summaries', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: null,
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    expect(html).toContain('data-session-summary-content="true"');
  });

  it('shows exam zero-answered accuracy as 0%', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-exam',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: 'q-exam',
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 1200,
            startedAt: '2026-02-07T00:00:00.000Z',
            endedAt: '2026-02-07T00:20:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('0/10 correct (0%)');
  });

  it('shows tutor zero-answered accuracy as 0%', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-tutor',
            mode: 'tutor',
            questionCount: 10,
            firstQuestionSlug: 'q-tutor',
            answered: 0,
            correct: 0,
            accuracy: 0,
            durationSeconds: 180,
            startedAt: '2026-02-08T00:00:00.000Z',
            endedAt: '2026-02-08T00:03:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('0/10 correct (0%)');
  });

  it('caps displayed durations over 120 minutes', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-long',
            mode: 'exam',
            questionCount: 10,
            firstQuestionSlug: 'q-long',
            answered: 10,
            correct: 8,
            accuracy: 0.8,
            durationSeconds: 7_230,
            startedAt: '2026-02-08T00:00:00.000Z',
            endedAt: '2026-02-08T02:00:30.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.body.textContent).toContain('>120m');
    expect(doc.body.textContent).not.toContain('120m 30s');
  });

  it('renders empty state when there are no completed sessions', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [],
        total: 0,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('No completed sessions yet.');
    expect(html).toContain('href="/app/practice"');
  });

  it('renders an error card when result is not ok', () => {
    const result: ActionResult<never> = {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to load sessions.',
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);

    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Unable to load sessions.');
  });
});
