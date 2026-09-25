// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  containsDescendant,
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
