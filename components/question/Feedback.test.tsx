// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Feedback: typeof import('@/components/question/feedback').Feedback;

beforeAll(async () => {
  ({ Feedback } = await import('@/components/question/feedback'));
});

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

    expect(html).not.toContain('bg-destructive/10');
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
