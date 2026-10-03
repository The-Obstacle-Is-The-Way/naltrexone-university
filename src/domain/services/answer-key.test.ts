import { describe, expect, it } from 'vitest';
import { answerKeyChanged } from './answer-key';

type KeyChoice = { label: string; textMd: string; isCorrect: boolean };

const choice = (
  label: string,
  textMd: string,
  isCorrect = false,
): KeyChoice => ({
  label,
  textMd,
  isCorrect,
});

// ADR-022 Decision 4: an answered attempt is key-corrected when the current
// revision's correct choice differs, by label or by text, from the correct
// choice of the revision it was graded against. Conservative: reordering or
// rewording the correct option counts too.
describe('answerKeyChanged', () => {
  const graded = [
    choice('A', 'Naltrexone'),
    choice('B', 'Buprenorphine', true),
  ];

  it('is unchanged when the correct choice keeps its label and text', () => {
    const current = [
      choice('A', 'Naltrexone, reworded'),
      choice('B', 'Buprenorphine', true),
    ];

    expect(answerKeyChanged(graded, current)).toBe(false);
  });

  it.each([
    [
      'another choice is now correct',
      [choice('A', 'Naltrexone', true), choice('B', 'Buprenorphine')],
    ],
    [
      'the correct choice moved to another label',
      [choice('A', 'Buprenorphine', true), choice('B', 'Naltrexone')],
    ],
    [
      'the correct choice was reworded',
      [
        choice('A', 'Naltrexone'),
        choice('B', 'Buprenorphine (sublingual)', true),
      ],
    ],
  ] as const)('changes when %s', (_name, current) => {
    expect(answerKeyChanged(graded, current)).toBe(true);
  });

  it('compares every correct choice, not only the first', () => {
    expect(
      answerKeyChanged(
        [choice('A', 'x', true), choice('B', 'y', true)],
        [choice('A', 'x', true), choice('B', 'z', true)],
      ),
    ).toBe(true);
    expect(
      answerKeyChanged(
        [choice('B', 'y', true), choice('A', 'x', true)],
        [choice('A', 'x', true), choice('B', 'y', true)],
      ),
    ).toBe(false);
  });
});
