// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  choicesWithCorrectB,
  choicesWithCorrectBConfirmed,
  choicesWithCorrectC,
  correctChoiceC,
  expectCorrectChip,
  expectNeutralChip,
  expectNodeBefore,
  findAnswerRow,
  findMarkdownWrapper,
  findRoundedBadge,
  findSectionLabel,
  findStyledCard,
  fixtureChoiceAId,
  fixtureChoiceBId,
  fixtureChoiceCId,
  fixtureChoiceMissingId,
  getClassTokens,
  hasTokenMatching,
  incorrectChoiceA,
  incorrectChoiceB,
} from './feedback-test-helpers';

let Feedback: typeof import('@/components/question/feedback').Feedback;

beforeAll(async () => {
  ({ Feedback } = await import('@/components/question/feedback'));
});

describe('Feedback', () => {
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
        selectedChoiceId={fixtureChoiceAId}
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
        selectedChoiceId={fixtureChoiceAId}
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
        selectedChoiceId={fixtureChoiceAId}
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
        selectedChoiceId={fixtureChoiceCId}
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
        selectedChoiceId={fixtureChoiceBId}
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
        selectedChoiceId={fixtureChoiceAId}
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

  it('renders omitted attempts as incorrect with no selected answer', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        isOmitted={true}
        explanationMd="General explanation."
        selectedChoiceId={null}
        choiceExplanations={choicesWithCorrectBConfirmed}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('[data-testid="verdict-pill"]')?.textContent).toBe(
      'Incorrect',
    );
    expect(html).toContain('No answer selected.');
    expect(html).toContain('Correct Answer');
    expect(html).not.toContain('Your answer');
  });

  it('falls back gracefully when selectedChoiceId is unknown in incorrect flow', () => {
    const html = renderToStaticMarkup(
      <Feedback
        isCorrect={false}
        explanationMd="General explanation."
        selectedChoiceId={fixtureChoiceMissingId}
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
        selectedChoiceId={fixtureChoiceBId}
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
        selectedChoiceId={fixtureChoiceAId}
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
        selectedChoiceId={fixtureChoiceAId}
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
