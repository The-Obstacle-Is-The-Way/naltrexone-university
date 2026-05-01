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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);

    expect(html).toContain('Next');
    expect(html).not.toContain('Next Question');
  });

  it('hides Next when hasNextQuestion is false', () => {
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
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Next'),
    );

    expect(nextButton).toBeUndefined();
  });

  it('keeps tutor action bar ordering as Previous, Submit, Next before feedback', () => {
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
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
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

    expect(labels).toEqual(['Previous', 'Submit', 'Next']);
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
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
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
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
