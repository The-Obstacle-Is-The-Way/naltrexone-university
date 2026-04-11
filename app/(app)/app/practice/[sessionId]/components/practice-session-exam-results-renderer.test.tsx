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
    sessionId: 'session-1',
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
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Question stem',
    difficulty: 'easy',
    order: 1,
    isAnswered: true,
    isCorrect: false,
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
    postExamReviewCurrentQuestionId: 'question-1',
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
          selectedChoiceId: 'choice-a',
        }),
      ]),
      postExamReviewLoadState: { status: 'ready' },
    });

    expect(doc?.body.textContent).toContain('Score: 0% (0/1)');
    expect(doc?.body.textContent).toContain('Explanation for review.');
    expect(doc?.body.textContent).toContain('View Summary');
  });

  it('returns null when no exam-results surface is active', () => {
    expect(renderBranch()).toBeNull();
  });
});
