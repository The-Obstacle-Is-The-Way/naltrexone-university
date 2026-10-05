// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseHtml } from '@/tests/shared/dom-helpers';
import {
  choicesWithCorrectC,
  expectNeutralChip,
  expectNodeBefore,
  findSectionLabel,
  fixtureChoiceAId,
  fixtureChoiceCId,
} from './feedback-test-helpers';

let Feedback: typeof import('@/components/question/feedback').Feedback;

beforeAll(async () => {
  ({ Feedback } = await import('@/components/question/feedback'));
});

// ADR-022 Amendment 2026-10-05 (DEBT-498): what the score leaves out, the
// page does not grade. The verdict reads "Not scored", and nothing is colored
// as right or wrong.
function renderUngraded(
  ungraded: 'key_corrected' | 'in_doubt',
  input: { isCorrect: boolean; selectedChoiceId: string },
) {
  const html = renderToStaticMarkup(
    <Feedback
      isCorrect={input.isCorrect}
      ungraded={ungraded}
      explanationMd="Why the keyed answer is right."
      referenceMd="A cited source."
      choiceExplanations={choicesWithCorrectC}
      selectedChoiceId={input.selectedChoiceId}
    />,
  );
  return { html, doc: parseHtml(html) };
}

describe('Feedback for an item in doubt', () => {
  it.each([true, false])(
    'reads "Not scored" in a neutral pill whether the stored grade is correct (%s) or not',
    (isCorrect) => {
      const { doc } = renderUngraded('in_doubt', {
        isCorrect,
        selectedChoiceId: isCorrect ? fixtureChoiceCId : fixtureChoiceAId,
      });
      const verdict = doc.querySelector('[data-testid="verdict-pill"]');

      expect(verdict?.textContent).toBe('Not scored');
      expectNeutralChip(verdict ?? undefined);
    },
  );

  it('colors nothing as right or wrong', () => {
    const { html } = renderUngraded('in_doubt', {
      isCorrect: false,
      selectedChoiceId: fixtureChoiceAId,
    });

    expect(html).not.toMatch(/success|destructive/);
    expect(html).not.toContain('>Correct<');
    expect(html).not.toContain('>Incorrect<');
  });

  it("keeps the learner's answer, the keyed answer and its explanation, each named", () => {
    const { doc } = renderUngraded('in_doubt', {
      isCorrect: false,
      selectedChoiceId: fixtureChoiceAId,
    });
    const yourAnswer = findSectionLabel(doc, 'Your answer');
    const keyedAnswer = findSectionLabel(doc, 'Keyed answer');

    expectNeutralChip(yourAnswer);
    expectNeutralChip(keyedAnswer);
    expectNodeBefore(yourAnswer, keyedAnswer);
    expect(doc.body.textContent).toContain('First option is incorrect.');
    expect(doc.body.textContent).toContain('Why the keyed answer is right.');
    expect(doc.body.textContent).toContain('A cited source.');
  });

  it('names the other answers without calling them wrong', () => {
    const { doc } = renderUngraded('in_doubt', {
      isCorrect: false,
      selectedChoiceId: fixtureChoiceAId,
    });

    expectNeutralChip(findSectionLabel(doc, 'Other answers'));
    expect(doc.body.textContent).not.toContain('Why Other Answers Are Wrong');
    expect(doc.body.textContent).toContain('Second option is incorrect.');
  });

  it('shows no separate "Your answer" section when the learner chose the key', () => {
    const { doc } = renderUngraded('in_doubt', {
      isCorrect: true,
      selectedChoiceId: fixtureChoiceCId,
    });

    expect(findSectionLabel(doc, 'Your answer')).toBeUndefined();
    expectNeutralChip(findSectionLabel(doc, 'Keyed answer'));
  });
});

describe('Feedback for an answer whose key was corrected', () => {
  it('reads "Not scored" and shows none of the explanation, choice explanations or reference written for the old key', () => {
    const { doc } = renderUngraded('key_corrected', {
      isCorrect: true,
      selectedChoiceId: fixtureChoiceCId,
    });
    const text = doc.body.textContent ?? '';

    expect(doc.querySelector('[data-testid="verdict-pill"]')?.textContent).toBe(
      'Not scored',
    );
    expect(text).not.toContain('Why the keyed answer is right.');
    expect(text).not.toContain('Third option is correct.');
    expect(text).not.toContain('First option is incorrect.');
    expect(text).not.toContain('A cited source.');
  });

  it('says why the explanation is not shown', () => {
    const { doc } = renderUngraded('key_corrected', {
      isCorrect: false,
      selectedChoiceId: fixtureChoiceAId,
    });

    expect(doc.body.textContent).toContain(
      "The explanation was written for the answer before the correction, so it isn't shown.",
    );
  });
});
