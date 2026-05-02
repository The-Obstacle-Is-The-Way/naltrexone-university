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

describe('PracticeView answer feedback', () => {
  it('renders submit pending copy without rendering question-loading text', () => {
    const question = createNextQuestion({
      questionId: 'question-1',
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
        canSubmit
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Submitting…');
    expect(html).not.toContain('Loading question');
  });

  it('keeps Submit visible and Next outlined before submission', () => {
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
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const submitButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Submit',
    );
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );

    expect(submitButton).not.toBeUndefined();
    expect(nextButton).not.toBeUndefined();
    expect(nextButton?.getAttribute('data-variant')).toBe('outline');
  });

  it('hides Submit and promotes Next to primary after submission', () => {
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
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
    expect(nextButton?.className).toContain('bg-primary');
  });

  it('does not render Review answers for tutor mode after submit', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'tutor',
          index: 1,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={false}
      />,
    );

    expect(html).not.toContain('Review answers');
    expect(html).toContain('View Summary');
  });

  it('passes selected choice context to feedback after submit', () => {
    const question = createNextQuestion();
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
          attemptId: 'attempt-1',
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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
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
    const question = createNextQuestion();
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
          attemptId: 'attempt-1',
          isCorrect: null,
          correctChoiceId: null,
          explanationMd: 'Redacted explanation.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('Your answer');
    expect(html).not.toContain('Redacted explanation.');
    expect(html).not.toContain('>Bookmark<');
  });
});
