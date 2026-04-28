// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Feedback: typeof import('@/components/question/feedback').Feedback;

beforeAll(async () => {
  ({ Feedback } = await import('@/components/question/feedback'));
});

const incorrectChoiceA = {
  choiceId: 'choice-a',
  displayLabel: 'A',
  textMd: 'First option',
  isCorrect: false,
  explanationMd: 'First option is incorrect.',
};

const incorrectChoiceB = {
  choiceId: 'choice-b',
  displayLabel: 'B',
  textMd: 'Second option',
  isCorrect: false,
  explanationMd: 'Second option is incorrect.',
};

const correctChoiceB = {
  choiceId: 'choice-b',
  displayLabel: 'B',
  textMd: 'Second option',
  isCorrect: true,
  explanationMd: 'Second option rationale.',
};

const correctChoiceC = {
  choiceId: 'choice-c',
  displayLabel: 'C',
  textMd: 'Third option',
  isCorrect: true,
  explanationMd: 'Third option is correct.',
};

const choicesWithCorrectB = [incorrectChoiceA, correctChoiceB];
const choicesWithCorrectBConfirmed = [
  incorrectChoiceA,
  { ...correctChoiceB, explanationMd: 'Second option is correct.' },
];
const choicesWithCorrectC = [
  incorrectChoiceA,
  incorrectChoiceB,
  correctChoiceC,
];

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function hasTokenMatching(tokens: Set<string>, pattern: RegExp): boolean {
  return [...tokens].some((token) => pattern.test(token));
}

function findRoundedBadge(
  container: ParentNode,
  label: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.getAttribute('class') ?? '');
    return classTokens.has('rounded-full') && div.textContent?.trim() === label;
  }) as HTMLDivElement | undefined;
}

function expectTokens(
  tokens: Set<string>,
  expected: string[],
  absent: string[] = [],
) {
  for (const token of expected) {
    expect(tokens.has(token)).toBe(true);
  }

  for (const token of absent) {
    expect(tokens.has(token)).toBe(false);
  }
}

function findMarkdownWrapper(
  container: ParentNode,
  text: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.getAttribute('class') ?? '');
    return classTokens.has('[&_p+p]:mt-3') && div.textContent?.trim() === text;
  }) as HTMLDivElement | undefined;
}

function findAnswerRow(
  container: ParentNode,
  label: string,
  text: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.getAttribute('class') ?? '');
    return (
      classTokens.has('flex') &&
      classTokens.has('items-start') &&
      findRoundedBadge(div, label) !== undefined &&
      findMarkdownWrapper(div, text) !== undefined
    );
  }) as HTMLDivElement | undefined;
}

function findStyledCard(
  container: ParentNode,
  requiredTokens: string[],
  answer?: { label: string; text: string },
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.getAttribute('class') ?? '');

    if (!requiredTokens.every((token) => classTokens.has(token))) {
      return false;
    }

    if (!answer) {
      return true;
    }

    return findAnswerRow(div, answer.label, answer.text) !== undefined;
  }) as HTMLDivElement | undefined;
}

function findSectionLabel(
  container: ParentNode,
  text: string,
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('div, span')).find(
    (element) =>
      element.textContent?.trim() === text &&
      !(element.getAttribute('class') ?? '').includes('self-start'),
  ) as HTMLElement | undefined;
}

