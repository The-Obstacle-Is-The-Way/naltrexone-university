// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Feedback: typeof import('@/components/question/feedback').Feedback;

beforeAll(async () => {
  ({ Feedback } = await import('@/components/question/feedback'));
});

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
    expect(card?.getAttribute('class')).not.toContain('bg-success/10');
    expect(card?.getAttribute('class')).not.toContain('border-destructive');
    expect(card?.getAttribute('class')).not.toContain('bg-destructive/10');
    expect(verdictBadge).not.toBeUndefined();
    expect(verdictBadge?.getAttribute('class')).toContain('rounded-full');
    expect(verdictBadge?.getAttribute('class')).toContain('self-start');
    expect(verdictBadge?.getAttribute('class')).toContain('bg-success');
    expect(verdictBadge?.getAttribute('class')).toContain(
      'text-success-foreground',
    );
    expect(html).toContain('Correct');
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

  it('T1: wraps correct-flow correct-answer content in a success card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option rationale.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-success/60', 'bg-success/5', 'p-4'],
      { label: 'B', text: 'Second option' },
    );
    const successCardClassName = successCard?.getAttribute('class') ?? '';
    const successCardTokens = getClassTokens(successCardClassName);
    const successCardText = successCard?.textContent ?? '';
    const correctAnswerRow = successCard
      ? findAnswerRow(successCard, 'B', 'Second option')
      : undefined;
    const correctAnswerRowTokens = getClassTokens(
      correctAnswerRow?.getAttribute('class') ?? '',
    );
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerBadgeTokens = getClassTokens(
      correctAnswerBadge?.getAttribute('class') ?? '',
    );
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;
    const correctAnswerTextTokens = getClassTokens(
      correctAnswerText?.getAttribute('class') ?? '',
    );
    const correctAnswerExplanation = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;
    const correctAnswerExplanationTokens = getClassTokens(
      correctAnswerExplanation?.getAttribute('class') ?? '',
    );

    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardTokens.has('p-4')).toBe(true);
    expect(successCardTokens.has('mt-2')).toBe(false);
    expect(correctAnswerRow).not.toBeUndefined();
    expect(correctAnswerRowTokens.has('gap-3')).toBe(true);
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(correctAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expectTokens(
      correctAnswerBadgeTokens,
      ['border-success', 'bg-success/15', 'text-success'],
      ['border-border', 'bg-muted', 'text-foreground'],
    );
    expect(successCardText).toContain('B');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('>Explanation<');
    expect(correctAnswerText).not.toBeUndefined();
    expect(correctAnswerTextTokens.has('text-base')).toBe(true);
    expect(correctAnswerTextTokens.has('text-foreground')).toBe(true);
    expect(correctAnswerTextTokens.has('text-muted-foreground')).toBe(false);
    expect(correctAnswerExplanation).not.toBeUndefined();
    expect(correctAnswerExplanationTokens.has('text-base')).toBe(true);
    expect(correctAnswerExplanationTokens.has('text-foreground')).toBe(true);
    expect(correctAnswerExplanationTokens.has('text-sm')).toBe(false);
    expect(correctAnswerExplanationTokens.has('text-muted-foreground')).toBe(
      false,
    );
  });

  it('T2: wraps explanation-only fallback in a success card for correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="General explanation." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = findStyledCard(doc, [
      'rounded-xl',
      'border-success/60',
      'bg-success/5',
    ]);
    const successCardClassName = successCard?.getAttribute('class') ?? '';
    const successCardTokens = getClassTokens(successCardClassName);
    const successCardText = successCard?.textContent ?? '';
    const explanationText = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;
    const explanationTextTokens = getClassTokens(
      explanationText?.getAttribute('class') ?? '',
    );

    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardTokens.has('mt-2')).toBe(false);
    expect(successCardText).toContain('General explanation.');
    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('>Explanation<');
    expect(explanationText).not.toBeUndefined();
    expect(explanationTextTokens.has('text-base')).toBe(true);
    expect(explanationTextTokens.has('text-foreground')).toBe(true);
    expect(explanationTextTokens.has('text-sm')).toBe(false);
    expect(explanationTextTokens.has('text-muted-foreground')).toBe(false);
    expect(successCardText).not.toContain('A)');
    expect(successCardText).not.toContain('B)');
  });

  it('renders explanation fallback without top margin when no correct choice exists in correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd={null} />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const successCard = findStyledCard(doc, [
      'rounded-xl',
      'border-success/60',
      'bg-success/5',
    ]);
    const fallbackParagraph = Array.from(
      successCard?.querySelectorAll('p') ?? [],
    ).find(
      (paragraph) =>
        paragraph.textContent?.trim() === 'Explanation not available.',
    );
    const fallbackClassName = fallbackParagraph?.getAttribute('class') ?? '';

    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('>Explanation<');
    expect(fallbackParagraph).not.toBeUndefined();
    expect(fallbackClassName).toContain('text-sm');
    expect(fallbackClassName).toContain('text-muted-foreground');
    expect(fallbackClassName).not.toContain('text-base');
    expect(fallbackClassName).not.toContain('text-foreground');
    expect(fallbackClassName).not.toContain('mt-2');
  });

  it('T3: wraps incorrect-flow your-answer content in a destructive card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option rationale.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive', 'bg-destructive/5', 'p-4'],
      { label: 'A', text: 'First option' },
    );
    const destructiveCardClassName =
      destructiveCard?.getAttribute('class') ?? '';
    const destructiveCardTokens = getClassTokens(destructiveCardClassName);
    const destructiveCardText = destructiveCard?.textContent ?? '';
    const yourAnswerRow = destructiveCard
      ? findAnswerRow(destructiveCard, 'A', 'First option')
      : undefined;
    const yourAnswerRowTokens = getClassTokens(
      yourAnswerRow?.getAttribute('class') ?? '',
    );
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerBadgeTokens = getClassTokens(
      yourAnswerBadge?.getAttribute('class') ?? '',
    );
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;
    const yourAnswerTextTokens = getClassTokens(
      yourAnswerText?.getAttribute('class') ?? '',
    );
    const yourAnswerExplanation = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option is incorrect.')
      : undefined;
    const yourAnswerExplanationTokens = getClassTokens(
      yourAnswerExplanation?.getAttribute('class') ?? '',
    );

    expect(destructiveCard).not.toBeNull();
    expect(destructiveCardTokens.has('border-destructive')).toBe(true);
    expect(destructiveCardTokens.has('border-destructive/20')).toBe(false);
    expect(destructiveCardTokens.has('border-destructive/30')).toBe(false);
    expect(destructiveCardTokens.has('bg-destructive/5')).toBe(true);
    expect(destructiveCardTokens.has('p-4')).toBe(true);
    expect(destructiveCardTokens.has('mt-2')).toBe(false);
    expect(yourAnswerRow).not.toBeUndefined();
    expect(yourAnswerRowTokens.has('gap-3')).toBe(true);
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(yourAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expectTokens(
      yourAnswerBadgeTokens,
      ['border-destructive', 'bg-destructive/15', 'text-destructive'],
      ['border-border', 'bg-muted', 'text-foreground'],
    );
    expect(destructiveCardText).toContain('A');
    expect(destructiveCardText).toContain('First option');
    expect(destructiveCardText).toContain('First option is incorrect.');
    expect(html).not.toContain('Your answer');
    expect(yourAnswerText).not.toBeUndefined();
    expect(yourAnswerTextTokens.has('text-base')).toBe(true);
    expect(yourAnswerTextTokens.has('text-foreground')).toBe(true);
    expect(yourAnswerTextTokens.has('text-muted-foreground')).toBe(false);
    expect(yourAnswerExplanation).not.toBeUndefined();
    expect(yourAnswerExplanationTokens.has('text-base')).toBe(true);
    expect(yourAnswerExplanationTokens.has('text-foreground')).toBe(true);
    expect(yourAnswerExplanationTokens.has('text-sm')).toBe(false);
    expect(yourAnswerExplanationTokens.has('text-muted-foreground')).toBe(
      false,
    );
  });

  it('T4: wraps incorrect-flow correct-answer content in a success card', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option rationale.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Correct answer',
    );
    const successCard = correctAnswerLabel?.nextElementSibling;
    const successCardClassName = successCard?.getAttribute('class') ?? '';
    const successCardTokens = getClassTokens(successCardClassName);
    const successCardText = successCard?.textContent ?? '';
    const correctAnswerRow = successCard
      ? findAnswerRow(successCard, 'B', 'Second option')
      : undefined;
    const correctAnswerRowTokens = getClassTokens(
      correctAnswerRow?.getAttribute('class') ?? '',
    );
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerBadgeTokens = getClassTokens(
      correctAnswerBadge?.getAttribute('class') ?? '',
    );
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;
    const correctAnswerTextTokens = getClassTokens(
      correctAnswerText?.getAttribute('class') ?? '',
    );
    const correctAnswerExplanation = successCard
      ? findMarkdownWrapper(successCard, 'General explanation.')
      : undefined;
    const correctAnswerExplanationTokens = getClassTokens(
      correctAnswerExplanation?.getAttribute('class') ?? '',
    );

    expect(correctAnswerLabel).not.toBeUndefined();
    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardTokens.has('p-4')).toBe(true);
    expect(correctAnswerRow).not.toBeUndefined();
    expect(correctAnswerRowTokens.has('gap-3')).toBe(true);
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(correctAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expectTokens(
      correctAnswerBadgeTokens,
      ['border-success', 'bg-success/15', 'text-success'],
      ['border-border', 'bg-muted', 'text-foreground'],
    );
    expect(successCardText).toContain('B');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
    expect(correctAnswerText).not.toBeUndefined();
    expect(correctAnswerTextTokens.has('text-base')).toBe(true);
    expect(correctAnswerTextTokens.has('text-foreground')).toBe(true);
    expect(correctAnswerTextTokens.has('text-muted-foreground')).toBe(false);
    expect(correctAnswerExplanation).not.toBeUndefined();
    expect(correctAnswerExplanationTokens.has('text-base')).toBe(true);
    expect(correctAnswerExplanationTokens.has('text-foreground')).toBe(true);
    expect(correctAnswerExplanationTokens.has('text-sm')).toBe(false);
    expect(correctAnswerExplanationTokens.has('text-muted-foreground')).toBe(
      false,
    );
  });

  it('renders explanation fallback without top margin when no correct choice exists in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd={null}
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const explanationLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Explanation',
    );
    const successCard = explanationLabel?.nextElementSibling;
    const fallbackParagraph = Array.from(
      successCard?.querySelectorAll('p') ?? [],
    ).find(
      (paragraph) =>
        paragraph.textContent?.trim() === 'Explanation not available.',
    );
    const fallbackClassName = fallbackParagraph?.getAttribute('class') ?? '';

    expect(html).not.toContain('Your answer');
    expect(explanationLabel).not.toBeUndefined();
    expect(fallbackParagraph).not.toBeUndefined();
    expect(fallbackClassName).toContain('text-sm');
    expect(fallbackClassName).toContain('text-muted-foreground');
    expect(fallbackClassName).not.toContain('text-base');
    expect(fallbackClassName).not.toContain('text-foreground');
    expect(fallbackClassName).not.toContain('mt-2');
  });

  it('T5: keeps wrong-answer cards on neutral styling only', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCards = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).filter((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('border-border/60') &&
        className.includes('bg-background/50')
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
      const answerRowTokens = getClassTokens(
        answerRow?.getAttribute('class') ?? '',
      );
      const answerBadge = findRoundedBadge(card, expectedChoice.label);
      const answerBadgeTokens = getClassTokens(
        answerBadge?.getAttribute('class') ?? '',
      );
      const answerText = findMarkdownWrapper(card, expectedChoice.answerText);
      const answerTextTokens = getClassTokens(
        answerText?.getAttribute('class') ?? '',
      );
      const explanationText = findMarkdownWrapper(
        card,
        expectedChoice.explanationText,
      );
      const explanationTextTokens = getClassTokens(
        explanationText?.getAttribute('class') ?? '',
      );

      expect(classTokens.has('border-border/60')).toBe(true);
      expect(classTokens.has('bg-background/50')).toBe(true);
      expect(classTokens.has('p-4')).toBe(true);
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
      expect(answerRowTokens.has('gap-3')).toBe(true);
      expect(answerRowTokens.has('text-muted-foreground')).toBe(false);
      expect(answerBadge).not.toBeUndefined();
      expect(answerBadge?.getAttribute('class')).toContain('rounded-full');
      expectTokens(
        answerBadgeTokens,
        ['border-border', 'bg-muted', 'text-foreground'],
        ['border-success', 'bg-success/15', 'text-success'],
      );
      expectTokens(
        answerBadgeTokens,
        [],
        ['border-destructive', 'bg-destructive/15', 'text-destructive'],
      );
      expect(answerText).not.toBeUndefined();
      expect(answerTextTokens.has('text-base')).toBe(true);
      expect(answerTextTokens.has('text-foreground')).toBe(true);
      expect(answerTextTokens.has('text-muted-foreground')).toBe(false);
      expect(explanationText).not.toBeUndefined();
      expect(explanationTextTokens.has('text-base')).toBe(true);
      expect(explanationTextTokens.has('text-foreground')).toBe(true);
      expect(explanationTextTokens.has('text-sm')).toBe(false);
      expect(explanationTextTokens.has('text-muted-foreground')).toBe(false);
    }
  });

  it('adds dark boundary overrides to correct-flow neutral wrong-answer cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCards = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).filter((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('border-border/60') &&
        classTokens.has('bg-background/50')
      );
    });

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswerCards.length).toBeGreaterThan(0);
    for (const card of wrongAnswerCards) {
      const classTokens = getClassTokens(card.getAttribute('class') ?? '');
      const explanationWrapper =
        findMarkdownWrapper(card, 'First option is incorrect.') ??
        findMarkdownWrapper(card, 'Second option is incorrect.');
      const explanationWrapperTokens = getClassTokens(
        explanationWrapper?.getAttribute('class') ?? '',
      );
      expect(classTokens.has('dark:border-foreground/40')).toBe(true);
      expect(explanationWrapper).not.toBeUndefined();
      expect(explanationWrapperTokens.has('text-base')).toBe(true);
      expect(explanationWrapperTokens.has('text-foreground')).toBe(true);
      expect(explanationWrapperTokens.has('text-sm')).toBe(false);
      expect(explanationWrapperTokens.has('text-muted-foreground')).toBe(false);
    }
  });

  it('adds dark boundary overrides to incorrect-flow neutral wrong-answer cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCards = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).filter((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('border-border/60') &&
        classTokens.has('bg-background/50')
      );
    });

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswerCards.length).toBeGreaterThan(0);
    for (const card of wrongAnswerCards) {
      const classTokens = getClassTokens(card.getAttribute('class') ?? '');
      expect(classTokens.has('dark:border-foreground/40')).toBe(true);
    }
  });

  it('renders correct answer details when a correct choice is present', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option rationale.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Correct answer',
    );
    const successCard = correctAnswerLabel?.nextElementSibling;
    const correctAnswerBadge = successCard
      ? findRoundedBadge(successCard, 'B')
      : undefined;
    const correctAnswerBadgeTokens = getClassTokens(
      correctAnswerBadge?.getAttribute('class') ?? '',
    );
    const correctAnswerText = successCard
      ? findMarkdownWrapper(successCard, 'Second option')
      : undefined;
    const correctAnswerTextTokens = getClassTokens(
      correctAnswerText?.getAttribute('class') ?? '',
    );

    expect(html).toContain('Correct answer');
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(correctAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expectTokens(correctAnswerBadgeTokens, [
      'border-success',
      'bg-success/15',
      'text-success',
    ]);
    expect(html).toContain('Second option');
    expect(correctAnswerTextTokens.has('text-base')).toBe(true);
    expect(correctAnswerTextTokens.has('text-foreground')).toBe(true);
    expect(html).not.toContain('>Explanation<');
  });

  it('falls back to explanation heading when no correct choice details are available', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={false} explanationMd="General explanation." />,
    );

    expect(html).toContain('>Explanation<');
    expect(html).not.toContain('Correct answer');
  });

  it('renders non-null choice explanations in display-label order', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: null,
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCard = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('border-border/60') &&
        classTokens.has('bg-background/50')
      );
    });
    const wrongAnswerRow = wrongAnswerCard
      ? findAnswerRow(wrongAnswerCard, 'A', 'First option')
      : undefined;
    const wrongAnswerRowTokens = getClassTokens(
      wrongAnswerRow?.getAttribute('class') ?? '',
    );
    const wrongAnswerBadge = wrongAnswerCard
      ? findRoundedBadge(wrongAnswerCard, 'A')
      : undefined;
    const wrongAnswerBadgeTokens = getClassTokens(
      wrongAnswerBadge?.getAttribute('class') ?? '',
    );
    const wrongAnswerText = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option')
      : undefined;
    const wrongAnswerTextTokens = getClassTokens(
      wrongAnswerText?.getAttribute('class') ?? '',
    );
    const wrongAnswerExplanation = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option is incorrect.')
      : undefined;
    const wrongAnswerExplanationTokens = getClassTokens(
      wrongAnswerExplanation?.getAttribute('class') ?? '',
    );
    const wrongAnswersSectionText = wrongAnswersSection?.textContent ?? '';

    expect(html).toContain('Why other answers are wrong:');
    expect(wrongAnswerCard).not.toBeUndefined();
    expect(wrongAnswerRow).not.toBeUndefined();
    expect(wrongAnswerRowTokens.has('gap-3')).toBe(true);
    expect(wrongAnswerBadge).not.toBeUndefined();
    expect(wrongAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expectTokens(
      wrongAnswerBadgeTokens,
      ['border-border', 'bg-muted', 'text-foreground'],
      ['border-success', 'bg-success/15', 'text-success'],
    );
    expectTokens(
      wrongAnswerBadgeTokens,
      [],
      ['border-destructive', 'bg-destructive/15', 'text-destructive'],
    );
    expect(wrongAnswerText).not.toBeUndefined();
    expect(wrongAnswerTextTokens.has('text-base')).toBe(true);
    expect(wrongAnswerTextTokens.has('text-foreground')).toBe(true);
    expect(wrongAnswerTextTokens.has('text-muted-foreground')).toBe(false);
    expect(wrongAnswerExplanation).not.toBeUndefined();
    expect(wrongAnswerExplanationTokens.has('text-base')).toBe(true);
    expect(wrongAnswerExplanationTokens.has('text-foreground')).toBe(true);
    expect(wrongAnswerExplanationTokens.has('text-sm')).toBe(false);
    expect(wrongAnswerExplanationTokens.has('text-muted-foreground')).toBe(
      false,
    );
    expect(wrongAnswersSectionText).toContain('First option');
    expect(wrongAnswersSectionText).toContain('First option is incorrect.');
    expect(wrongAnswersSectionText).not.toContain('Second option');
  });

  it('falls back to general explanation when an incorrect choice explanation is missing', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="Fallback explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: null,
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Correct rationale.',
          },
        ]}
      />,
    );

    expect(html).toContain('Fallback explanation.');
    expect(html).not.toContain('Why other answers are wrong:');
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
    const referenceContentTokens = getClassTokens(
      referenceContent?.getAttribute('class') ?? '',
    );

    expect(referenceLabel).not.toBeUndefined();
    expect(referenceLabel?.getAttribute('class')).toContain('font-semibold');
    expect(referenceLabel?.getAttribute('class')).toContain('uppercase');
    expect(referenceLabel?.getAttribute('class')).toContain('tracking-wide');
    expect(referenceContent).not.toBeUndefined();
    expect(referenceContentTokens.has('mt-1')).toBe(true);
    expect(referenceContentTokens.has('text-sm')).toBe(true);
    expect(referenceContentTokens.has('text-xs')).toBe(false);
    expect(html).toContain('Reference');
    expect(html).toContain('Anton RF et al. JAMA. 2006;295(17):2003-2017.');
  });

  it('adds a dark boundary override to the reference separator', () => {
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
    const referenceClassTokens = getClassTokens(
      referenceSection?.getAttribute('class') ?? '',
    );

    expect(referenceLabel).not.toBeUndefined();
    expect(referenceSection).not.toBeNull();
    expect(referenceClassTokens.has('border-t')).toBe(true);
    expect(referenceClassTokens.has('border-border/40')).toBe(true);
    expect(referenceClassTokens.has('dark:border-foreground/40')).toBe(true);
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

  it('uses larger verdict-to-explanation spacing and promotes wrong-answer explanation readability', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option rationale.',
          },
        ]}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const correctAnswerLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Correct answer',
    );
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
    );
    const wrongAnswersSection = wrongAnswersHeading?.parentElement;
    const wrongAnswerCard = Array.from(
      wrongAnswersSection?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const classTokens = getClassTokens(div.getAttribute('class') ?? '');
      return (
        classTokens.has('border-border/60') &&
        classTokens.has('bg-background/50')
      );
    });
    const wrongAnswerRow = wrongAnswerCard
      ? findAnswerRow(wrongAnswerCard, 'A', 'First option')
      : undefined;
    const wrongAnswerRowTokens = getClassTokens(
      wrongAnswerRow?.getAttribute('class') ?? '',
    );
    const wrongAnswerText = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option')
      : undefined;
    const wrongAnswerTextTokens = getClassTokens(
      wrongAnswerText?.getAttribute('class') ?? '',
    );
    const wrongAnswerExplanation = wrongAnswerCard
      ? findMarkdownWrapper(wrongAnswerCard, 'First option is incorrect.')
      : undefined;
    const wrongAnswerExplanationTokens = getClassTokens(
      wrongAnswerExplanation?.getAttribute('class') ?? '',
    );

    expect(correctAnswerLabel?.parentElement?.getAttribute('class')).toContain(
      'mt-6',
    );
    expect(wrongAnswerRow).not.toBeUndefined();
    expect(wrongAnswerRowTokens.has('gap-3')).toBe(true);
    expect(wrongAnswerTextTokens.has('text-muted-foreground')).toBe(false);
    expect(wrongAnswerExplanation).not.toBeUndefined();
    expect(wrongAnswerExplanationTokens.has('text-base')).toBe(true);
    expect(wrongAnswerExplanationTokens.has('text-foreground')).toBe(true);
    expect(wrongAnswerExplanationTokens.has('text-sm')).toBe(false);
    expect(wrongAnswerExplanationTokens.has('text-muted-foreground')).toBe(
      false,
    );
  });

  it('renders the your-answer section before the correct-answer section for incorrect attempts', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const incorrectIndex = html.indexOf('Incorrect');
    const correctAnswerIndex = html.indexOf('Correct answer');
    const yourAnswerIndex = html.indexOf('Your answer');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive', 'bg-destructive/5', 'p-4'],
      { label: 'A', text: 'First option' },
    );
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;
    const yourAnswerTextTokens = getClassTokens(
      yourAnswerText?.getAttribute('class') ?? '',
    );

    expect(yourAnswerIndex).toBe(-1);
    expect(incorrectIndex).toBeGreaterThanOrEqual(0);
    expect(correctAnswerIndex).toBeGreaterThanOrEqual(0);
    expect(incorrectIndex).toBeLessThan(correctAnswerIndex);
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(yourAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expect(html).toContain('First option');
    expect(html).toContain('First option is incorrect.');
    expect(yourAnswerTextTokens.has('text-base')).toBe(true);
    expect(yourAnswerTextTokens.has('text-foreground')).toBe(true);
  });

  it('excludes the user-selected wrong choice from why-other-answers cards', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
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
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
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
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );
    const correctChoiceIndex = html.indexOf('Third option');
    const wrongAnswersHeadingIndex = html.indexOf(
      'Why other answers are wrong:',
    );

    expect(correctChoiceIndex).toBeGreaterThanOrEqual(0);
    expect(wrongAnswersHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(correctChoiceIndex).toBeLessThan(wrongAnswersHeadingIndex);
    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('>Explanation<');
    expect(yourAnswerSectionLabel).toBeUndefined();
  });

  it('renders explanation-not-available fallback in correct flow when explanationMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={true}
        explanationMd={null}
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    expect(html).not.toContain('Correct answer');
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
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
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
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrongAnswersHeading = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Why other answers are wrong:',
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
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: null,
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive', 'bg-destructive/5', 'p-4'],
      { label: 'A', text: 'First option' },
    );
    const destructiveCardTokens = getClassTokens(
      destructiveCard?.getAttribute('class') ?? '',
    );
    const yourAnswerRow = destructiveCard
      ? findAnswerRow(destructiveCard, 'A', 'First option')
      : undefined;
    const yourAnswerRowTokens = getClassTokens(
      yourAnswerRow?.getAttribute('class') ?? '',
    );
    const yourAnswerBadge = destructiveCard
      ? findRoundedBadge(destructiveCard, 'A')
      : undefined;
    const yourAnswerText = destructiveCard
      ? findMarkdownWrapper(destructiveCard, 'First option')
      : undefined;
    const yourAnswerTextTokens = getClassTokens(
      yourAnswerText?.getAttribute('class') ?? '',
    );

    expect(html).not.toContain('Your answer');
    expect(destructiveCardTokens.has('p-4')).toBe(true);
    expect(destructiveCardTokens.has('mt-2')).toBe(false);
    expect(yourAnswerRow).not.toBeUndefined();
    expect(yourAnswerRowTokens.has('gap-3')).toBe(true);
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(yourAnswerBadge?.getAttribute('class')).toContain('rounded-full');
    expect(html).toContain('First option');
    expect(html).not.toContain('Why other answers are wrong:');
    expect(html).toContain('General explanation.');
    expect(yourAnswerTextTokens.has('text-base')).toBe(true);
    expect(yourAnswerTextTokens.has('text-foreground')).toBe(true);
  });

  it('falls back gracefully when selectedChoiceId is null in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId={null}
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct answer');
    expect(html).toContain('Why other answers are wrong:');
    expect(html).toContain('First option');
  });

  it('falls back gracefully when selectedChoiceId is unknown in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-missing"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct answer');
    expect(html).toContain('Why other answers are wrong:');
    expect(html).toContain('First option');
  });

  it('does not render your-answer section when incorrect flow selectedChoiceId points to the correct choice', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-b"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );

    expect(yourAnswerSectionLabel).toBeUndefined();
    expect(html).toContain('Correct answer');
    expect(html).toContain('Why other answers are wrong:');
    expect(html).toContain('First option');
  });

  it('renders explanation-not-available fallback in incorrect flow when explanationMd is null', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd={null}
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: true,
            explanationMd: 'Second option is correct.',
          },
        ]}
      />,
    );

    expect(html).not.toContain('Your answer');
    expect(html).toContain('Correct answer');
    expect(html).toContain('Explanation not available.');
  });

  it('marks the selected wrong choice as your answer', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId="choice-a"
        choiceExplanations={[
          {
            choiceId: 'choice-a',
            displayLabel: 'A',
            textMd: 'First option',
            isCorrect: false,
            explanationMd: 'First option is incorrect.',
          },
          {
            choiceId: 'choice-b',
            displayLabel: 'B',
            textMd: 'Second option',
            isCorrect: false,
            explanationMd: 'Second option is incorrect.',
          },
          {
            choiceId: 'choice-c',
            displayLabel: 'C',
            textMd: 'Third option',
            isCorrect: true,
            explanationMd: 'Third option is correct.',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const destructiveCard = findStyledCard(
      doc,
      ['rounded-xl', 'border-destructive', 'bg-destructive/5', 'p-4'],
      { label: 'A', text: 'First option' },
    );

    expect(destructiveCard).not.toBeUndefined();
    expect(html).not.toContain('Your answer');
  });
});
