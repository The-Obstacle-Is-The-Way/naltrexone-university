// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';

const fixtureQuestion0Id = crypto.randomUUID();
const fixtureQuestion1Id3 = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type PracticeSessionPageModule =
  typeof import('@/app/(app)/app/practice/[sessionId]/page');

let SessionSummaryView: PracticeSessionPageModule['SessionSummaryView'];
let PracticeSessionPageView: PracticeSessionPageModule['PracticeSessionPageView'];

beforeAll(async () => {
  const module = await import('@/app/(app)/app/practice/[sessionId]/page');
  SessionSummaryView = module.SessionSummaryView;
  PracticeSessionPageView = module.PracticeSessionPageView;
});

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('app/(app)/app/practice/[sessionId]', () => {
  it('renders the session summary view', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 10,
          totals: {
            answered: 10,
            correct: 7,
            accuracy: 0.7,
            durationSeconds: 123,
          },
        }}
      />,
    );

    expect(html).toContain('Session Summary');
    expect(html).toContain('Answered');
    expect(html).toContain('10');
    expect(html).toContain('Correct');
    expect(html).toContain('7');
    expect(html).toContain('Accuracy');
    expect(html).toContain('70%');
    expect(html).toContain('Duration');
    expect(html).toContain('2m 3s');
    expect(html).toContain('Question breakdown');
    expect(html).toContain('New Session');
    expect(html).toContain(`href="${ROUTES.APP_PRACTICE}"`);
    expect(html).not.toContain('Back to Dashboard');
    expect(html).not.toContain('Start another session');
  });

  it('renders per-question breakdown on session summary when review rows are provided', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
            {
              isAvailable: false,
              questionId: fixtureQuestion2Id,
              order: 2,
              isAnswered: false,
              isCorrect: null,
              isOmitted: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).toContain('Question breakdown');
    expect(html).toContain('Stem for q1');
    expect(html).toContain(
      `href="/app/questions/q-1?from=summary&amp;mode=review&amp;sessionId=${fixtureSession1Id}"`,
    );
    expect(html).toContain('[Question no longer available]');
  });

  it('renders exam follow-up CTAs without the removed practice-missed shortcut', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: false,
              questionId: fixtureQuestion0Id,
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
              markedForReview: false,
            },
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 2,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionLinks = Array.from(doc.querySelectorAll('a')).filter((link) => {
      const text = link.textContent?.trim();
      return (
        text === 'Review Answers' ||
        text === 'New Session' ||
        text === 'Back to Dashboard' ||
        text === 'Start another session'
      );
    });

    expect(actionLinks.map((link) => link.textContent?.trim())).toEqual([
      'Review Answers',
      'New Session',
    ]);
    expect(html).toContain('Review Answers');
    expect(html).toContain(
      `href="/app/questions/q-1?from=summary&amp;mode=review&amp;sessionId=${fixtureSession1Id}"`,
    );
    expect(html).not.toContain('Practice missed questions');
    expect(html).not.toContain('href="/app/practice/quick?status=incorrect"');
  });

  it('does not render a Review Answers CTA for tutor summaries', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: fixtureQuestion1Id3,
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).not.toContain('Review Answers');
  });

  it('does not render a Review Answers CTA while summary review is unavailable', async () => {
    const loadingHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'loading' }}
      />,
    );

    expect(loadingHtml).not.toContain('Review Answers');
  });

  it('does not render a Review Answers CTA when no reviewable slug exists', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: false,
              questionId: fixtureQuestion1Id3,
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
              markedForReview: false,
            },
            {
              isAvailable: false,
              questionId: fixtureQuestion2Id,
              order: 2,
              isAnswered: true,
              isCorrect: true,
              isOmitted: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );

    expect(html).not.toContain('Review Answers');
  });

  it('uses a primary New Session CTA when no reviewable slug exists', async () => {
    const html = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        review={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            {
              isAvailable: false,
              questionId: fixtureQuestion1Id3,
              order: 1,
              isAnswered: true,
              isCorrect: false,
              isOmitted: false,
              markedForReview: false,
            },
          ],
        }}
        reviewLoadState={{ status: 'ready' }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newSessionLink = Array.from(doc.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'New Session',
    );
    const tokens = getClassTokens(newSessionLink?.getAttribute('class') ?? '');

    expect(tokens.has('bg-primary')).toBe(true);
    expect(tokens.has('border')).toBe(false);
  });

  it('announces summary breakdown loading with live semantics', async () => {
    const loadingHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'loading' }}
      />,
    );

    expect(loadingHtml).toContain('Loading question breakdown…');
    expect(loadingHtml).toContain('aria-live="polite"');
  });

  it('announces summary breakdown errors with alert semantics', async () => {
    const errorHtml = renderToStaticMarkup(
      <SessionSummaryView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 120,
          },
        }}
        reviewLoadState={{ status: 'error', message: 'Review failed' }}
      />,
    );

    expect(errorHtml).toContain('Review failed');
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).not.toContain('Review Answers');
  });

  it('renders the session summary branch in PracticeSessionPageView', async () => {
    const html = renderToStaticMarkup(
      <PracticeSessionPageView
        summary={{
          sessionId: fixtureSession1Id,
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'tutor',
          questionCount: 10,
          totals: {
            answered: 10,
            correct: 7,
            accuracy: 0.7,
            durationSeconds: 123,
          },
        }}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Session Summary');
  });
});
