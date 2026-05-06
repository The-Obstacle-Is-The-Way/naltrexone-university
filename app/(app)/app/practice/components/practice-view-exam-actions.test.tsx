// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createQuestionProps } from './practice-view-test-helpers';

type PracticeViewModule = typeof import('./practice-view');
type PracticeViewProps = Parameters<PracticeViewModule['PracticeView']>[0];

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

const noop = () => undefined;

function getButtonLabels(container: Element | null): string[] {
  return Array.from(container?.querySelectorAll('button') ?? []).map((button) =>
    (button.textContent ?? '').trim(),
  );
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function renderExamView(
  input: {
    index?: number;
    total?: number;
    isMarkedForReview?: boolean;
    selectedChoiceId?: string | null;
    props?: Partial<PracticeViewProps>;
  } = {},
): string {
  const question = createQuestionProps();

  return renderToStaticMarkup(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: input.index ?? 0,
        total: input.total ?? 3,
        isMarkedForReview: input.isMarkedForReview ?? false,
      }}
      loadState={{ status: 'ready' }}
      question={question}
      selectedChoiceId={input.selectedChoiceId ?? null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      isMarkingForReview={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onPreviousQuestion={noop}
      hasPreviousQuestion={(input.index ?? 0) > 0}
      hasNextQuestion={(input.index ?? 0) < (input.total ?? 3) - 1}
      {...input.props}
    />,
  );
}

function renderTutorView(
  props: Partial<PracticeViewProps> = {},
  submitResult: PracticeViewProps['submitResult'] = null,
): string {
  const question = createQuestionProps();

  return renderToStaticMarkup(
    <PracticeView
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 3,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={question}
      selectedChoiceId={submitResult ? (question.choices[0]?.id ?? null) : null}
      isAnswered={submitResult !== null}
      submitResult={submitResult}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
      onPreviousQuestion={noop}
      hasPreviousQuestion={true}
      hasNextQuestion={true}
      {...props}
    />,
  );
}

function createCorrectSubmitResult(
  question = createQuestionProps(),
): NonNullable<PracticeViewProps['submitResult']> {
  const choice = question.choices[0];
  if (!choice) throw new Error('Expected at least one choice');

  return {
    attemptId: 'attempt-1',
    isCorrect: true,
    correctChoiceId: choice.id,
    explanationMd: 'Because',
    referenceMd: null,
    choiceExplanations: [],
  };
}

describe('PracticeView exam actions', () => {
  it('renders first-question exam footer with only the right-slot Next CTA', () => {
    const html = renderExamView({ index: 0, total: 3 });
    const doc = parse(html);
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const primaryGroup = doc.querySelector(
      '[data-testid="exam-action-primary-group"]',
    );
    const ctaGroup = doc.querySelector('[data-testid="exam-action-cta-group"]');

    expect(actionBar).not.toBeNull();
    expect(primaryGroup).toBeNull();
    expect(getButtonLabels(ctaGroup)).toEqual(['Next']);
    expect(getButtonLabels(actionBar)).toEqual(['Next']);
    expect(actionBar?.textContent).not.toContain('Mark for review');
    expect(html).not.toContain('>Submit<');
    expect(html).not.toContain('>Previous<');
  });

  it('renders final-question exam footer with Previous left and Review & Submit right', () => {
    const html = renderExamView({ index: 2, total: 3 });
    const doc = parse(html);
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const primaryGroup = doc.querySelector(
      '[data-testid="exam-action-primary-group"]',
    );
    const ctaGroup = doc.querySelector('[data-testid="exam-action-cta-group"]');

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous']);
    expect(getButtonLabels(ctaGroup)).toEqual(['Review & Submit']);
    expect(getButtonLabels(actionBar)).toEqual(['Previous', 'Review & Submit']);
    expect(actionBar?.textContent).not.toContain('Mark for review');
  });

  it('groups active-exam Previous separately from the right-slot CTA and removes the secondary footer group', () => {
    const html = renderExamView({ index: 1, total: 3 });
    const doc = parse(html);
    const primaryGroup = doc.querySelector(
      '[data-testid="exam-action-primary-group"]',
    );
    const ctaGroup = doc.querySelector('[data-testid="exam-action-cta-group"]');
    const secondaryGroup = doc.querySelector(
      '[data-testid="exam-action-secondary-group"]',
    );
    const headerActions = doc.querySelector(
      '[data-testid="question-header-actions"]',
    );

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous']);
    expect(getButtonLabels(ctaGroup)).toEqual(['Next']);
    expect(secondaryGroup).toBeNull();
    expect(getButtonLabels(headerActions)).toEqual(['Mark for review']);
  });

  it('describes the last-question Review & Submit action for assistive tech', () => {
    const html = renderExamView({ index: 1, total: 2 });
    const doc = parse(html);
    const ctaGroup = doc.querySelector('[data-testid="exam-action-cta-group"]');
    const nextButton = Array.from(
      ctaGroup?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.trim() === 'Review & Submit');
    const descriptionId = nextButton?.getAttribute('aria-describedby');
    const description = descriptionId
      ? doc.getElementById(descriptionId)
      : null;

    expect(descriptionId).toBeTruthy();
    expect(description?.textContent).toBe('Opens review and submit.');
  });

  it('keeps Next as the non-final exam CTA even when hasNextQuestion is false', () => {
    const html = renderExamView({
      index: 0,
      total: 2,
      props: { hasNextQuestion: false },
    });
    const doc = parse(html);
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    const ctaGroup = doc.querySelector('[data-testid="exam-action-cta-group"]');

    expect(getButtonLabels(ctaGroup)).toEqual(['Next']);
    expect(getButtonLabels(actionBar)).toEqual(['Next']);
    expect(actionBar?.textContent).not.toContain('Mark for review');
    expect(html).not.toContain('Review answers');
  });

  it('does not render Submit in exam mode', () => {
    const html = renderExamView({ index: 1, total: 2 });

    expect(html).not.toContain('>Submit<');
  });

  it('keeps exam footer labels stable when a draft selection exists', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const unansweredHtml = renderExamView({ index: 1, total: 3 });
    const draftedHtml = renderExamView({
      index: 1,
      total: 3,
      selectedChoiceId: selectedChoice.id,
    });

    const unansweredDoc = parse(unansweredHtml);
    const draftedDoc = parse(draftedHtml);
    const unansweredActionBar = unansweredDoc.querySelector(
      '[data-testid="bottom-action-bar"]',
    );
    const draftedActionBar = draftedDoc.querySelector(
      '[data-testid="bottom-action-bar"]',
    );

    expect(getButtonLabels(unansweredActionBar)).toEqual(['Previous', 'Next']);
    expect(getButtonLabels(draftedActionBar)).toEqual(['Previous', 'Next']);
  });

  it('renders Mark for review in the exam header on every active exam question', () => {
    const labelsByQuestion = [0, 1, 2].map((index) => {
      const doc = parse(renderExamView({ index, total: 3 }));
      return getButtonLabels(
        doc.querySelector('[data-testid="question-header-actions"]'),
      );
    });

    expect(labelsByQuestion).toEqual([
      ['Mark for review'],
      ['Mark for review'],
      ['Mark for review'],
    ]);
  });

  it('renders Unmark review with pressed state when the exam question is marked', () => {
    const html = renderExamView({
      index: 1,
      total: 3,
      isMarkedForReview: true,
    });
    const doc = parse(html);
    const headerActions = doc.querySelector(
      '[data-testid="question-header-actions"]',
    );
    const markButton = headerActions?.querySelector('button');

    expect(getButtonLabels(headerActions)).toEqual(['Unmark review']);
    expect(markButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders unpressed Mark for review when the exam question is unmarked', () => {
    const html = renderExamView({ index: 1, total: 3 });
    const doc = parse(html);
    const headerActions = doc.querySelector(
      '[data-testid="question-header-actions"]',
    );
    const markButton = headerActions?.querySelector('button');

    expect(getButtonLabels(headerActions)).toEqual(['Mark for review']);
    expect(markButton?.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables the header Mark for review button while marking for review', () => {
    const html = renderExamView({
      props: { isMarkingForReview: true },
    });
    const doc = parse(html);
    const markButton = doc.querySelector(
      '[data-testid="question-header-actions"] button',
    );

    expect(markButton?.hasAttribute('disabled')).toBe(true);
  });

  it('disables the header Mark for review button while the view is pending', () => {
    const html = renderExamView({
      props: { isPending: true },
    });
    const doc = parse(html);
    const markButton = doc.querySelector(
      '[data-testid="question-header-actions"] button',
    );

    expect(markButton?.hasAttribute('disabled')).toBe(true);
  });

  it('disables the header Mark for review button while a question is loading', () => {
    const html = renderExamView({
      props: { loadState: { status: 'loading' } },
    });
    const doc = parse(html);
    const markButton = doc.querySelector(
      '[data-testid="question-header-actions"] button',
    );

    expect(markButton?.hasAttribute('disabled')).toBe(true);
  });

  it('does not render Mark for review in the tutor header and preserves End session', () => {
    const html = renderTutorView();
    const doc = parse(html);
    const buttonLabels = getButtonLabels(doc.body);

    expect(buttonLabels).toContain('End session');
    expect(buttonLabels).not.toContain('Mark for review');
    expect(buttonLabels).not.toContain('Unmark review');
  });

  it('preserves tutor footer groups after feedback', () => {
    const question = createQuestionProps();
    const html = renderTutorView(
      { question, hasPreviousQuestion: true, hasNextQuestion: true },
      createCorrectSubmitResult(question),
    );
    const doc = parse(html);
    const primaryGroup = doc.querySelector(
      '[data-testid="tutor-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="tutor-action-secondary-group"]',
    );

    expect(getButtonLabels(primaryGroup)).toEqual(['Previous', 'Next']);
    expect(getButtonLabels(secondaryGroup)).toEqual(['Bookmark']);
  });
});
