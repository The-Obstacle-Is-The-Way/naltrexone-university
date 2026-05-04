// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { createQuestionProps } from './practice-view-test-helpers';

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

function getButtonLabels(container: Element | null) {
  if (!container) return [];

  return Array.from(container.querySelectorAll('button')).map((button) =>
    (button.textContent ?? '').trim(),
  );
}

describe('PracticeView navigation', () => {
  it('renders a Previous button when onPreviousQuestion is provided', () => {
    const question = createNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
      />,
    );

    expect(html).toContain('Previous');
  });

  it('disables Previous when canNavigatePrevious is false', () => {
    const question = createNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        canNavigatePrevious={false}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Previous'),
    );

    expect(previousButton).toBeDefined();
    expect(previousButton?.hasAttribute('disabled')).toBe(true);
  });

  it('hides Previous when hasPreviousQuestion is false', () => {
    const question = createNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={false}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Previous'),
    );
    expect(previousButton).toBeUndefined();
  });

  it('renders "Next" (not "Next Question")', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: question.choices[0]?.id ?? 'choice_1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);

    expect(html).toContain('Next');
    expect(html).not.toContain('Next Question');
  });

  it('keeps the pre-feedback last-question footer to Previous when onEndSession is missing', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="tutor-action-secondary-group"]',
    );

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous']);
    expect(getButtonLabels(secondaryGroup)).toEqual([]);
    expect(doc.body.textContent).not.toContain('Next');
    expect(doc.body.textContent).not.toContain('Submit');
    expect(doc.body.textContent).not.toContain('View Summary');
  });

  it('keeps the pre-feedback last tutor question footer to Previous', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 2,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onEndSession: () => undefined,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="tutor-action-secondary-group"]',
    );

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous']);
    expect(getButtonLabels(secondaryGroup)).toEqual([]);
    expect(primaryGroup?.textContent).not.toContain('Next');
    expect(primaryGroup?.textContent).not.toContain('Submit');
    expect(primaryGroup?.textContent).not.toContain('End session');
    expect(primaryGroup?.textContent).not.toContain('View Summary');
  });

  it('renders End session after final tutor feedback and keeps Bookmark in the secondary group', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 2,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: selectedChoice.id,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: selectedChoice.id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onEndSession: () => undefined,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="tutor-action-secondary-group"]',
    );
    const endSessionButton = Array.from(
      primaryGroup?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.trim() === 'End session');

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous', 'End session']);
    expect(getButtonLabels(secondaryGroup)).toEqual(['Bookmark']);
    expect(endSessionButton?.getAttribute('data-variant')).toBe('default');
    expect(doc.body.textContent).not.toContain('Submit');
    expect(doc.body.textContent).not.toContain('View Summary');
  });

  it('suppresses the tutor primary group on the first question before feedback', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: false,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');

    expect(getButtonLabels(primaryGroup)).toEqual([]);
    expect(actionBar).not.toBeNull();
    if (!actionBar) {
      throw new Error('Expected bottom action bar');
    }
    expect(actionBar.textContent).not.toContain('Submit');
    expect(actionBar.textContent).not.toContain('Next');
  });

  it('keeps the middle tutor question footer to Previous before feedback', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous']);
    expect(doc.body.textContent).not.toContain('Submit');
    expect(doc.body.textContent).not.toContain('Next');
  });

  it('keeps tutor action bar ordering as Previous, Next, Bookmark after feedback', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: selectedChoice.id,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: selectedChoice.id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Previous', 'Next', 'Bookmark']);
  });

  it('renders Next as the only primary action after first-question tutor feedback', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: selectedChoice.id,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: selectedChoice.id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: false,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="tutor-action-secondary-group"]',
    );
    const nextButton = Array.from(
      primaryGroup?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.trim() === 'Next');

    expect(getButtonLabels(primaryGroup)).toEqual(['Next']);
    expect(getButtonLabels(secondaryGroup)).toEqual(['Bookmark']);
    expect(nextButton?.getAttribute('data-variant')).toBe('default');
  });

  it('renders both header and footer End session buttons on final tutor feedback', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 2,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: selectedChoice.id,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: selectedChoice.id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      onEndSession: () => undefined,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const footerEndSessionButtons = Array.from(
      actionBar?.querySelectorAll('button') ?? [],
    ).filter((button) => button.textContent?.trim() === 'End session');
    const headerEndSessionButtons = Array.from(
      doc.querySelectorAll('button'),
    ).filter(
      (button) =>
        button.textContent?.trim() === 'End session' &&
        !actionBar?.contains(button),
    );

    expect(actionBar).not.toBeNull();
    expect(headerEndSessionButtons).toHaveLength(1);
    expect(footerEndSessionButtons).toHaveLength(1);
  });

  it('renders the bottom action bar in the document-flow content stack without sticky shell markers', () => {
    const question = createQuestionProps();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const questionPanel = doc.querySelector('section[aria-labelledby]');

    expect(
      doc.querySelector('[data-testid="sticky-action-bar-layout"]'),
    ).toBeNull();
    expect(
      doc.querySelector('[data-testid="sticky-action-bar-scroll-region"]'),
    ).toBeNull();
    expect(doc.querySelector('[data-testid="sticky-action-bar"]')).toBeNull();
    expect(actionBar).not.toBeNull();

    if (!actionBar || !questionPanel) {
      throw new Error('Expected question panel and action bar');
    }

    expect(questionPanel.textContent).toContain(question.stemMd);
    expect(
      questionPanel.compareDocumentPosition(actionBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
