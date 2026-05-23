// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

type ExamReviewViewModule = typeof import('./exam-review-view');

let ExamReviewView: ExamReviewViewModule['ExamReviewView'];
let QuestionNavigator: ExamReviewViewModule['QuestionNavigator'];

beforeAll(async () => {
  ({ ExamReviewView, QuestionNavigator } = await import('./exam-review-view'));
});
describe('QuestionNavigator', () => {
  const review = {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: 3,
    answeredCount: 2,
    markedCount: 0,
    rows: [
      {
        isAvailable: true,
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        order: 1,
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
        markedForReview: false,
      },
      {
        isAvailable: true,
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        order: 2,
        isAnswered: true,
        isCorrect: false,
        isOmitted: false,
        markedForReview: false,
      },
      {
        isAvailable: false,
        questionId: 'q3',
        order: 3,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
    ],
  } as const satisfies GetPracticeSessionReviewOutput;

  function findByAriaLabel(doc: Document, label: string): Element | null {
    return (
      Array.from(doc.querySelectorAll('[aria-label]')).find(
        (el) => el.getAttribute('aria-label') === label,
      ) ?? null
    );
  }

  function getClassList(el: Element | null): string[] {
    return (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  }

  function findBottomRightBadge(el: Element | null): Element | null {
    return (
      el?.querySelector('[data-testid="review-correctness-badge"]') ?? null
    );
  }

  function findTopRightReviewDot(el: Element | null): Element | null {
    return el?.querySelector('[data-testid="question-nav-marked-dot"]') ?? null;
  }

  function renderNavigator(input?: {
    review?: GetPracticeSessionReviewOutput;
    currentQuestionId?: string | null;
    controlledPanelId?: string;
    mode?: 'exam' | 'review';
  }) {
    const controlledPanelId =
      input?.controlledPanelId ?? 'practice-question-panel';
    const html = renderToStaticMarkup(
      <QuestionNavigator
        review={input?.review ?? review}
        currentQuestionId={input?.currentQuestionId ?? 'q2'}
        controlledPanelId={controlledPanelId}
        mode={input?.mode}
        onNavigateQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { doc };
  }

  it('exposes a navigation landmark with an accessible label', () => {
    const { doc } = renderNavigator();

    expect(
      doc.querySelector('nav[aria-label="Question navigator"]'),
    ).not.toBeNull();
  });

  it('sets aria-current="step" on the current question button', () => {
    const { doc } = renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Current, Answered');

    expect(el?.getAttribute('aria-current')).toBe('step');
  });

  it('does not set aria-current on non-current questions', () => {
    const { doc } = renderNavigator();
    const el = findByAriaLabel(doc, 'Question 1: Answered');

    expect(el?.getAttribute('aria-current')).toBeNull();
  });

  it('wires each navigator button to the controlled question panel with aria-controls', () => {
    const { doc } = renderNavigator();
    const buttons = Array.from(
      doc.querySelectorAll('button[aria-label^="Question "]'),
    );

    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.getAttribute('aria-controls')).toBe(
        'practice-question-panel',
      );
    });
  });

  it('uses correctness styling in review mode', () => {
    const { doc } = renderNavigator({
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const correct = findByAriaLabel(doc, 'Question 1: Correct');
    const incorrect = findByAriaLabel(doc, 'Question 2: Incorrect');
    const unanswered = findByAriaLabel(doc, 'Question 3: Current, Unanswered');

    expect(getClassList(correct)).toContain('bg-success');
    expect(getClassList(correct)).toContain('text-success-foreground');
    expect(getClassList(incorrect)).toContain('bg-destructive');
    expect(getClassList(unanswered)).toContain('bg-background');
    expect(getClassList(unanswered)).toContain('border');
  });

  it('does not render correctness badges in exam mode', () => {
    const { doc } = renderNavigator({ mode: 'exam' });

    const buttons = Array.from(
      doc.querySelectorAll('button[aria-label^="Question "]'),
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(findBottomRightBadge(btn)).toBeNull();
      expect(btn.querySelector('svg')).toBeNull();
    }
  });

  it('renders check and x overflow badges only for answered review buttons', () => {
    const { doc } = renderNavigator({
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const correct = findByAriaLabel(doc, 'Question 1: Correct');
    const incorrect = findByAriaLabel(doc, 'Question 2: Incorrect');
    const unanswered = findByAriaLabel(doc, 'Question 3: Current, Unanswered');

    const correctBadge = findBottomRightBadge(correct);
    const incorrectBadge = findBottomRightBadge(incorrect);

    expect(correctBadge?.getAttribute('aria-hidden')).toBe('true');
    expect(getClassList(correctBadge?.querySelector('svg') ?? null)).toContain(
      'text-success',
    );
    expect(getClassList(correctBadge?.querySelector('svg') ?? null)).toContain(
      'size-2.5',
    );

    expect(incorrectBadge?.getAttribute('aria-hidden')).toBe('true');
    expect(
      getClassList(incorrectBadge?.querySelector('svg') ?? null),
    ).toContain('text-destructive');
    expect(findBottomRightBadge(unanswered)).toBeNull();
    expect(unanswered?.querySelector('svg')).toBeNull();
  });

  it('renders both the review dot and bottom-right check badge for marked correct review buttons', () => {
    const { doc } = renderNavigator({
      review: {
        ...review,
        markedCount: 1,
        rows: review.rows.map((row) =>
          row.questionId === 'q1' ? { ...row, markedForReview: true } : row,
        ),
      },
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const markedCorrect = findByAriaLabel(
      doc,
      'Question 1: Marked for review, Correct',
    );

    expect(findTopRightReviewDot(markedCorrect)).not.toBeNull();
    const badge = findBottomRightBadge(markedCorrect);
    expect(badge).not.toBeNull();
    expect(getClassList(badge?.querySelector('svg') ?? null)).toContain(
      'text-success',
    );
  });
});

describe('ExamReviewView', () => {
  const reviewInstructionText =
    'Select a question below to keep reviewing before you submit.';
  const review = {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: 4,
    answeredCount: 2,
    markedCount: 1,
    rows: [
      {
        isAvailable: true,
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Marked answered question',
        difficulty: 'easy',
        order: 1,
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
        markedForReview: true,
      },
      {
        isAvailable: true,
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Unmarked answered question',
        difficulty: 'medium',
        order: 2,
        isAnswered: true,
        isCorrect: false,
        isOmitted: false,
        markedForReview: false,
      },
      {
        isAvailable: true,
        questionId: 'q3',
        slug: 'q-3',
        stemMd: 'Unmarked unanswered question',
        difficulty: 'hard',
        order: 3,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
      {
        isAvailable: false,
        questionId: 'q4',
        order: 4,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
    ],
  } as const satisfies GetPracticeSessionReviewOutput;

  function renderExamReviewMarkup(input?: {
    review?: GetPracticeSessionReviewOutput;
  }) {
    const html = renderToStaticMarkup(
      <ExamReviewView
        review={input?.review ?? review}
        isPending={false}
        onOpenQuestion={() => undefined}
        onFinalizeReview={async () => undefined}
      />,
    );

    return new DOMParser().parseFromString(html, 'text/html');
  }

  function getReviewRows(root: ParentNode) {
    const reviewList = root.querySelector('ul');
    return reviewList
      ? Array.from(reviewList.children).filter(
          (child): child is HTMLLIElement => child.tagName === 'LI',
        )
      : [];
  }

  function getReviewRowButtons(root: ParentNode) {
    return Array.from(
      root.querySelectorAll<HTMLButtonElement>('button'),
    ).filter(
      (button) => button.textContent?.includes('Open question') ?? false,
    );
  }

  function getReviewRowMetadata(row: Element | undefined) {
    const parts =
      row === undefined
        ? []
        : Array.from(row.querySelectorAll('span'))
            .map((span) => span.textContent?.trim() ?? '')
            .filter((text) => text.length > 0)
            .filter((text) => text !== 'Open question' && text !== '•');

    return parts.join(' • ');
  }

  function findReviewRowButton(root: ParentNode, order: number) {
    return (
      getReviewRowButtons(root).find((button) =>
        button.textContent?.includes(`${order}. `),
      ) ?? null
    );
  }

  function findReviewRow(root: ParentNode, order: number) {
    return getReviewRows(root).find((row) =>
      row.textContent?.includes(`${order}. `),
    );
  }

  function findReviewInstructionParagraph(doc: Document) {
    return Array.from(doc.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === reviewInstructionText,
    );
  }

  function findButtonByExactText(root: ParentNode, text: string) {
    return (
      Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.trim() === text,
      ) ?? null
    );
  }

  function findReviewRowChevron(row: ParentNode | null) {
    return (
      row?.querySelector('[data-testid="exam-review-row-chevron"]') ?? null
    );
  }

  it('does not render nested buttons inside review rows', () => {
    const doc = renderExamReviewMarkup();
    const rowButtons = getReviewRowButtons(doc);

    expect(rowButtons).toHaveLength(3);
    rowButtons.forEach((button) => {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.querySelector('button')).toBeNull();
    });
  });

  it('renders an instructional paragraph above the review list', () => {
    const doc = renderExamReviewMarkup();
    const instruction = findReviewInstructionParagraph(doc);
    const list = doc.querySelector('ul');

    expect(instruction?.tagName).toBe('P');
    expect(instruction?.getAttribute('aria-hidden')).toBeNull();
    expect(
      Boolean(
        instruction &&
          list &&
          instruction.compareDocumentPosition(list) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it('keeps the row action discoverable without overriding the visible row state', () => {
    const doc = renderExamReviewMarkup();
    const button = findReviewRowButton(doc, 1);

    expect(button?.getAttribute('aria-label')).toBeNull();
    expect(button?.textContent).toContain('Open question');
    expect(button?.textContent).toContain('Marked for review');
    expect(button?.textContent).toContain('Correct');
  });

  it('renders decorative chevrons only on available review rows', () => {
    const doc = renderExamReviewMarkup();
    const availableButtons = getReviewRowButtons(doc);
    const unavailableCard = findReviewRow(doc, 4);

    expect(availableButtons).toHaveLength(3);
    availableButtons.forEach((button) => {
      expect(findReviewRowChevron(button)?.getAttribute('aria-hidden')).toBe(
        'true',
      );
    });
    expect(findReviewRowChevron(unavailableCard ?? doc)).toBeNull();
  });

  it('keeps chevrons decorative without changing the row button naming model', () => {
    const doc = renderExamReviewMarkup();
    const button = findReviewRowButton(doc, 1);

    expect(button?.getAttribute('aria-label')).toBeNull();
    expect(button?.querySelector('.sr-only')?.textContent).toBe(
      'Open question ',
    );
    expect(findReviewRowChevron(button)?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('does not render Not marked text for unmarked rows', () => {
    const doc = renderExamReviewMarkup();

    expect(doc.body.textContent).not.toContain('Not marked');
  });

  it('renders Marked for review text only for marked rows', () => {
    const doc = renderExamReviewMarkup();

    expect(doc.body.textContent).toContain('Marked for review');
    expect(doc.body.textContent?.match(/Marked for review/g)).toHaveLength(1);
  });

  it('collapses metadata separators when the marked state is absent', () => {
    const doc = renderExamReviewMarkup();
    const rows = getReviewRows(doc);

    expect(getReviewRowMetadata(rows[0])).toBe(
      'Answered • Marked for review • Correct',
    );
    expect(getReviewRowMetadata(rows[1])).toBe('Answered • Incorrect');
    expect(getReviewRowMetadata(rows[2])).toBe('Unanswered');
  });

  it('keeps unavailable rows non-interactive', () => {
    const doc = renderExamReviewMarkup();

    expect(findReviewRowButton(doc, 4)).toBeNull();
    expect(doc.body.textContent).toContain('[Question no longer available]');
  });

  it('keeps submit exam as the only pre-dialog footer action', () => {
    const doc = renderExamReviewMarkup();
    const submitButton = findButtonByExactText(doc, 'Submit exam');
    const footerButtons = submitButton?.parentElement
      ? Array.from(submitButton.parentElement.children).filter(
          (child): child is HTMLButtonElement => child.tagName === 'BUTTON',
        )
      : [];

    expect(footerButtons).toHaveLength(1);
    expect(footerButtons[0]?.textContent?.trim()).toBe('Submit exam');
  });
});
