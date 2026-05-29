// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncLoadStateWithIdle } from '@/app/(app)/app/shared/load-state';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  GetPracticeSessionReviewOutput,
  GetSessionHistoryOutput,
} from '@/src/adapters/controllers/practice-controller';

const {
  fixtureQuestion1Id,
  fixtureSession1Id,
  fixtureSessionExamId,
  fixtureSessionLongId,
  fixtureSessionTutorId,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
  fixtureSessionExamId: crypto.randomUUID(),
  fixtureSessionLongId: crypto.randomUUID(),
  fixtureSessionTutorId: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type MockUseHistorySessionsState = {
  selectedSessionId: string | null;
  selectedReview: GetPracticeSessionReviewOutput | null;
  reviewLoadState: AsyncLoadStateWithIdle;
  onOpenSession: (sessionId: string) => Promise<void>;
};

let mockUseHistorySessionsState: MockUseHistorySessionsState;

function createMockUseHistorySessionsState(
  overrides: Partial<MockUseHistorySessionsState> = {},
): MockUseHistorySessionsState {
  return {
    selectedSessionId: null,
    selectedReview: null,
    reviewLoadState: { status: 'idle' },
    onOpenSession: async () => undefined,
    ...overrides,
  };
}

vi.mock('../hooks/use-history-sessions', () => ({
  useHistorySessions: () => mockUseHistorySessionsState,
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

beforeEach(() => {
  mockUseHistorySessionsState = createMockUseHistorySessionsState();
});

type SessionHistoryResult = ActionResult<GetSessionHistoryOutput>;
type SessionHistoryRow = GetSessionHistoryOutput['rows'][number];

function makeSessionHistoryRow(
  overrides: Partial<SessionHistoryRow> = {},
): SessionHistoryRow {
  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    questionCount: 10,
    firstQuestionSlug: 'q-1',
    answered: 10,
    correct: 8,
    accuracy: 0.8,
    durationSeconds: 1200,
    startedAt: '2026-02-07T00:00:00.000Z',
    endedAt: '2026-02-07T00:20:00.000Z',
    ...overrides,
  };
}

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function findSessionRowById(doc: Document, sessionId: string) {
  return (
    doc
      .querySelector(`button[aria-controls="breakdown-${sessionId}"]`)
      ?.closest('li') ?? undefined
  );
}

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
            sessionId: fixtureSession1Id,
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const breakdownToggle = doc.querySelector(
      `button[aria-controls="breakdown-${fixtureSession1Id}"]`,
    );

    expect(html).toContain('Exam');
    expect(html).toContain('8/10 correct (80%)');
    expect(html).toContain('20m');
    expect(html).toContain('Feb 7, 2026');
    expect(breakdownToggle).not.toBeNull();
    expect(breakdownToggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders showing-count context and mode filter controls', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: fixtureSession1Id,
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

  it('renders Previous and Next pagination links with shared header-action styling', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: Array.from({ length: 20 }, (_, index) =>
          makeSessionHistoryRow({
            sessionId: `session-${index + 1}`,
            firstQuestionSlug: `q-${index + 1}`,
          }),
        ),
        total: 60,
        limit: 20,
        offset: 20,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Previous',
    );
    const nextLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Next',
    );

    expect(previousLink).not.toBeUndefined();
    expect(nextLink).not.toBeUndefined();

    const previousClassName = previousLink?.getAttribute('class') ?? '';
    const nextClassName = nextLink?.getAttribute('class') ?? '';

    expect(previousClassName).toContain('h-auto');
    expect(previousClassName).toContain('p-0');
    expect(previousClassName).toContain('text-muted-foreground');
    expect(previousClassName).toContain('no-underline');
    expect(previousClassName).toContain('hover:text-foreground');
    expect(previousClassName).toContain('hover:no-underline');
    expect(nextClassName).toContain('h-auto');
    expect(nextClassName).toContain('p-0');
    expect(nextClassName).toContain('text-muted-foreground');
    expect(nextClassName).toContain('no-underline');
    expect(nextClassName).toContain('hover:text-foreground');
    expect(nextClassName).toContain('hover:no-underline');
  });

  it('renders the session summary as a primary review link when a first question exists', () => {
    const row = {
      sessionId: fixtureSession1Id,
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
    const reviewLinkClassTokens = getClassTokens(
      reviewLink?.getAttribute('class') ?? '',
    );

    expect(reviewLink?.getAttribute('href')).toContain('/app/questions/q-1');
    expect(reviewLink?.getAttribute('href')).toContain('mode=review');
    expect(reviewLink?.getAttribute('href')).toContain(
      `sessionId=${fixtureSession1Id}`,
    );
    expect(reviewLinkClassTokens.has('rounded-md')).toBe(true);
    expect(reviewLinkClassTokens.has('text-sm')).toBe(true);
    expect(reviewLinkClassTokens.has('text-foreground')).toBe(true);
    expect(reviewLinkClassTokens.has('ring-focus')).toBe(true);
    expect(reviewLinkClassTokens.has('hover:underline')).toBe(false);
    expect(reviewLinkClassTokens.has('transition-colors')).toBe(false);
    expect(html).toContain('data-session-summary-content="true"');
  });

  it('renders clickable row affordances when session review is available', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: fixtureSession1Id,
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const row = findSessionRowById(doc, fixtureSession1Id);
    const rowClassTokens = getClassTokens(row?.getAttribute('class') ?? '');

    expect(row).toBeDefined();
    expect(rowClassTokens.has('cursor-pointer')).toBe(true);
    expect(rowClassTokens.has('rounded-xl')).toBe(true);
    expect(rowClassTokens.has('p-3')).toBe(true);
    expect(rowClassTokens.has('bg-foreground/[0.08]')).toBe(true);
    expect(rowClassTokens.has('bg-foreground/5')).toBe(false);
    expect(rowClassTokens.has('hover:bg-foreground/[0.08]')).toBe(false);
    expect(rowClassTokens.has('transition-colors')).toBe(false);
    expect(rowClassTokens.has('border')).toBe(false);
    expect(rowClassTokens.has('border-border/60')).toBe(false);
    expect(rowClassTokens.has('bg-muted/20')).toBe(false);
    expect(rowClassTokens.has('dark:border-foreground/40')).toBe(false);
    expect(rowClassTokens.has('dark:hover:border-foreground/70')).toBe(false);
    expect(rowClassTokens.has('hover:bg-accent/40')).toBe(false);
    expect(rowClassTokens.has('dark:hover:bg-foreground/10')).toBe(false);
    expect(html).not.toContain('tabindex="0"');
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain('tabindex="-1"');
  });

  it('does not render clickable row affordances when session review is unavailable', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: fixtureSession1Id,
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const row = findSessionRowById(doc, fixtureSession1Id);
    const rowClassTokens = getClassTokens(row?.getAttribute('class') ?? '');

    expect(row).toBeDefined();
    expect(rowClassTokens.has('cursor-pointer')).toBe(false);
    expect(rowClassTokens.has('rounded-xl')).toBe(true);
    expect(rowClassTokens.has('p-3')).toBe(true);
    expect(rowClassTokens.has('bg-foreground/[0.08]')).toBe(true);
    expect(rowClassTokens.has('bg-foreground/5')).toBe(false);
    expect(rowClassTokens.has('hover:bg-foreground/[0.08]')).toBe(false);
    expect(rowClassTokens.has('transition-colors')).toBe(false);
    expect(rowClassTokens.has('border')).toBe(false);
    expect(rowClassTokens.has('border-border/60')).toBe(false);
    expect(rowClassTokens.has('bg-muted/20')).toBe(false);
    expect(rowClassTokens.has('dark:border-foreground/40')).toBe(false);
    expect(rowClassTokens.has('dark:hover:border-foreground/70')).toBe(false);
    expect(rowClassTokens.has('hover:bg-accent/40')).toBe(false);
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain('tabindex="0"');
  });

  it('renders a compact Button chevron disclosure with no row chrome', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [makeSessionHistoryRow()],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const toggle = doc.querySelector(
      `button[aria-controls="breakdown-${fixtureSession1Id}"]`,
    );
    const icon = toggle?.querySelector('svg');
    const toggleClassTokens = getClassTokens(
      toggle?.getAttribute('class') ?? '',
    );
    const iconClassTokens = getClassTokens(icon?.getAttribute('class') ?? '');

    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe('');
    expect(toggle?.getAttribute('data-slot')).toBe('button');
    expect(toggle?.getAttribute('data-variant')).toBe('ghost');
    expect(toggleClassTokens.has('rounded-full')).toBe(false);
    expect(toggleClassTokens.has('border')).toBe(false);
    expect(toggleClassTokens.has('focus-visible:border-ring')).toBe(true);
    expect(toggleClassTokens.has('focus-visible:ring-ring/50')).toBe(true);
    expect(toggleClassTokens.has('focus-visible:ring-[3px]')).toBe(true);
    expect(icon).not.toBeNull();
    expect(iconClassTokens.has('size-4')).toBe(true);
    expect(iconClassTokens.has('text-foreground/60')).toBe(true);
    expect(iconClassTokens.has('transition-transform')).toBe(true);
    expect(iconClassTokens.has('rotate-180')).toBe(false);
  });

  it('wires collapsed disclosure accessibility attributes on the breakdown toggle', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [makeSessionHistoryRow()],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const toggle = doc.querySelector(
      `button[aria-controls="breakdown-${fixtureSession1Id}"]`,
    );

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-controls')).toBe(
      `breakdown-${fixtureSession1Id}`,
    );
    expect(toggle?.getAttribute('aria-label')).toContain(
      'View breakdown for Exam session: 8/10 correct (80%), 20m, Feb 7, 2026',
    );
  });

  it('renders expanded breakdown panel as a flat disclosure region', () => {
    mockUseHistorySessionsState = createMockUseHistorySessionsState({
      selectedSessionId: fixtureSession1Id,
      selectedReview: {
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd: 'Stem preview',
            difficulty: 'easy',
            order: 1,
            isAvailable: true,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      },
      reviewLoadState: { status: 'ready' },
    });

    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [makeSessionHistoryRow()],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const panel = doc.getElementById(`breakdown-${fixtureSession1Id}`);
    const toggle = doc.querySelector(
      `button[aria-controls="breakdown-${fixtureSession1Id}"]`,
    );
    const icon = toggle?.querySelector('svg');
    const panelClassTokens = getClassTokens(panel?.getAttribute('class') ?? '');
    const iconClassTokens = getClassTokens(icon?.getAttribute('class') ?? '');

    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('region');
    expect(panel?.getAttribute('aria-label')).toBe('Question breakdown');
    expect(panelClassTokens.has('mt-3')).toBe(true);
    expect(panelClassTokens.has('pt-3')).toBe(true);
    expect(panelClassTokens.has('border-t')).toBe(true);
    expect(panelClassTokens.has('border-border/40')).toBe(true);
    expect(panelClassTokens.has('dark:border-foreground/40')).toBe(true);
    expect(panelClassTokens.has('bg-background')).toBe(false);
    expect(panelClassTokens.has('rounded-lg')).toBe(false);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-label')).toContain(
      'Hide breakdown for Exam session: 8/10 correct (80%), 20m, Feb 7, 2026',
    );
    expect(iconClassTokens.has('rotate-180')).toBe(true);
  });

  it('does not render a redundant Review session button inside breakdown content', () => {
    mockUseHistorySessionsState = createMockUseHistorySessionsState({
      selectedSessionId: fixtureSession1Id,
      selectedReview: {
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd: 'Stem preview',
            difficulty: 'easy',
            order: 1,
            isAvailable: true,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      },
      reviewLoadState: { status: 'ready' },
    });

    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [makeSessionHistoryRow()],
        total: 1,
        limit: 20,
        offset: 0,
      },
    };

    const html = renderToStaticMarkup(<HistorySessionsTab result={result} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const reviewLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Review session',
    );

    expect(reviewLink).toBeUndefined();
  });

  it('uses SessionSummaryContent for non-link session summaries', () => {
    const result: SessionHistoryResult = {
      ok: true,
      data: {
        rows: [
          {
            sessionId: fixtureSession1Id,
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
            sessionId: fixtureSessionExamId,
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
            sessionId: fixtureSessionTutorId,
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
            sessionId: fixtureSessionLongId,
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