function expectNodeBefore(
  first: Node | null | undefined,
  second: Node | null | undefined,
) {
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  if (!first || !second) {
    return;
  }

  const position = first.compareDocumentPosition(second);
  expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function expectNeutralChip(element: Element | undefined) {
  expect(element).not.toBeUndefined();
  const chipTokens = getClassTokens(element?.getAttribute('class') ?? '');
  expectTokens(
    chipTokens,
    ['rounded-full', 'bg-muted', 'text-foreground'],
    [
      'bg-success',
      'bg-destructive',
      'text-success-foreground',
      'text-destructive-foreground',
    ],
  );
}

function expectCorrectChip(element: Element | undefined) {
  expect(element).not.toBeUndefined();
  const chipTokens = getClassTokens(element?.getAttribute('class') ?? '');
  expectTokens(
    chipTokens,
    ['rounded-full', 'bg-success', 'text-success-foreground'],
    ['bg-muted', 'bg-destructive', 'text-foreground'],
  );
}

describe('Feedback', () => {
  it('renders a neutral status card with a verdict badge', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="Because..." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const card = doc.querySelector('[role="status"]');
    const verdictBadge = Array.from(doc.querySelectorAll('span')).find(
      (span) => span.textContent?.trim() === 'Correct',
    );

    expect(card).not.toBeNull();
    expect(doc.querySelector('[role="alert"]')).toBeNull();
    expect(card?.getAttribute('class')).not.toContain('border-success');
    expect(card?.getAttribute('class')).not.toContain('bg-success');
    expect(card?.getAttribute('class')).not.toContain('border-destructive');
    expect(card?.getAttribute('class')).not.toContain('bg-destructive');
    expect(verdictBadge).not.toBeUndefined();
    expect(verdictBadge?.getAttribute('class')).toContain('rounded-full');
    expect(verdictBadge?.getAttribute('class')).toContain('self-start');
    expect(verdictBadge?.getAttribute('class')).toContain('bg-success');
    expect(verdictBadge?.getAttribute('class')).toContain(
      'text-success-foreground',
    );
    expect(verdictBadge?.textContent?.trim()).toBe('Correct');
    expect(html).toContain('Because...');
  });

  it('renders an incorrect verdict badge as a compact destructive pill', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={false} explanationMd="Because..." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const verdictBadge = Array.from(doc.querySelectorAll('span')).find(
      (span) => span.textContent?.trim() === 'Incorrect',
    );

    expect(verdictBadge).not.toBeUndefined();
    expect(verdictBadge?.getAttribute('class')).toContain('rounded-full');
    expect(verdictBadge?.getAttribute('class')).toContain('self-start');
    expect(verdictBadge?.getAttribute('class')).toContain('bg-destructive');
    expect(verdictBadge?.getAttribute('class')).toContain(
      'text-destructive-foreground',
    );
    expect(html).toContain('Incorrect');
    expect(html).toContain('Because...');
  });

  it('does not render a verdict pill when isUnanswered is true', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        isUnanswered={true}
        explanationMd="Explanation for unanswered review."
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
  });

  it('still renders explanation, reference, and choice explanations when isUnanswered is true', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        isUnanswered={true}
        explanationMd="Explanation for unanswered review."
        referenceMd="Anton RF et al. JAMA. 2006;295(17):2003-2017."
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    expect(html).toContain('Explanation for unanswered review.');
    expect(html).toContain('Reference');
    expect(html).toContain('Anton RF et al. JAMA. 2006;295(17):2003-2017.');
    expect(html).toContain('Correct Answer');
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).toContain('First option is incorrect.');
  });

  it('still renders the verdict pill when isUnanswered is false', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        isUnanswered={false}
        explanationMd="Because..."
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Incorrect');
  });

  it('T1: wraps correct-flow correct-answer content in a success card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        choiceExplanations={choicesWithCorrectB}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = findStyledCard(doc, ['rounded-xl'], {
      label: 'B',
      text: 'Second option',
    });
    const successCardTokens = getClassTokens(
      successCard?.getAttribute('class') ?? '',
    );
    const successCardText = successCard?.textContent ?? '';
    const correctAnswerRow = successCard
      ? findAnswerRow(successCard, 'B', 'Second option')
      : undefined;
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;
    const correctAnswerExplanation = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;

    expect(successCard).not.toBeNull();
    expect(
      hasTokenMatching(successCardTokens, /(^|:)border-success(?:\/.+)?$/),
    ).toBe(true);
    expect(
      hasTokenMatching(successCardTokens, /(^|:)bg-success(?:\/.+)?$/),
    ).toBe(true);
    expect(correctAnswerRow).not.toBeUndefined();
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(successCardText).toContain('B');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
    expect(findSectionLabel(doc, 'Explanation')).toBeUndefined();
    expect(correctAnswerText).not.toBeUndefined();
    expect(correctAnswerExplanation).not.toBeUndefined();
  });

  it('T2: wraps explanation-only fallback in a success card for correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="General explanation." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = Array.from(doc.querySelectorAll('div')).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('rounded-xl') &&
        hasTokenMatching(classTokens, /(^|:)border-success(?:\/.+)?$/) &&
        hasTokenMatching(classTokens, /(^|:)bg-success(?:\/.+)?$/) &&
        div.textContent?.includes('General explanation.')
      );
    });
    const successCardText = successCard?.textContent ?? '';
    const explanationText = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;

    expect(successCard).not.toBeNull();
    expect(successCardText).toContain('General explanation.');
    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
    expect(findSectionLabel(doc, 'Explanation')).toBeUndefined();
    expect(explanationText).not.toBeUndefined();
    expect(successCardText).not.toContain('A)');
    expect(successCardText).not.toContain('B)');
  });

  it('renders explanation fallback when no correct choice exists in correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd={null} />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = Array.from(doc.querySelectorAll('div')).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('rounded-xl') &&
        hasTokenMatching(classTokens, /(^|:)border-success(?:\/.+)?$/) &&
        hasTokenMatching(classTokens, /(^|:)bg-success(?:\/.+)?$/) &&
        div.textContent?.includes('Explanation not available.')
      );
    });
    const fallbackParagraph = Array.from(
      successCard?.querySelectorAll('p') ?? [],
    ).find(
      (paragraph) =>
        paragraph.textContent?.trim() === 'Explanation not available.',
    );

    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
    expect(findSectionLabel(doc, 'Explanation')).toBeUndefined();
    expect(fallbackParagraph).not.toBeUndefined();
  });

  it('T3: wraps incorrect-flow your-answer content in a destructive card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectB}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive'],
      { label: 'A', text: 'First option' },
    );
    const destructiveCardClassName =
      destructiveCard?.getAttribute('class') ?? '';
    const destructiveCardTokens = getClassTokens(destructiveCardClassName);
    const destructiveCardText = destructiveCard?.textContent ?? '';
    const yourAnswerRow = destructiveCard
      ? findAnswerRow(destructiveCard, 'A', 'First option')
      : undefined;
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;
    const yourAnswerExplanation = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option is incorrect.')
      : undefined;

    expect(destructiveCard).not.toBeNull();
    expect(destructiveCardTokens.has('border-destructive')).toBe(true);
    expect(
      hasTokenMatching(destructiveCardTokens, /(^|:)bg-destructive(?:\/.+)?$/),
    ).toBe(true);
    expect(yourAnswerRow).not.toBeUndefined();
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(destructiveCardText).toContain('A');
    expect(destructiveCardText).toContain('First option');
    expect(destructiveCardText).toContain('First option is incorrect.');
    expect(html).not.toContain('Your answer');
    expect(yourAnswerText).not.toBeUndefined();
    expect(yourAnswerExplanation).not.toBeUndefined();
  });

  it('T4: wraps incorrect-flow correct-answer content in a success card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectB}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = findSectionLabel(doc, 'Correct Answer');
    const successCard = correctAnswerLabel?.nextElementSibling;
    const successCardTokens = getClassTokens(
      successCard?.getAttribute('class') ?? '',
    );
    const successCardText = successCard?.textContent ?? '';
    const correctAnswerRow = successCard
      ? findAnswerRow(successCard, 'B', 'Second option')
      : undefined;
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;
    const correctAnswerExplanation = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;

    expect(correctAnswerLabel).not.toBeUndefined();
    expectCorrectChip(correctAnswerLabel);
    expect(successCard).not.toBeNull();
    expect(
      hasTokenMatching(successCardTokens, /(^|:)border-success(?:\/.+)?$/),
    ).toBe(true);
    expect(
      hasTokenMatching(successCardTokens, /(^|:)bg-success(?:\/.+)?$/),
    ).toBe(true);
    expect(correctAnswerRow).not.toBeUndefined();
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(successCardText).toContain('B');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
    expect(correctAnswerText).not.toBeUndefined();
    expect(correctAnswerExplanation).not.toBeUndefined();
  });

  it('renders explanation fallback when no correct choice exists in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd={null}
        selectedChoiceId="choice-a"
        choiceExplanations={[incorrectChoiceA, incorrectChoiceB]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const explanationLabel = findSectionLabel(doc, 'Explanation');
    const successCard = explanationLabel?.nextElementSibling;
    const fallbackParagraph = Array.from(
      successCard?.querySelectorAll('p') ?? [],
    ).find(
      (paragraph) =>
        paragraph.textContent?.trim() === 'Explanation not available.',
    );

    expect(html).not.toContain('Your answer');
    expect(explanationLabel).not.toBeUndefined();
    expectNeutralChip(explanationLabel);
    expect(fallbackParagraph).not.toBeUndefined();
  });

  it('T5: keeps wrong-answer cards on neutral styling only', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCards = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).filter((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        hasTokenMatching(classTokens, /(^|:)border-border(?:\/.+)?$/) &&
        hasTokenMatching(classTokens, /(^|:)bg-background(?:\/.+)?$/)
      );
    });

    const expectedWrongChoices = [
      {
        label: 'B',
        answerText: 'Second option',
        explanationText: 'Second option is incorrect.',
      },
    ];

    expect(wrongAnswersHeading).not.toBeUndefined();
    expectNeutralChip(wrongAnswersHeading);
    expect(wrongAnswerCards.length).toBe(expectedWrongChoices.length);
    for (const [index, card] of wrongAnswerCards.entries()) {
      const className = card.getAttribute('class') ?? '';
      const classTokens = getClassTokens(className);
      const expectedChoice = expectedWrongChoices[index];
      const answerRow = findAnswerRow(
        card,
        expectedChoice.label,
        expectedChoice.answerText,
      );
      const answerBadge = findRoundedBadge(card, expectedChoice.label);
      const answerText = findMarkdownWrapper(card, expectedChoice.answerText);
      const explanationText = findMarkdownWrapper(
        card,
        expectedChoice.explanationText,
      );

      expect(
        hasTokenMatching(classTokens, /(^|:)border-border(?:\/.+)?$/),
      ).toBe(true);
      expect(
        hasTokenMatching(classTokens, /(^|:)bg-background(?:\/.+)?$/),
      ).toBe(true);
      expect(
        hasTokenMatching(classTokens, /(^|:)border-success(?:\/\d+)?$/),
      ).toBe(false);
      expect(hasTokenMatching(classTokens, /(^|:)bg-success(?:\/\d+)?$/)).toBe(
        false,
      );
      expect(
        hasTokenMatching(classTokens, /(^|:)border-destructive(?:\/\d+)?$/),
      ).toBe(false);
      expect(
        hasTokenMatching(classTokens, /(^|:)bg-destructive(?:\/\d+)?$/),
      ).toBe(false);
      expect(answerRow).not.toBeUndefined();
      expect(answerBadge).not.toBeUndefined();
      expect(answerText).not.toBeUndefined();
      expect(explanationText).not.toBeUndefined();
    }
  });

  it('renders neutral wrong-answer cards in correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswersSectionText).toContain('First option is incorrect.');
    expect(wrongAnswersSectionText).toContain('Second option is incorrect.');
  });

  it('renders neutral wrong-answer cards in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswersSectionText).toContain('Second option is incorrect.');
    expect(wrongAnswersSectionText).not.toContain('First option is incorrect.');
  });

  it('renders correct answer details when a correct choice is present', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={choicesWithCorrectB}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = findSectionLabel(doc, 'Correct Answer');
    const successCard = correctAnswerLabel?.nextElementSibling;
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;

    expect(html).toContain('Correct Answer');
    expectCorrectChip(correctAnswerLabel);
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(html).toContain('Second option');
    expect(correctAnswerText).not.toBeUndefined();
    expect(findSectionLabel(doc, 'Explanation')).toBeUndefined();
  });

  it('falls back to explanation heading when no correct choice details are available', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={false} explanationMd="General explanation." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const explanationLabel = findSectionLabel(doc, 'Explanation');

    expectNeutralChip(explanationLabel);
    expect(explanationLabel?.textContent?.trim()).toBe('Explanation');
    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
  });

  it('renders non-null choice explanations in display-label order', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={[
          incorrectChoiceA,
          { ...correctChoiceB, explanationMd: null },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCard = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        hasTokenMatching(classTokens, /(^|:)border-border(?:\/.+)?$/) &&
        hasTokenMatching(classTokens, /(^|:)bg-background(?:\/.+)?$/)
      );
    });
    const wrongAnswerRow = wrongAnswerCard
      ? findAnswerRow(wrongAnswerCard, 'A', 'First option')
      : undefined;
    const wrongAnswerBadge = wrongAnswerCard
      ? findRoundedBadge(wrongAnswerCard, 'A')
      : undefined;
    const wrongAnswerText = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option')
      : undefined;
    const wrongAnswerExplanation = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option is incorrect.')
      : undefined;
    const wrongAnswersSectionText = wrongAnswersSection?.textContent ?? '';

    expectNeutralChip(wrongAnswersHeading);
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
    expect(wrongAnswerCard).not.toBeUndefined();
    expect(wrongAnswerRow).not.toBeUndefined();
    expect(wrongAnswerBadge).not.toBeUndefined();
    expect(wrongAnswerText).not.toBeUndefined();
    expect(wrongAnswerExplanation).not.toBeUndefined();
    expect(wrongAnswersSectionText).toContain('First option');
    expect(wrongAnswersSectionText).toContain('First option is incorrect.');
    expect(wrongAnswersSectionText).not.toContain('Second option');
  });

  it('renders available wrong-answer cards in correct flow when a sibling incorrect explanation is blank', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        choiceExplanations={[
          incorrectChoiceA,
          { ...incorrectChoiceB, explanationMd: '   ' },
          correctChoiceC,
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expectNeutralChip(wrongAnswersHeading);
    expect(wrongAnswersSectionText).toContain('First option');
    expect(wrongAnswersSectionText).toContain('First option is incorrect.');
    expect(wrongAnswersSectionText).not.toContain('Second option');
    expect(wrongAnswersSectionText).not.toContain('Third option');
  });

  it('falls back to general explanation when an incorrect choice explanation is missing', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="Fallback explanation."
        choiceExplanations={[
          { ...incorrectChoiceA, explanationMd: null },
          { ...correctChoiceB, explanationMd: 'Correct rationale.' },
        ]}
      />,
    );

    expect(html).toContain('Fallback explanation.');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
  });

  it('renders reference section when referenceMd is provided', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="Because..."
        referenceMd="Anton RF et al. JAMA. 2006;295(17):2003-2017."
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const referenceLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Reference',
    );
    const referenceContent = findMarkdownWrapper(
      doc,
      'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    );

    expect(referenceLabel).not.toBeUndefined();
    expect(referenceContent).not.toBeUndefined();
    expect(html).toContain('Reference');
    expect(html).toContain('Anton RF et al. JAMA. 2006;295(17):2003-2017.');
  });

  it('keeps reference content grouped under the reference label', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="Because..."
        referenceMd="Anton RF et al. JAMA. 2006;295(17):2003-2017."
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const referenceLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Reference',
    );
    const referenceSection = referenceLabel?.parentElement;
    const referenceSectionText = referenceSection?.textContent ?? '';

    expect(referenceLabel).not.toBeUndefined();
    expect(referenceSection).not.toBeNull();
    expect(referenceSectionText).toContain('Reference');
    expect(referenceSectionText).toContain(
      'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    );
  });

  it('does not render reference section when referenceMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="Because..."
        referenceMd={null}
      />,
    );

    expect(html).not.toContain('Reference');
  });

  it('renders incorrect-flow correct-answer and wrong-answer detail sections', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={choicesWithCorrectB}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = findSectionLabel(doc, 'Correct Answer');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCard = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        hasTokenMatching(classTokens, /(^|:)border-border(?:\/.+)?$/) &&
        hasTokenMatching(classTokens, /(^|:)bg-background(?:\/.+)?$/)
      );
    });
    const wrongAnswerRow = wrongAnswerCard
      ? findAnswerRow(wrongAnswerCard, 'A', 'First option')
      : undefined;
    const wrongAnswerText = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option')
      : undefined;
    const wrongAnswerExplanation = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option is incorrect.')
      : undefined;

    expectCorrectChip(correctAnswerLabel);
    expectNeutralChip(wrongAnswersHeading);
    expect(wrongAnswerRow).not.toBeUndefined();
    expect(wrongAnswerText).not.toBeUndefined();
    expect(wrongAnswerExplanation).not.toBeUndefined();
  });

  it('renders the your-answer section before the correct-answer section for incorrect attempts', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const verdictPill = Array.from(doc.querySelectorAll('div, span')).find(
      (element) =>
        element.textContent?.trim() === 'Incorrect' &&
        (element.getAttribute('class') ?? '').includes('self-start'),
    );
    const correctAnswerLabel = findSectionLabel(doc, 'Correct Answer');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive'],
      { label: 'A', text: 'First option' },
    );
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;

    expect(verdictPill?.textContent?.trim()).toBe('Incorrect');
    expect(yourAnswerSectionLabel).toBeUndefined();
    expectNodeBefore(destructiveCard, correctAnswerLabel);
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(html).toContain('First option');
    expect(html).toContain('First option is incorrect.');
    expect(yourAnswerText).not.toBeUndefined();
  });

  it('excludes the user-selected wrong choice from why-other-answers cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswersSectionText).toContain('Second option');
    expect(wrongAnswersSectionText).not.toContain('First option');
    expect(html).toContain('First option');
  });

  it('does not render a your-answer badge in incorrect-flow wrong-answer cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(html).not.toContain('Your answer');
    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswersSectionText).not.toContain('Your answer');
  });

  it('keeps the correct-answer flow layout unchanged', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        selectedChoiceId="choice-c"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );
    const correctAnswerCard = findStyledCard(doc, ['rounded-xl'], {
      label: 'C',
      text: 'Third option',
    });
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );

    expectNodeBefore(correctAnswerCard, wrongAnswersHeading);
    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
    expect(findSectionLabel(doc, 'Explanation')).toBeUndefined();
    expect(yourAnswerSectionLabel).toBeUndefined();
  });

  it('renders explanation-not-available fallback in correct flow when explanationMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd={null}
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(findSectionLabel(doc, 'Correct Answer')).toBeUndefined();
    expect(html).toContain('Explanation not available.');
  });

  it('preserves the clinical pearl callout inside the correct-answer explanation', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd={
          'Main explanation.\n\n**Clinical Pearl:** Always verify the pearl.'
        }
        choiceExplanations={[
          {
            ...incorrectChoiceA,
            isCorrect: true,
            explanationMd: 'Correct rationale.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clinicalPearlCallout = Array.from(doc.querySelectorAll('div')).find(
      (div) => {
        const classTokens = getClassTokens(div.getAttribute('class') ?? '');
        return (
          classTokens.has('border-l-2') &&
          div.textContent?.includes('Clinical Pearl') &&
          div.textContent?.includes('Always verify the pearl.')
        );
      },
    );

    expect(clinicalPearlCallout).not.toBeUndefined();
  });

  it('does not render a your-answer badge in correct-flow wrong-answer cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        selectedChoiceId="choice-b"
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswersSectionText).not.toContain('Your answer');
    expect(html).not.toContain('Your answer');
  });

  it('renders your-answer choice details when selected wrong explanation is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          { ...incorrectChoiceA, explanationMd: null },
          incorrectChoiceB,
          correctChoiceC,
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive'],
      { label: 'A', text: 'First option' },
    );
    const yourAnswerRow = destructiveCard
      ? findAnswerRow(destructiveCard, 'A', 'First option')
      : undefined;
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;
    const wrongAnswersHeading = findSectionLabel(
      doc,
      'Why Other Answers Are Wrong',
    );
    const wrongAnswersSectionText =
      wrongAnswersHeading?.parentElement?.textContent ?? '';

    expect(html).not.toContain('Your answer');
    expect(destructiveCard).not.toBeUndefined();
    expect(yourAnswerRow).not.toBeUndefined();
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(html).toContain('First option');
    expectNeutralChip(wrongAnswersHeading);
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
    expect(wrongAnswersSectionText).toContain('Second option');
    expect(wrongAnswersSectionText).toContain('Second option is incorrect.');
    expect(wrongAnswersSectionText).not.toContain('First option');
    expect(html).toContain('General explanation.');
    expect(yourAnswerText).not.toBeUndefined();
  });

  it('falls back gracefully when selectedChoiceId is null in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId={null}
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct Answer');
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
    expect(html).toContain('First option');
  });

  it('falls back gracefully when selectedChoiceId is unknown in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-missing"
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct Answer');
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
    expect(html).toContain('First option');
  });

  it('does not render your-answer section when incorrect flow selectedChoiceId points to the correct choice', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-b"
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct Answer');
    expect(html).toContain('Why Other Answers Are Wrong');
    expect(html).not.toContain('Why Other Answers Are Wrong:');
    expect(html).toContain('First option');
  });

  it('renders explanation-not-available fallback in incorrect flow when explanationMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd={null}
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    expect(html).not.toContain('Your answer');
    expect(html).toContain('Correct Answer');
    expect(html).toContain('Explanation not available.');
  });

  it('marks the selected wrong choice as your answer', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={choicesWithCorrectC}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive'],
      { label: 'A', text: 'First option' },
    );

    expect(destructiveCard).not.toBeUndefined();
    expect(html).not.toContain('Your answer');
  });
});
