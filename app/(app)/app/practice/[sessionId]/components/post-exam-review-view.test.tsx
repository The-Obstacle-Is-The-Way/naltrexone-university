// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GetCompletedSessionQuestionsWithFeedbackOutput } from '@/src/adapters/controllers/practice-controller';
import {
  createReview,
  createReviewRow,
  createSummary,
} from './post-exam-review-view.fixtures';

const {
  fixtureChoiceAId,
  fixtureChoiceBId,
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestion3Id,
} = vi.hoisted(() => ({
  fixtureChoiceAId: crypto.randomUUID(),
  fixtureChoiceBId: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestion3Id: crypto.randomUUID(),
}));

type PostExamReviewViewModule = typeof import('./post-exam-review-view');
type ReviewRow = GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];

let PostExamReviewView: PostExamReviewViewModule['PostExamReviewView'];

beforeAll(async () => {
  ({ PostExamReviewView } = await import('./post-exam-review-view'));
});

function renderView(input?: {
  rows?: ReviewRow[];
  row?: GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];
  currentQuestionId?: string | null;
  isBookmarked?: boolean;
  questionFeedback?: Parameters<
    typeof PostExamReviewView
  >[0]['questionFeedback'];
}) {
  const rows = input?.rows ?? [input?.row ?? createReviewRow()];
  const answered = rows.filter((row) => row.isAnswered).length;
  const correct = rows.filter((row) => row.isCorrect === true).length;
  const questionCount = rows.length;
  const summary = createSummary({
    questionCount,
    totals: {
      answered,
      correct,
      accuracy: questionCount === 0 ? 0 : correct / questionCount,
      durationSeconds: 120,
    },
  });
  const html = renderToStaticMarkup(
    <PostExamReviewView
      summary={summary}
      review={createReview(rows)}
      currentQuestionId={
        input?.currentQuestionId ?? rows[0]?.questionId ?? null
      }
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={input?.isBookmarked ?? false}
      questionFeedback={input?.questionFeedback ?? null}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={() => undefined}
      onViewSummary={() => undefined}
    />,
  );

  return new DOMParser().parseFromString(html, 'text/html');
}

function getReviewActionLabels(doc: Document) {
  const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');

  if (!actionBar) {
    throw new Error('Expected bottom action bar');
  }

  return Array.from(actionBar.querySelectorAll('button')).map((button) =>
    button.textContent?.trim(),
  );
}

function getScoreBanner(doc: Document) {
  const scoreBanner = Array.from(
    doc.querySelectorAll('[data-slot="card"]'),
  ).find((card) => card.textContent?.includes('Exam complete'));

  if (!(scoreBanner instanceof HTMLElement)) {
    throw new Error('Expected score banner card');
  }

  return scoreBanner;
}

