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
    expect(verdictBadge?.getAttribute('class')).toContain('bg-success/15');
    expect(verdictBadge?.getAttribute('class')).toContain('text-success');
    expect(html).toContain('Correct');
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
    const correctAnswerLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Correct answer',
    );
    const successCard = correctAnswerLabel?.nextElementSibling;
    const successCardClassName = successCard?.getAttribute('class') ?? '';
    const successCardTokens = getClassTokens(successCardClassName);
    const successCardText = successCard?.textContent ?? '';

    expect(correctAnswerLabel).not.toBeUndefined();
    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardText).toContain('B)');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
  });

  it('T2: wraps explanation-only fallback in a success card for correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="General explanation." />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const explanationLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Explanation',
    );
    const successCard = explanationLabel?.nextElementSibling;
    const successCardClassName = successCard?.getAttribute('class') ?? '';
    const successCardTokens = getClassTokens(successCardClassName);
    const successCardText = successCard?.textContent ?? '';

    expect(explanationLabel).not.toBeUndefined();
    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardText).toContain('General explanation.');
    expect(successCardText).not.toContain('A)');
    expect(successCardText).not.toContain('B)');
  });

  it('renders explanation fallback without top margin when no correct choice exists in correct flow', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd={null} />,
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

    expect(explanationLabel).not.toBeUndefined();
    expect(fallbackParagraph).not.toBeUndefined();
    expect(fallbackClassName).toContain('text-sm');
    expect(fallbackClassName).toContain('text-muted-foreground');
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
    const yourAnswerLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) => div.textContent?.trim() === 'Your answer',
    );
    const destructiveCard = yourAnswerLabel?.nextElementSibling;
    const destructiveCardClassName =
      destructiveCard?.getAttribute('class') ?? '';
    const destructiveCardTokens = getClassTokens(destructiveCardClassName);
    const destructiveCardText = destructiveCard?.textContent ?? '';

    expect(yourAnswerLabel).not.toBeUndefined();
    expect(destructiveCard).not.toBeNull();
    expect(destructiveCardTokens.has('border-destructive')).toBe(true);
    expect(destructiveCardTokens.has('border-destructive/20')).toBe(false);
    expect(destructiveCardTokens.has('border-destructive/30')).toBe(false);
    expect(destructiveCardTokens.has('bg-destructive/5')).toBe(true);
    expect(destructiveCardText).toContain('A)');
    expect(destructiveCardText).toContain('First option');
    expect(destructiveCardText).toContain('First option is incorrect.');
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

    expect(correctAnswerLabel).not.toBeUndefined();
    expect(successCard).not.toBeNull();
    expect(successCardTokens.has('border-success/60')).toBe(true);
    expect(successCardTokens.has('bg-success/5')).toBe(true);
    expect(successCardText).toContain('B)');
    expect(successCardText).toContain('Second option');
    expect(successCardText).toContain('General explanation.');
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

    expect(html).toContain('Your answer');
    expect(explanationLabel).not.toBeUndefined();
    expect(fallbackParagraph).not.toBeUndefined();
    expect(fallbackClassName).toContain('text-sm');
    expect(fallbackClassName).toContain('text-muted-foreground');
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

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswerCards.length).toBeGreaterThan(0);
    for (const card of wrongAnswerCards) {
      const className = card.getAttribute('class') ?? '';
      const classTokens = getClassTokens(className);
      expect(classTokens.has('border-border/60')).toBe(true);
      expect(classTokens.has('bg-background/50')).toBe(true);
      expect(classTokens.has('border-success/60')).toBe(false);
      expect(classTokens.has('bg-success/5')).toBe(false);
      expect(
        [...classTokens].some((token) =>
          token.startsWith('border-destructive'),
        ),
      ).toBe(false);
      expect(classTokens.has('bg-destructive/5')).toBe(false);
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
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('border-border/60') &&
        className.includes('bg-background/50')
      );
    });

    expect(wrongAnswersHeading).not.toBeUndefined();
    expect(wrongAnswerCards.length).toBeGreaterThan(0);
    for (const card of wrongAnswerCards) {
      const classTokens = getClassTokens(card.getAttribute('class') ?? '');
      expect(classTokens.has('dark:border-foreground/40')).toBe(true);
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
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('border-border/60') &&
        className.includes('bg-background/50')
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

    expect(html).toContain('Correct answer');
    expect(html).toContain('B)');
    expect(html).toContain('Second option');
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

    expect(html).toContain('Why other answers are wrong:');
    expect(html).toContain('A)');
    expect(html).toContain('First option');
    expect(html).toContain('First option is incorrect.');
    expect(html).not.toContain('B) Second option');
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

    expect(referenceLabel).not.toBeUndefined();
    expect(referenceLabel?.getAttribute('class')).toContain('font-semibold');
    expect(referenceLabel?.getAttribute('class')).toContain('uppercase');
    expect(referenceLabel?.getAttribute('class')).toContain('tracking-wide');
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

  it('uses larger verdict-to-explanation spacing and reduced wrong-answer text weight', () => {
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
    const card = doc.querySelector('[role="status"]');
    const mutedChoiceRow = Array.from(doc.querySelectorAll('div')).find((div) =>
      (div.getAttribute('class') ?? '').includes('text-muted-foreground'),
    );

    expect(card?.querySelector('div.mt-6')).not.toBeNull();
    expect(mutedChoiceRow?.getAttribute('class')).not.toContain('font-medium');
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

    const yourAnswerIndex = html.indexOf('Your answer');
    const correctAnswerIndex = html.indexOf('Correct answer');

    expect(yourAnswerIndex).toBeGreaterThanOrEqual(0);
    expect(correctAnswerIndex).toBeGreaterThanOrEqual(0);
    expect(yourAnswerIndex).toBeLessThan(correctAnswerIndex);
    expect(html).toContain('A)');
    expect(html).toContain('First option');
    expect(html).toContain('First option is incorrect.');
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

    expect(html).toContain('Your answer');
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
    const correctAnswerIndex = html.indexOf('Correct answer');
    const wrongAnswersHeadingIndex = html.indexOf(
      'Why other answers are wrong:',
    );

    expect(correctAnswerIndex).toBeGreaterThanOrEqual(0);
    expect(wrongAnswersHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(correctAnswerIndex).toBeLessThan(wrongAnswersHeadingIndex);
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

    expect(html).toContain('Correct answer');
    expect(html).toContain('Explanation not available.');
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

    expect(html).toContain('Your answer');
    expect(html).toContain('A)');
    expect(html).toContain('First option');
    expect(html).not.toContain('Why other answers are wrong:');
    expect(html).toContain('General explanation.');
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

    expect(html).toContain('Your answer');
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
    const yourAnswerSectionLabel = Array.from(doc.querySelectorAll('div')).find(
      (div) =>
        div.textContent?.trim() === 'Your answer' &&
        (div.getAttribute('class') ?? '').includes('font-medium'),
    );

    expect(yourAnswerSectionLabel).not.toBeUndefined();
  });
});
