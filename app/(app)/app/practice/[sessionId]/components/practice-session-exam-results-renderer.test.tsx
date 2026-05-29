// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import {
  createReview,
  createReviewRow,
  createSummary,
} from './post-exam-review-view.fixtures';

const { fixtureChoiceAId, fixtureQuestion1Id, fixtureSession1Id } = vi.hoisted(
  () => ({
    fixtureChoiceAId: crypto.randomUUID(),
    fixtureQuestion1Id: crypto.randomUUID(),
    fixtureSession1Id: crypto.randomUUID(),
  }),
);

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type RendererModule = typeof import('./practice-session-exam-results-renderer');

let renderPracticeSessionExamResults: RendererModule['renderPracticeSessionExamResults'];

beforeAll(async () => {
  ({ renderPracticeSessionExamResults } = await import(
    './practice-session-exam-results-renderer'
  ));
});

function createSummaryReview(
  rows: GetPracticeSessionReviewOutput['rows'],
): GetPracticeSessionReviewOutput {
  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((row) => row.isAnswered).length,
    markedCount: rows.filter((row) => row.markedForReview).length,
    rows,
  };
}

function createSummaryReviewRow(
  overrides?: Partial<GetPracticeSessionReviewOutput['rows'][number]>,
): GetPracticeSessionReviewOutput['rows'][number] {
  return {
    isAvailable: true,
    questionId: fixtureQuestion1Id,
    slug: 'question-1',
    stemMd: 'Question stem',
    difficulty: 'easy',
    order: 1,
    isAnswered: true,
    isCorrect: false,
    isOmitted: false,
    markedForReview: false,
    ...overrides,
  };
}

function renderBranch(input?: {
  summary?: EndPracticeSessionOutput | null;
  postExamSummary?: EndPracticeSessionOutput | null;
  examResultsSubstage?: 'post_exam_review' | 'session_summary' | null;
  postExamReview?: GetCompletedSessionQuestionsWithFeedbackOutput | null;
  postExamReviewLoadState?:
    | { status: 'idle' | 'loading' | 'ready' }
    | {
        status: 'error';
        message: string;
      };
  summaryReview?: GetPracticeSessionReviewOutput | null;
}) {
  const element = renderPracticeSessionExamResults({
    summary: input?.summary ?? null,
    postExamSummary: input?.postExamSummary ?? null,
    examResultsSubstage: input?.examResultsSubstage ?? null,
    postExamReview: input?.postExamReview ?? null,
    postExamReviewLoadState: input?.postExamReviewLoadState,
    postExamReviewCurrentQuestionId: fixtureQuestion1Id,
    summaryReview: input?.summaryReview ?? null,
    summaryReviewLoadState: { status: 'ready' },
    questionPanelId: 'practice-question-panel',
    bookmarkStatus: 'idle',
    isBookmarked: false,
    onToggleBookmark: () => undefined,
    onRetryPostExamReview: () => undefined,
    onNavigatePostExamReviewQuestion: () => undefined,
    onReenterPostExamReview: () => undefined,
    onViewSummary: () => undefined,
  });

  if (element === null) return null;
  return new DOMParser().parseFromString(
    renderToStaticMarkup(element),
    'text/html',
  );
}

function getScoreBanner(doc: Document | null) {
  const scoreBanner = Array.from(
    doc?.querySelectorAll('[data-slot="card"]') ?? [],
  ).find((card) => card.textContent?.includes('Exam complete'));

  if (!(scoreBanner instanceof HTMLElement)) {
    throw new Error('Expected score banner card');
  }

  return scoreBanner;
}

describe('renderPracticeSessionExamResults', () => {
  it('renders the exam summary surface when an exam summary is active', () => {
    const doc = renderBranch({
      summary: createSummary({
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
      summaryReview: createSummaryReview([
        createSummaryReviewRow({ stemMd: 'Summary stem' }),
      ]),
    });

    const buttonLabels = Array.from(doc?.querySelectorAll('button') ?? []).map(
      (button) => button.textContent?.trim(),
    );

    expect(doc?.body.textContent).toContain('Session Summary');
    expect(buttonLabels).toContain('Review Answers');
  });

  it('renders the in-session loading surface while post-exam review is hydrating', () => {
    const doc = renderBranch({
      examResultsSubstage: 'post_exam_review',
      postExamSummary: createSummary(),
      postExamReviewLoadState: { status: 'loading' },
    });

    expect(doc?.body.textContent).toContain('Loading review...');
    expect(doc?.body.textContent).not.toContain('Session Summary');
  });

  it('renders retry and summary actions when post-exam review hydration fails', () => {
    const doc = renderBranch({
      examResultsSubstage: 'post_exam_review',
      postExamSummary: createSummary(),
      postExamReviewLoadState: {
        status: 'error',
        message: 'Review hydration failed',
      },
    });

    const buttonLabels = Array.from(doc?.querySelectorAll('button') ?? []).map(
      (button) => button.textContent?.trim(),
    );

    expect(doc?.body.textContent).toContain('Review hydration failed');
    expect(buttonLabels).toEqual(['Retry review', 'View Summary']);
  });

  it('renders the post-exam review surface when hydrated review data exists', () => {
    const doc = renderBranch({
      examResultsSubstage: 'post_exam_review',
      postExamSummary: createSummary({
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 0,
          accuracy: 0,
          durationSeconds: 120,
        },
      }),
      postExamReview: createReview([
        createReviewRow({
          isAnswered: true,
          isCorrect: false,
          selectedChoiceId: fixtureChoiceAId,
        }),
      ]),
      postExamReviewLoadState: { status: 'ready' },
    });

    const scoreBanner = getScoreBanner(doc);
    const statNumber = Array.from(scoreBanner.querySelectorAll('div')).find(
      (element) => element.textContent?.trim() === '0%',
    );
    const description = Array.from(scoreBanner.querySelectorAll('p')).find(
      (element) => element.textContent?.includes('0 of 1 correct'),
    );

    expect(scoreBanner.querySelector('h1')?.textContent?.trim()).toBe(
      'Exam complete',
    );
    expect(scoreBanner.querySelectorAll('h1')).toHaveLength(1);
    expect(statNumber?.matches('h1,h2,h3,h4,h5,h6')).toBe(false);
    expect(statNumber?.getAttribute('class')).toContain('text-3xl');
    expect(statNumber?.getAttribute('class')).toContain('font-display');
    expect(description?.tagName).toBe('P');
    expect(description?.textContent).toContain(
      '0 of 1 correct · Review each question with detailed feedback.',
    );
    expect(doc?.body.textContent).toContain('Explanation for review.');
    const viewSummaryButtons = Array.from(
      doc?.querySelectorAll('button') ?? [],
    ).filter((button) => button.textContent?.trim() === 'View Summary');
    expect(viewSummaryButtons).toHaveLength(2);
  });

  it('returns null when no exam-results surface is active', () => {
    expect(renderBranch()).toBeNull();
  });
});