describe('PostExamReviewView', () => {
  it('gives the review panel an accessible name for screen readers', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');

    expect(panel?.getAttribute('aria-label')).toBe('Question 1 of 1');
  });

  it('uses a semantic section for the labeled review panel', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');

    expect(panel?.tagName).toBe('SECTION');
  });

  it('applies the repo-standard focus-ring utility to the review panel', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');
    const className = panel?.getAttribute('class') ?? '';

    expect(className).toContain('ring-focus');
  });

  it('keeps the review panel programmatically focusable with tabIndex -1', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');

    expect(panel?.getAttribute('tabindex')).toBe('-1');
  });

  it('renders a warning banner for unanswered questions', () => {
    const doc = renderView();
    const banner = Array.from(doc.querySelectorAll('[role="status"]')).find(
      (element) =>
        element.textContent?.includes(
          'You did not answer this question during this session.',
        ),
    );

    expect(banner).not.toBeUndefined();
    expect(banner?.getAttribute('class')).toContain('border-warning/50');
    expect(banner?.getAttribute('class')).toContain('bg-warning/5');
  });

  it('does not render an incorrect verdict pill for unanswered questions', () => {
    const doc = renderView();

    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
  });

  it('renders omitted questions as incorrect with no answer selected', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: false,
        isCorrect: false,
        isOmitted: true,
        selectedChoiceId: null,
      }),
    });

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Incorrect');
    expect(doc.body.textContent).toContain('No answer selected.');
    expect(doc.body.textContent).toContain(
      'This question was scored incorrect.',
    );
    expect(doc.body.textContent).not.toContain(
      'You did not answer this question during this session.',
    );
  });

  it('still renders the incorrect verdict pill for answered incorrect questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: false,
        selectedChoiceId: fixtureChoiceAId,
      }),
    });

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Incorrect');
  });

  it('still renders the correct verdict pill for answered correct questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: true,
        selectedChoiceId: fixtureChoiceBId,
      }),
    });

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Correct');
  });

  it('renders the middle-question action bar in navigation-first DOM order', () => {
    const rows = [
      createReviewRow({
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: fixtureQuestion2Id,
        slug: 'question-2',
        order: 2,
      }),
      createReviewRow({
        questionId: fixtureQuestion3Id,
        slug: 'question-3',
        order: 3,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: fixtureQuestion2Id,
    });

    expect(getReviewActionLabels(doc)).toEqual([
      'Previous',
      'Next',
      'Bookmark',
    ]);
    expect(
      doc.querySelector('button[aria-pressed="false"]')?.textContent?.trim(),
    ).toBe('Bookmark');
  });

  it('renders the first-question action bar with next before bookmark', () => {
    const rows = [
      createReviewRow({
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: fixtureQuestion2Id,
        slug: 'question-2',
        order: 2,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: fixtureQuestion1Id,
    });

    expect(getReviewActionLabels(doc)).toEqual(['Next', 'Bookmark']);
  });

  it('renders Give feedback as a post-exam review action sibling', () => {
    const doc = renderView({
      questionFeedback: {
        rating: null,
        feedbackStatus: 'idle',
        onRate: () => undefined,
        isReportOpen: false,
        openReport: () => undefined,
        submitReport: async () => true,
      },
    });

    expect(getReviewActionLabels(doc)).toEqual([
      'View Summary',
      'Bookmark',
      'Give feedback',
    ]);
  });

  it('renders question feedback rating controls after the explanation', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: true,
        selectedChoiceId: fixtureChoiceBId,
        explanationMd: 'Post-exam explanation.',
      }),
      questionFeedback: {
        rating: 'helpful',
        feedbackStatus: 'saved',
        onRate: () => undefined,
        isReportOpen: false,
        openReport: () => undefined,
        submitReport: async () => true,
      },
    });
    const html = doc.body.innerHTML;

    expect(html).toContain('Was this a good question?');
    expect(html.indexOf('Post-exam explanation.')).toBeLessThan(
      html.indexOf('Was this a good question?'),
    );
  });

  it('renders the last-question action bar with view summary before bookmark', () => {
    const rows = [
      createReviewRow({
        questionId: fixtureQuestion1Id,
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: fixtureQuestion2Id,
        slug: 'question-2',
        order: 2,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: fixtureQuestion2Id,
    });

    expect(getReviewActionLabels(doc)).toEqual([
      'Previous',
      'View Summary',
      'Bookmark',
    ]);
  });

  it('renders the single-question action bar with view summary before bookmark', () => {
    const doc = renderView();

    expect(getReviewActionLabels(doc)).toEqual(['View Summary', 'Bookmark']);
  });

  it('renders the review action bar in the document-flow content stack without sticky shell markers', () => {
    const doc = renderView();
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const reviewPanel = doc.querySelector('#practice-question-panel');

    expect(
      doc.querySelector('[data-testid="sticky-action-bar-layout"]'),
    ).toBeNull();
    expect(
      doc.querySelector('[data-testid="sticky-action-bar-scroll-region"]'),
    ).toBeNull();
    expect(doc.querySelector('[data-testid="sticky-action-bar"]')).toBeNull();
    expect(actionBar).not.toBeNull();

    if (!actionBar || !reviewPanel) {
      throw new Error('Expected review panel and action bar');
    }

    expect(
      reviewPanel.compareDocumentPosition(actionBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not render the bookmark toggle for unavailable questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAvailable: false,
      }),
    });

    expect(doc.querySelector('button[aria-pressed]')).toBeNull();
  });

  it('uses bidirectional helper copy that does not imply a one-way summary handoff', () => {
    const doc = renderView();

    expect(doc.body.textContent).toContain(
      'Review each question with detailed feedback.',
    );
    expect(doc.body.textContent).not.toContain(
      'before moving to your session summary',
    );
  });

  it('renders the exam score as a stat number while preserving the surface heading', () => {
    const doc = renderView({
      rows: [
        createReviewRow({
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          order: 1,
          isAnswered: true,
          isCorrect: true,
        }),
        createReviewRow({
          questionId: fixtureQuestion2Id,
          slug: 'question-2',
          order: 2,
          isAnswered: true,
          isCorrect: false,
        }),
        createReviewRow({
          questionId: fixtureQuestion3Id,
          slug: 'question-3',
          order: 3,
          isAnswered: false,
          isCorrect: null,
        }),
      ],
    });
    const scoreBanner = getScoreBanner(doc);
    const heading = scoreBanner.querySelector('h1');
    const statNumber = Array.from(scoreBanner.querySelectorAll('div')).find(
      (element) => element.textContent?.trim() === '33%',
    );
    const description = Array.from(scoreBanner.querySelectorAll('p')).find(
      (element) => element.textContent?.includes('1 of 3 correct'),
    );

    expect(heading?.textContent?.trim()).toBe('Exam complete');
    expect(scoreBanner.querySelectorAll('h1')).toHaveLength(1);
    expect(statNumber?.tagName).toBe('DIV');
    expect(statNumber?.getAttribute('class')).toContain('text-3xl');
    expect(statNumber?.getAttribute('class')).toContain('font-bold');
    expect(statNumber?.getAttribute('class')).toContain('font-display');
    expect(statNumber?.getAttribute('class')).toContain('text-foreground');
    expect(statNumber?.matches('h1,h2,h3,h4,h5,h6')).toBe(false);
    expect(description?.tagName).toBe('P');
    expect(description?.textContent).toContain(
      '1 of 3 correct · Review each question with detailed feedback.',
    );
    expect(scoreBanner.textContent).not.toContain('Score:');
    expect(scoreBanner.textContent).not.toContain('(1/3)');
  });

  it('renders View Summary as an outline button in the review header', () => {
    const doc = renderView();
    const scoreBanner = getScoreBanner(doc);
    const viewSummaryButton = Array.from(
      scoreBanner?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.trim() === 'View Summary');

    expect(
      Array.from(scoreBanner?.querySelectorAll('button') ?? []).filter(
        (button) => button.textContent?.trim() === 'View Summary',
      ),
    ).toHaveLength(1);

    expect(viewSummaryButton?.getAttribute('data-variant')).toBe('outline');
  });
});
