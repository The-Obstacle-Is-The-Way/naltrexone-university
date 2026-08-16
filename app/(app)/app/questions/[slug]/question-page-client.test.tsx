// @vitest-environment jsdom
// biome-ignore lint/style/noExcessiveLinesPerFile: Keep question rendering, history navigation, and sequence parsing together — split tracked by DEBT-469.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';
import {
  containsDescendant,
  findAnchorByHref,
  findFieldsetByLegendText,
  isNodeBefore,
  parseHtml,
} from '@/tests/shared/dom-helpers';

const {
  fixtureAttempt1Id,
  fixtureChoiceAId,
  fixtureChoiceBId,
  fixtureQuestion1Id,
  fixtureQuestion1Id2,
  fixtureQuestion2Id,
  fixtureSession123Id,
} = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureChoiceAId: crypto.randomUUID(),
  fixtureChoiceBId: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion1Id2: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureSession123Id: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageClientModule = typeof import('./question-page-client');

let QuestionView: QuestionPageClientModule['QuestionView'];
let parseHistorySequence: QuestionPageClientModule['parseHistorySequence'];

beforeAll(async () => {
  ({ QuestionView, parseHistorySequence } = await import(
    './question-page-client'
  ));
});

describe('QuestionView', () => {
  function createBaseProps() {
    return {
      loadState: { status: 'ready' as const },
      question: null,
      selectedChoiceId: null,
      submitResult: null,
      sessionNavigation: null,
      canSubmit: false,
      isPending: false,
      onTryAgain: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onReattempt: () => undefined,
    };
  }

  function getBottomActionBar(doc: Document): HTMLDivElement | null {
    return doc.querySelector<HTMLDivElement>(
      '[data-testid="bottom-action-bar"]',
    );
  }

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

  const sharedSessionNavigation = {
    questions: [
      { slug: 'q1', order: 1, isCorrect: false },
      { slug: 'q2', order: 2, isCorrect: true },
      { slug: 'q3', order: 3, isCorrect: null },
    ],
    currentIndex: 1,
    sessionId: fixtureSession123Id,
    from: 'practice',
  } as const;

  const historySequenceNavigation = {
    questions: [
      { slug: 'q1', order: 1, isCorrect: null },
      { slug: 'q2', order: 2, isCorrect: null },
      { slug: 'q3', order: 3, isCorrect: null },
    ],
    currentIndex: 1,
    from: 'history',
    historySequence: ['q1', 'q2', 'q3'],
  } as const;

  it('renders a Back to Dashboard utility link', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/dashboard"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Dashboard');
  });

  it('renders a single Back to History link for history origin', () => {
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
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const historyBackLinks = Array.from(doc.querySelectorAll('a')).filter(
      (link) => link.textContent?.trim() === 'Back to History',
    );
    expect(historyBackLinks).toHaveLength(1);
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) {
      throw new Error('Expected bottom action bar');
    }
    expect(bottomBar.textContent).toContain('Back to History');
    expect(html).toContain('Reviewing a question from your history.');
  });

  it('prefers historyHref when origin=history and historyHref is present', () => {
    const historyHref = '/app/history?tab=questions&offset=20&limit=20';

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref={historyHref}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe(historyHref);
  });

  it('ignores invalid historyHref values when origin=history', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref="https://example.com/phish"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe('/app/history?tab=questions');
  });

  it('uses a session-aware back link when origin=practice and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="practice"
        sessionId={fixtureSession123Id}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector(
      `a[href="/app/practice/${fixtureSession123Id}"]`,
    );

    expect(backLink?.textContent?.trim()).toBe('Back to Session');
  });

  it('uses a summary-aware back link when origin=summary and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="summary"
        sessionId={fixtureSession123Id}
        sessionNavigation={{
          ...sharedSessionNavigation,
          from: 'summary',
        }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const summaryLinks = Array.from(doc.querySelectorAll('a')).filter(
      (link) => link.textContent?.trim() === 'Back to Summary',
    );

    expect(summaryLinks).toHaveLength(2);
    for (const link of summaryLinks) {
      expect(link.getAttribute('href')).toBe(
        `/app/practice/${fixtureSession123Id}`,
      );
    }
    expect(html).toContain('Reviewing a question from your session summary.');
  });

  it('uses a sessions-tab back link when origin=history and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId={fixtureSession123Id}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = findAnchorByHref(doc, '/app/history?tab=sessions');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
    expect(findAnchorByHref(doc, '/app/history?tab=questions')).toBeNull();
  });

  it('renders an origin-aware back link when origin=bookmarks', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="bookmarks"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/bookmarks"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Bookmarks');
    expect(html).toContain('Reviewing a bookmarked question.');
  });

  it('uses origin-aware post-submit back actions', () => {
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
        origin="practice"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(
      doc.querySelector('a[href="/app/practice"]')?.textContent?.trim(),
    ).toBe('Back to Practice');
    expect(html).toContain('Review a question from your practice history.');
  });

  it('renders Feedback when submitResult is pre-populated (review mode)', () => {
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
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Correct');
    expect(html).toContain('Explanation');
  });

  it('renders Loading review while previous attempt is hydrating', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={true}
        isPending={false}
        mode="review"
        origin="dashboard"
        isLoadingPreviousAttempt={true}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Loading review…');
    expect(html).not.toContain('Loading question…');
    expect(html).not.toContain('Question stem');
    expect(html).not.toContain('data-testid="bottom-action-bar"');
    expect(html).not.toContain('>Submit<');
  });

  it('renders question content when previous attempt hydration is complete', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={true}
        isPending={false}
        mode="review"
        origin="dashboard"
        isLoadingPreviousAttempt={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).not.toContain('Loading review…');
    expect(html).toContain('Question stem');
    expect(html).toContain('data-testid="bottom-action-bar"');
    expect(html).toContain('>Submit<');
  });

  it('renders feedback labels, correct answer details, and selected-answer badge', () => {
    const choiceA = createChoice({
      id: fixtureChoiceAId,
      questionId: fixtureQuestion1Id,
      label: 'A',
      textMd: 'Choice A text',
      sortOrder: 1,
    });
    const choiceB = createChoice({
      id: fixtureChoiceBId,
      questionId: fixtureQuestion1Id,
      label: 'B',
      textMd: 'Choice B text',
      sortOrder: 2,
    });
    const question = createQuestion({
      id: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Question stem',
      difficulty: 'easy',
      choices: [choiceA, choiceB],
    });

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: question.id,
          slug: question.slug,
          stemMd: question.stemMd,
          difficulty: question.difficulty,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            textMd: choice.textMd,
          })),
        }}
        selectedChoiceId={choiceA.id}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: choiceB.id,
          explanationMd: 'Overall explanation',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: choiceA.id,
              displayLabel: 'A',
              textMd: 'Choice A text',
              isCorrect: false,
              explanationMd: 'A explanation',
            },
            {
              choiceId: choiceB.id,
              displayLabel: 'B',
              textMd: 'Choice B text',
              isCorrect: true,
              explanationMd: 'B explanation',
            },
          ],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const feedbackCard = doc.querySelector('[role="status"]');
    const yourAnswerCard = Array.from(
      feedbackCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('border-destructive') &&
        className.includes('bg-destructive/5')
      );
    });
    const correctAnswerHeading = Array.from(
      feedbackCard?.querySelectorAll('div, span') ?? [],
    ).find((element) => element.textContent?.trim() === 'Correct Answer');

    const correctAnswerCard = correctAnswerHeading?.nextElementSibling;

    const yourAnswerBadge = Array.from(
      yourAnswerCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('rounded-full') && div.textContent?.trim() === 'A'
      );
    });
    const correctAnswerBadge = Array.from(
      correctAnswerCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('rounded-full') && div.textContent?.trim() === 'B'
      );
    });

    expect(yourAnswerCard).not.toBeNull();
    expect(correctAnswerHeading?.textContent?.trim()).toBe('Correct Answer');
    expect(correctAnswerCard).not.toBeNull();
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(html).toContain('Choice A text');
    expect(html).toContain('Choice B text');
    expect(html).toContain('A explanation');
    expect(html).not.toContain('Your answer');
  });

  it('renders omitted review attempts as incorrect with no selected answer', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [
            { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A text' },
            { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B text' },
          ],
        }}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isOmitted: true,
          isCorrect: false,
          correctChoiceId: fixtureChoiceBId,
          explanationMd: 'Overall explanation',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: fixtureChoiceAId,
              displayLabel: 'A',
              textMd: 'Choice A text',
              isCorrect: false,
              explanationMd: 'A explanation',
            },
            {
              choiceId: fixtureChoiceBId,
              displayLabel: 'B',
              textMd: 'Choice B text',
              isCorrect: true,
              explanationMd: 'B explanation',
            },
          ],
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

    expect(html).toContain('Incorrect');
    expect(html).toContain('No answer selected.');
    expect(html).toContain('Correct Answer');
    expect(html).not.toContain('Your answer');
  });

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

  it('renders a previous link when sessionNavigation is not on the first question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Previous'),
    );

    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('renders a next link when sessionNavigation is not on the last question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next'),
    );

    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q3', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('renders history-sequence navigation links without sessionId', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        mode="review"
        sessionNavigation={historySequenceNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Previous'),
    );
    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next'),
    );

    expect(previousLink?.getAttribute('href')).toContain(
      'historySeq=q1%2Cq2%2Cq3',
    );
    expect(previousLink?.getAttribute('href')).toContain('historyIndex=0');
    expect(previousLink?.getAttribute('href')).not.toContain('sessionId=');
    expect(nextLink?.getAttribute('href')).toContain('historyIndex=2');
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

  it('renders the position indicator when sessionNavigation is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const indicator = Array.from(doc.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Question 2 of 3'),
    );
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('text-center')).toBe(true);

    // Regression guard: the old inline indicator was removed in SPEC-030.
    // Class-based selector is intentional here — we're asserting a removed
    // element is absent, so there's no production element to tag with data-testid.
    const inlineIndicator = Array.from(
      doc.querySelectorAll('span.text-sm.text-muted-foreground'),
    ).find((span) => span.textContent?.includes('Question 2 of 3'));
    expect(inlineIndicator).toBeUndefined();
  });

  it('renders ReviewQuestionNavigator when sessionNavigation is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('Question navigator');
  });

  it('does not render ReviewQuestionNavigator when sessionNavigation is null', () => {
    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('Question navigator');
  });

  it('renders navigator buttons with correct/incorrect/unanswered variants', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={sharedSessionNavigation}
      />,
    );

    expect(html).toContain('bg-success');
    expect(html).toContain('bg-destructive');
    expect(html).toContain('bg-background');
  });

  it('hides Previous on the first question of session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 0,
          sessionId: fixtureSession123Id,
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousControl = Array.from(
      bottomBar.querySelectorAll('a,button'),
    ).find((element) => element.textContent?.includes('Previous'));
    const nextLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Next'),
    );

    expect(previousControl).toBeUndefined();
    expect(nextLink?.getAttribute('href')).toBe(
      toQuestionRoute('q2', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('hides Next on the last question of session review', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        sessionNavigation={{
          questions: [
            { slug: 'q1', order: 1, isCorrect: false },
            { slug: 'q2', order: 2, isCorrect: true },
          ],
          currentIndex: 1,
          sessionId: fixtureSession123Id,
          from: 'practice',
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const previousLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Previous'),
    );
    const nextControl = Array.from(bottomBar.querySelectorAll('a,button')).find(
      (element) => element.textContent?.includes('Next'),
    );

    expect(nextControl).toBeUndefined();
    expect(previousLink?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: 'practice',
        mode: 'review',
        sessionId: fixtureSession123Id,
      }),
    );
  });

  it('shows Submit when route is session review and session navigation is unavailable', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        sessionId={fixtureSession123Id}
        sessionNavigation={null}
        submitResult={null}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(bottomBar.textContent).toContain('Submit');
  });

  it('renders Back button in bottom bar for unanswered session questions', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId={fixtureSession123Id}
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    const backLink = Array.from(bottomBar.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );
    expect(backLink?.getAttribute('href')).toBe('/app/history?tab=sessions');
  });

  it('renders unanswered banner and inline Try Again for session review unanswered question', () => {
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
          choices: [
            { id: 'c1', label: 'A', textMd: 'Choice A' },
            { id: 'c2', label: 'B', textMd: 'Choice B' },
          ],
        }}
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
        sessionUnansweredReveal={{
          sessionMode: 'tutor',
          correctChoiceId: 'c2',
          explanationMd: 'Explanation for unanswered review',
          referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(html).toContain(
      'You did not answer this question during this session.',
    );
    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
    expect(html).toContain('Explanation for unanswered review');
    expect(bottomBar.textContent).not.toContain('Submit');
    expect(bottomBar.textContent).toContain('Try Again');
    expect(bottomBar.textContent).toContain('Previous');
    expect(bottomBar.textContent).toContain('Next');
    expect(bottomBar.textContent).toContain('Back to History');
  });

  it('suppresses Try Again for exam-session unanswered review questions', () => {
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
          choices: [
            { id: 'c1', label: 'A', textMd: 'Choice A' },
            { id: 'c2', label: 'B', textMd: 'Choice B' },
          ],
        }}
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
        sessionUnansweredReveal={{
          sessionMode: 'exam',
          correctChoiceId: 'c2',
          explanationMd: 'Explanation for unanswered review',
          referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(html).toContain(
      'You did not answer this question during this session.',
    );
    expect(bottomBar.textContent).not.toContain('Try Again');
    expect(bottomBar.textContent).toContain('Previous');
    expect(bottomBar.textContent).toContain('Next');
  });

  it('does not render a your-answer section for session review unanswered hydration', () => {
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
          choices: [
            { id: 'c1', label: 'A', textMd: 'Choice A' },
            { id: 'c2', label: 'B', textMd: 'Choice B' },
          ],
        }}
        sessionNavigation={sharedSessionNavigation}
        submitResult={null}
        sessionUnansweredReveal={{
          sessionMode: 'tutor',
          correctChoiceId: 'c2',
          explanationMd: 'Explanation for unanswered review',
          referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
          choiceExplanations: [],
        }}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) throw new Error('Expected bottom action bar');

    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
    expect(html).toContain('Explanation for unanswered review');
    expect(html).not.toContain('Your answer');
    expect(html).toContain(
      'You did not answer this question during this session.',
    );
    expect(bottomBar.textContent).toContain('Try Again');
  });

  it('renders explicit hydration error fallback with Answer as new action', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        mode="review"
        origin="history"
        reviewHydrationState="hydration_error"
      />,
    );

    expect(html).toContain('Could not load your previous answer.');
    expect(html).toContain('Retry load');
    expect(html).toContain('Answer as new');
    expect(html).not.toContain('data-testid="bottom-action-bar"');
  });

  it('does not render the session navigation bar when sessionNavigation is null', () => {
    const html = renderToStaticMarkup(
      <QuestionView {...createBaseProps()} sessionNavigation={null} />,
    );

    expect(html).not.toContain('>Previous<');
    expect(html).not.toContain('>Next<');
    expect(html).not.toContain('Question 1 of');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const indicator = Array.from(doc.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Question 1 of'),
    );
    expect(indicator).toBeUndefined();
  });
});

describe('parseHistorySequence', () => {
  it.each([
    ['undefined', undefined],
    ['empty string', ''],
  ] as const)('returns null for falsy input (%s)', (_label, input) => {
    expect(parseHistorySequence(input)).toBeNull();
  });

  it('returns null when all slugs are invalid', () => {
    expect(parseHistorySequence('../dashboard,./history,/app/path')).toBeNull();
  });

  it('filters out malformed slugs and keeps valid history sequence items', () => {
    expect(parseHistorySequence('q-1, ../dashboard ,q-2,,q_3')).toEqual([
      'q-1',
      'q-2',
    ]);
  });

  it('caps result at MAX_HISTORY_SEQUENCE_LENGTH (20) slugs', () => {
    const input = Array.from({ length: 25 }, (_, i) => `q-${i + 1}`).join(',');
    const result = parseHistorySequence(input);
    expect(result).toHaveLength(20);
    expect(result?.[0]).toBe('q-1');
    expect(result?.[19]).toBe('q-20');
  });
});
