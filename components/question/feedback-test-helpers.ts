// Fixtures and DOM queries shared by the Feedback render suites.
import { expect } from 'vitest';
import { isNodeBefore } from '@/tests/shared/dom-helpers';

export const fixtureChoiceAId = crypto.randomUUID();
export const fixtureChoiceBId = crypto.randomUUID();
export const fixtureChoiceCId = crypto.randomUUID();
export const fixtureChoiceMissingId = crypto.randomUUID();

export const incorrectChoiceA = {
  choiceId: fixtureChoiceAId,
  displayLabel: 'A',
  textMd: 'First option',
  isCorrect: false,
  explanationMd: 'First option is incorrect.',
};

export const incorrectChoiceB = {
  choiceId: fixtureChoiceBId,
  displayLabel: 'B',
  textMd: 'Second option',
  isCorrect: false,
  explanationMd: 'Second option is incorrect.',
};

export const correctChoiceB = {
  choiceId: fixtureChoiceBId,
  displayLabel: 'B',
  textMd: 'Second option',
  isCorrect: true,
  explanationMd: 'Second option rationale.',
};

export const correctChoiceC = {
  choiceId: fixtureChoiceCId,
  displayLabel: 'C',
  textMd: 'Third option',
  isCorrect: true,
  explanationMd: 'Third option is correct.',
};

export const choicesWithCorrectB = [incorrectChoiceA, correctChoiceB];
export const choicesWithCorrectBConfirmed = [
  incorrectChoiceA,
  { ...correctChoiceB, explanationMd: 'Second option is correct.' },
];
export const choicesWithCorrectC = [
  incorrectChoiceA,
  incorrectChoiceB,
  correctChoiceC,
];

export function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

export function hasTokenMatching(
  tokens: Set<string>,
  pattern: RegExp,
): boolean {
  return [...tokens].some((token) => pattern.test(token));
}

// Asserts presence, so later reads need no optional-chaining fallback.
function expectPresent<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).toBeDefined();
  return value as T;
}

export function findRoundedBadge(
  container: ParentNode,
  label: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find(
    (div) =>
      getClassTokens(div.className).has('rounded-full') &&
      div.textContent?.trim() === label,
  );
}

function expectTokens(
  tokens: Set<string>,
  expected: string[],
  absent: string[],
) {
  for (const token of expected) {
    expect(tokens.has(token)).toBe(true);
  }

  for (const token of absent) {
    expect(tokens.has(token)).toBe(false);
  }
}

export function findMarkdownWrapper(
  container: ParentNode,
  text: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find(
    (div) =>
      getClassTokens(div.className).has('[&_p+p]:mt-3') &&
      div.textContent?.trim() === text,
  );
}

export function findAnswerRow(
  container: ParentNode,
  label: string,
  text: string,
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.className);
    return (
      classTokens.has('flex') &&
      classTokens.has('items-start') &&
      findRoundedBadge(div, label) !== undefined &&
      findMarkdownWrapper(div, text) !== undefined
    );
  });
}

export function findStyledCard(
  container: ParentNode,
  requiredTokens: string[],
  answer: { label: string; text: string },
): HTMLDivElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((div) => {
    const classTokens = getClassTokens(div.className);
    return (
      requiredTokens.every((token) => classTokens.has(token)) &&
      findAnswerRow(div, answer.label, answer.text) !== undefined
    );
  });
}

export function findSectionLabel(
  container: ParentNode,
  text: string,
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>('div, span')).find(
    (element) =>
      element.textContent?.trim() === text &&
      !element.className.includes('self-start'),
  );
}

export function expectNodeBefore(
  first: Node | null | undefined,
  second: Node | null | undefined,
) {
  expect(isNodeBefore(expectPresent(first), expectPresent(second))).toBe(true);
}

export function expectNeutralChip(element: Element | undefined) {
  expectTokens(
    getClassTokens(expectPresent(element).className),
    ['rounded-full', 'bg-muted', 'text-foreground'],
    [
      'bg-success',
      'bg-destructive',
      'text-success-foreground',
      'text-destructive-foreground',
    ],
  );
}

export function expectCorrectChip(element: Element | undefined) {
  expectTokens(
    getClassTokens(expectPresent(element).className),
    ['rounded-full', 'bg-success', 'text-success-foreground'],
    ['bg-muted', 'bg-destructive', 'text-foreground'],
  );
}
