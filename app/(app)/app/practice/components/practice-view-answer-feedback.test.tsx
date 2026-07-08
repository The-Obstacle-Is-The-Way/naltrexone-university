// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  containsDescendant,
  findFieldsetByLegendText,
  isNodeBefore,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import { createQuestionProps } from './practice-view-test-helpers';

const {
  fixtureAttempt1Id,
  fixtureQuestion1Id,
  fixtureSession1Id,
  fixtureChoice1Id,
} = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
  fixtureChoice1Id: crypto.randomUUID(),
}));

function createFixtureNextQuestion(
  overrides: Parameters<typeof createNextQuestion>[0] = {},
) {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [
      {
        id: fixtureChoice1Id,
        label: 'A',
        textMd: 'Choice A',
        sortOrder: 1,
      },
    ],
    ...overrides,
  });
}

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

describe('PracticeView answer feedback', () => {
  it('does not render question-loading text while an answer commit is pending', () => {
    const question = createFixtureNextQuestion({
      questionId: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });
    const choice = question.choices[0];
    if (!choice) {
      throw new Error(
        'Expected createNextQuestion to include at least one choice',
      );
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={choice.id}
        isAnswered={false}
        submitResult={null}
        isPending
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const buttonLabels = Array.from(doc.querySelectorAll('button')).map(
      (button) => button.textContent?.trim(),
    );

    expect(buttonLabels).not.toContain('Submit');
    expect(buttonLabels).not.toContain('Submitting…');
    expect(html).not.toContain('Loading question');
  });

  it('keeps the first-question tutor footer empty before any commit', () => {
    const question = createFixtureNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 3,
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={false}
        hasNextQuestion={true}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) {
      throw new Error('Expected bottom action bar to render');
    }
    const choiceInputs = Array.from(
      doc.querySelectorAll('input[type="radio"]'),
    );

    expect(choiceInputs.length).toBeGreaterThan(0);
    expect(Array.from(actionBar.querySelectorAll('button'))).toHaveLength(0);
    expect(actionBar.textContent).not.toContain('Submit');
    expect(actionBar.textContent).not.toContain('Next');
    expect(choiceInputs.every((input) => !input.hasAttribute('disabled'))).toBe(
      true,
    );
  });

  it('does not render Submit while the selected choice commit is pending', () => {
    const question = createFixtureNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 1,
          total: 3,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={fixtureChoice1Id}
        canSubmit={true}
        isAnswered={false}
        submitResult={null}
        isPending
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onSubmit={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={true}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) {
      throw new Error('Expected bottom action bar to render');
    }

    expect(actionBar.textContent).not.toContain('Submit');
  });

  it('keeps the middle-question tutor footer to Previous before any commit', () => {
    const question = createFixtureNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 1,
          total: 3,
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={true}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) {
      throw new Error('Expected bottom action bar to render');
    }
    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => button.textContent?.trim(),
    );

    expect(labels).toEqual(['Previous']);
    expect(actionBar.textContent).not.toContain('Submit');
    expect(actionBar.textContent).not.toContain('Next');
  });

  it('renders Next as primary action after an answer commits', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const submitButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Submit',
    );
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );

    expect(submitButton).toBeUndefined();
    expect(nextButton).not.toBeUndefined();
    expect(nextButton?.getAttribute('data-variant')).toBe('default');
  });

  it('threads question feedback rating controls after the bottom action bar', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        questionFeedback={{
          rating: 'helpful',
          feedbackStatus: 'saved',
          onRate: () => undefined,
          isReportOpen: false,
          openReport: () => undefined,
          submitReport: async () => true,
        }}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
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

  it('does not render Review answers for tutor mode after answer commit', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 1,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={false}
      />,
    );

    expect(html).not.toContain('Review answers');
    expect(html).not.toContain('View Summary');
    expect(html).toContain('End session');
  });

  it('passes selected choice context to feedback after submit', () => {
    const question = createFixtureNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }
    const secondChoiceId = 'choice-2';

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: secondChoiceId,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: selectedChoice.id,
              displayLabel: selectedChoice.label,
              textMd: selectedChoice.textMd,
              isCorrect: false,
              explanationMd: 'Selected choice explanation.',
            },
            {
              choiceId: secondChoiceId,
              displayLabel: 'B',
              textMd: 'Choice B',
              isCorrect: true,
              explanationMd: 'Correct choice explanation.',
            },
          ],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const feedbackCard = doc.querySelector('[role="status"]');
    const correctAnswerChip = Array.from(
      feedbackCard?.querySelectorAll('div, span') ?? [],
    ).find((element) => element.textContent?.trim() === 'Correct Answer');

    expect(html).not.toContain('Your answer');
    expect(correctAnswerChip?.textContent?.trim()).toBe('Correct Answer');
    expect(html).toContain('Choice A');
  });

  it('does not render feedback when submit correctness is unknown', () => {
    const question = createFixtureNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: null,
          correctChoiceId: null,
          explanationMd: 'Redacted explanation.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('Your answer');
    expect(html).not.toContain('Redacted explanation.');
    expect(html).not.toContain('>Bookmark<');
  });
});
