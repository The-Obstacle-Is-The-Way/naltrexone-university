// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { HistorySessionsTab } from './history-sessions-tab';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type SessionHistoryResult = ActionResult<{
  rows: Array<{
    sessionId: string;
    mode: 'exam' | 'tutor';
    questionCount: number;
    answered: number;
    correct: number;
    accuracy: number;
    durationSeconds: number;
    startedAt: string;
    endedAt: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}>;

describe('HistorySessionsTab', () => {
  it('renders session rows with expected summary fields', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
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

  it('renders — for session accuracy when answered is 0', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: 'session-1',
            mode: 'exam',
            questionCount: 10,
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

    expect(html).toContain('0/10 correct (—)');
  });

  it('renders empty state when there are no completed sessions', () => {
    const result: ActionResult<{
      rows: [];
      total: 0;
      limit: 20;
      offset: 0;
    }> = {
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
