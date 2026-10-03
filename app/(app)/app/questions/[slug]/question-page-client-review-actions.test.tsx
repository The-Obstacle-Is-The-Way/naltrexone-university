// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import type { QuestionAvailability } from '@/src/domain/value-objects';
import {
  containsDescendant,
  findAnchorByHref,
  findFieldsetByLegendText,
  isNodeBefore,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import {
  createBaseProps,
  fixtureSession123Id,
  getBottomActionBar,
  sharedSessionNavigation,
} from './question-page-client-test-helpers';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureQuestion1Id2 = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageClientModule = typeof import('./question-page-client');

let QuestionView: QuestionPageClientModule['QuestionView'];

beforeAll(async () => {
  ({ QuestionView } = await import('./question-page-client'));
});

describe('QuestionView', () => {
  // Uses shadcn/Radix slots to capture buttons, asChild links, and Dialog triggers.
  // If shadcn removes data-slot, fall back to 'button, a' combined selector.
  function getBottomActionLabels(doc: Document): string[] {
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) {
      throw new Error('Expected bottom action bar');
    }

    return Array.from(
      bottomBar.querySelectorAll(
        '[data-slot="button"], [data-slot="dialog-trigger"]',
      ),
    ).map((element) => (element.textContent ?? '').trim());
  }

  it('shows Practice Again for any correct standalone review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Practice Again');
    expect(html).not.toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('shows Practice Again for correct standalone dashboard review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="dashboard"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Practice Again');
    expect(html).not.toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('shows Practice Again for correct standalone bookmarks review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="bookmarks"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Practice Again');
    expect(html).not.toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('shows Try Again for incorrect standalone dashboard review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="dashboard"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Try Again');
    expect(html).not.toContain('Practice Again');
    expect(html).not.toContain('>Submit<');
  });

  it('shows Practice Again for correct standalone review with no origin', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Practice Again');
    expect(html).not.toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('keeps Try Again for incorrect standalone history review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Try Again');
    expect(html).not.toContain('>Submit<');
  });

  it('shows Try Again in answered session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="tutor"
        question={{
          questionId: fixtureQuestion2Id,
          slug: 'q2',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        sessionNavigation={sharedSessionNavigation}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(getBottomActionLabels(doc)).toEqual([
      'Previous',
      'Try Again',
      'Bookmark',
      'Next',
      'Back to History',
    ]);
  });

  it('marks a withdrawn question with the F-11 notice and offers only navigation (ADR-021 §3)', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="tutor"
        question={{
          questionId: fixtureQuestion2Id,
          slug: 'q2',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'withdrawn',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        sessionNavigation={sharedSessionNavigation}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const notice = Array.from(doc.querySelectorAll('[role="status"]')).find(
      (element) =>
        element.textContent?.includes('This question was withdrawn.'),
    );
    expect(notice?.textContent).toContain(
      "Its answer and explanation may be inaccurate or outdated, so don't rely on them.",
    );
    expect(getBottomActionLabels(doc)).toEqual([
      'Previous',
      'Next',
      'Back to History',
    ]);
    expect(
      doc.querySelector('[data-testid="question-rating-footer"]'),
    ).toBeNull();
  });

  // Pattern Registry F-12: a newer revision replaced the one the learner saw.
  function renderReviewedQuestion(marks: {
    availability: QuestionAvailability;
    superseded: boolean;
  }) {
    return parseHtml(
      renderToStaticMarkup(
        <QuestionView
          {...createBaseProps()}
          mode="review"
          origin="history"
          sessionId={fixtureSession123Id}
          reviewSessionMode="tutor"
          question={{
            questionId: fixtureQuestion2Id,
            slug: 'q2',
            stemMd: 'Question stem',
            difficulty: 'easy',
            ...marks,
            choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
          }}
          sessionNavigation={sharedSessionNavigation}
          isBookmarked={false}
          isBookmarkHydrated={true}
          bookmarkStatus="idle"
          onToggleBookmark={() => undefined}
          questionFeedback={{
            rating: null,
            feedbackStatus: 'idle',
            onRate: () => undefined,
            isReportOpen: false,
            openReport: () => undefined,
            submitReport: async () => true,
          }}
          submitResult={{
            attemptId: fixtureAttempt1Id,
            isCorrect: false,
            correctChoiceId: 'c1',
            explanationMd: 'Explanation',
            referenceMd: null,
            choiceExplanations: [],
          }}
        />,
      ),
    );
  }

  function statusWith(doc: Document, text: string) {
    return (
      Array.from(doc.querySelectorAll('[role="status"]')).find((element) =>
        element.textContent?.includes(text),
      ) ?? null
    );
  }

  it('marks a question updated since the learner saw it with the F-12 notice above the stem', () => {
    const doc = renderReviewedQuestion({
      availability: 'available',
      superseded: true,
    });

    const notice = statusWith(doc, 'This question has been updated.');
    const stem = Array.from(doc.querySelectorAll('p')).find(
      (element) => element.textContent === 'Question stem',
    );
    expect(notice).not.toBeNull();
    expect(stem).toBeDefined();
    expect(notice && stem ? isNodeBefore(notice, stem) : false).toBe(true);
    expect(findAnchorByHref(doc, toQuestionRoute('q2'))?.textContent).toBe(
      'Practice the current version',
    );
    // Its actions stay: the question is still published.
    expect(getBottomActionLabels(doc)).toEqual(
      expect.arrayContaining(['Bookmark', 'Give feedback']),
    );
    expect(
      doc.querySelector('[data-testid="question-rating-footer"]'),
    ).not.toBeNull();
  });

  it('shows no update notice for the current version', () => {
    const doc = renderReviewedQuestion({
      availability: 'available',
      superseded: false,
    });

    expect(statusWith(doc, 'This question has been updated.')).toBeNull();
  });

  // ADR-022 Decision 1: a question no longer available shows its own notice
  // only; there is no current version to link to.
  it.each([
    ['withdrawn', 'This question was withdrawn.'],
    ['under_review', 'This question is under review.'],
    ['retired', 'This question has been retired from the bank.'],
  ] as const)(
    'marks a %s question with its own notice only',
    (availability, heading) => {
      const doc = renderReviewedQuestion({ availability, superseded: true });

      expect(statusWith(doc, heading)).not.toBeNull();
      expect(statusWith(doc, 'This question has been updated.')).toBeNull();
    },
  );

  it('suppresses reattempt in answered exam-session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        reviewSessionMode="exam"
        question={{
          questionId: fixtureQuestion2Id,
          slug: 'q2',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        sessionNavigation={sharedSessionNavigation}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(getBottomActionLabels(doc)).toEqual([
      'Previous',
      'Bookmark',
      'Next',
      'Back to History',
    ]);
  });

  it('renders the bookmark toggle in review mode with pressed state', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isBookmarked={true}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        onToggleBookmark={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bookmarkButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Remove bookmark'),
    );

    expect(bookmarkButton).not.toBeNull();
    expect(bookmarkButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders Give feedback as a review action sibling', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isBookmarked={false}
        isBookmarkHydrated={true}
        bookmarkStatus="idle"
        questionFeedback={{
          rating: null,
          feedbackStatus: 'idle',
          onRate: () => undefined,
          isReportOpen: false,
          openReport: () => undefined,
          submitReport: async () => true,
        }}
        onToggleBookmark={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(getBottomActionLabels(doc)).toContain('Bookmark');
    expect(getBottomActionLabels(doc)).toContain('Give feedback');
  });

  it('renders question feedback rating controls after the bottom action bar in review mode', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Standalone explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        questionFeedback={{
          rating: 'helpful',
          feedbackStatus: 'saved',
          onRate: () => undefined,
          isReportOpen: false,
          openReport: () => undefined,
          submitReport: async () => true,
        }}
      />,
    );
    const doc = parseHtml(html);
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const ratingFooter = doc.querySelector(
      '[data-testid="question-rating-footer"]',
    );
    const ratingFieldset = findFieldsetByLegendText(doc, 'Rate this question');

    expect(actionBar).not.toBeNull();
    expect(ratingFooter).not.toBeNull();
    expect(ratingFieldset).not.toBeNull();
    expect(containsDescendant(ratingFooter, ratingFieldset)).toBe(true);
    expect(
      actionBar && ratingFooter ? isNodeBefore(actionBar, ratingFooter) : false,
    ).toBe(true);
  });

  it('does not render standalone rating controls outside review mode', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Standalone explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        questionFeedback={{
          rating: 'helpful',
          feedbackStatus: 'saved',
          onRate: () => undefined,
          isReportOpen: false,
          openReport: () => undefined,
          submitReport: async () => true,
        }}
      />,
    );

    expect(html).toContain('Standalone explanation');
    expect(html).not.toContain('Was this question helpful?');
    expect(html).not.toContain('Give feedback');
  });

  it('hides the bookmark toggle while bookmark state is still hydrating', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isBookmarked={false}
        isBookmarkHydrated={false}
        bookmarkStatus="loading"
        onToggleBookmark={() => undefined}
      />,
    );

    expect(html).not.toContain('>Bookmark<');
    expect(html).not.toContain('>Remove bookmark<');
  });

  it('disables the bookmark toggle while a save is in flight', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          availability: 'available',
          superseded: false,
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isBookmarked={true}
        isBookmarkHydrated={true}
        bookmarkStatus="saving"
        onToggleBookmark={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bookmarkButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Remove bookmark'),
    );

    expect(bookmarkButton).not.toBeNull();
    expect(bookmarkButton?.hasAttribute('disabled')).toBe(true);
  });
});
