import { canonicalizeMarkdown } from '../lib/content/parseMdxQuestion';

export type ChoiceRef = {
  id: string;
  label: string;
};

export function computeChoiceSyncPlan(input: {
  existingChoices: readonly ChoiceRef[];
  desiredChoices: ReadonlyArray<{ label: string }>;
  referencedChoiceIds: ReadonlySet<string>;
}): { deleteChoiceIds: string[] } {
  const desiredLabels = new Set(input.desiredChoices.map((c) => c.label));

  const deleteChoiceIds: string[] = [];
  for (const choice of input.existingChoices) {
    if (desiredLabels.has(choice.label)) continue;

    if (input.referencedChoiceIds.has(choice.id)) {
      throw new Error(
        `Refusing to delete choice ${choice.id} (${choice.label}) because it is referenced by an attempt`,
      );
    }

    deleteChoiceIds.push(choice.id);
  }

  return { deleteChoiceIds };
}

const WRONG_ANSWERS_HEADING_PATTERN =
  /^\s*(?:\*\*|__)?\s*Why other answers are wrong\s*:?\s*(?:\*\*|__)?\s*$/i;
const SECTION_HEADING_PATTERN = /^\s*#{1,6}\s+\S+/;
const REFERENCE_HEADING_PATTERN = /^\s*###\s+Reference\s*$/i;
const CHOICE_BULLET_PATTERN = /^\s*[-*+]\s*([A-Ea-e])\s*(?:[).:])+\s*(.*)$/;
const SINGLE_LETTER_BULLET_PATTERN =
  /^\s*[-*+]\s*([A-Za-z])\s*(?:[).:])+\s*(.*)$/;
const COMBINED_LABEL_BULLET_PATTERN =
  /^\s*[-*+]\s*[A-Za-z](?:\s*,\s*[A-Za-z])+\s*(?:[).:])+\s*(.*)$/;
const NUMBERED_LIST_PATTERN = /^\s*\d+[.)]\s+\S+/;
const NESTED_MARKDOWN_CONTINUATION_PATTERN =
  /^[ \t]+(?:[-*+]\s+\S|\d+[.)]\s+\S|>\s+\S|```|~~~)/;
const INDENTED_CONTINUATION_PATTERN = /^[ \t]+\S/;

function createWrongAnswerValidationError(
  description: string,
  offendingLine: string,
): Error {
  return new Error(`${description}: '${offendingLine}'`);
}

export function parseExplanationAndReference(explanationMd: string): {
  generalExplanation: string;
  referenceMd: string | null;
} {
  const normalized = explanationMd.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const referenceHeadingIndex = lines.findIndex((line) =>
    REFERENCE_HEADING_PATTERN.test(line),
  );

  if (referenceHeadingIndex === -1) {
    return {
      generalExplanation: canonicalizeMarkdown(explanationMd),
      referenceMd: null,
    };
  }

  const generalExplanation = canonicalizeMarkdown(
    lines.slice(0, referenceHeadingIndex).join('\n'),
  );
  const referenceValue = canonicalizeMarkdown(
    lines.slice(referenceHeadingIndex + 1).join('\n'),
  );

  return {
    generalExplanation,
    referenceMd: referenceValue.length > 0 ? referenceValue : null,
  };
}

export function containsWrongAnswersHeading(explanationMd: string): boolean {
  const normalized = explanationMd.replace(/\r\n?/g, '\n');
  return normalized
    .split('\n')
    .some((line) => WRONG_ANSWERS_HEADING_PATTERN.test(line));
}

export function parseChoiceExplanations(explanationMd: string): {
  generalExplanation: string;
  perChoice: Map<string, string>;
  referenceMd: string | null;
} {
  const normalized = explanationMd.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const headingIndex = lines.findIndex((line) =>
    WRONG_ANSWERS_HEADING_PATTERN.test(line),
  );

  if (headingIndex === -1) {
    return {
      generalExplanation: canonicalizeMarkdown(explanationMd),
      perChoice: new Map(),
      referenceMd: null,
    };
  }

  const generalExplanation = canonicalizeMarkdown(
    lines.slice(0, headingIndex).join('\n'),
  );
  const perChoice = new Map<string, string>();
  let referenceHeadingLineIndex: number | null = null;
  let sawValidBullet = false;
  let sawNonEmptySectionContent = false;
  let firstNonEmptySectionLine: string | null = null;

  let currentLabel: string | null = null;
  let currentBodyLines: string[] = [];
  let currentBulletLine: string | null = null;

  const commitCurrent = () => {
    if (!currentLabel) return;
    const body = canonicalizeMarkdown(currentBodyLines.join('\n'));
    if (!body) {
      throw createWrongAnswerValidationError(
        'wrong-answer bullet has a blank explanation body',
        currentBulletLine ?? currentLabel,
      );
    }
    perChoice.set(currentLabel, body);
    currentLabel = null;
    currentBodyLines = [];
    currentBulletLine = null;
  };

  for (const [offset, line] of lines.slice(headingIndex + 1).entries()) {
    if (line.trim()) {
      sawNonEmptySectionContent = true;
      firstNonEmptySectionLine ??= line;
    }

    if (SECTION_HEADING_PATTERN.test(line)) {
      if (!REFERENCE_HEADING_PATTERN.test(line)) {
        throw createWrongAnswerValidationError(
          'unexpected heading inside wrong-answer section; only ### Reference may terminate the list',
          line,
        );
      }

      if (!sawValidBullet) {
        throw createWrongAnswerValidationError(
          'wrong-answer section contains content but no valid choice bullets',
          line,
        );
      }

      commitCurrent();
      referenceHeadingLineIndex = headingIndex + 1 + offset;
      break;
    }

    if (COMBINED_LABEL_BULLET_PATTERN.test(line)) {
      throw createWrongAnswerValidationError(
        'wrong-answer section uses combined choice labels; each wrong answer needs its own bullet',
        line,
      );
    }

    if (NUMBERED_LIST_PATTERN.test(line)) {
      throw createWrongAnswerValidationError(
        'wrong-answer section uses a numbered list; use - A) style bullets instead',
        line,
      );
    }

    const singleLetterBulletMatch = line.match(SINGLE_LETTER_BULLET_PATTERN);
    if (
      singleLetterBulletMatch &&
      !CHOICE_BULLET_PATTERN.test(line) &&
      !/[A-E]/i.test(singleLetterBulletMatch[1])
    ) {
      throw createWrongAnswerValidationError(
        'wrong-answer section uses an invalid choice label; labels must be A-E',
        line,
      );
    }

    const bulletMatch = line.match(CHOICE_BULLET_PATTERN);
    if (bulletMatch) {
      commitCurrent();

      const nextLabel = bulletMatch[1].toUpperCase();
      if (perChoice.has(nextLabel)) {
        throw createWrongAnswerValidationError(
          `wrong-answer section repeats duplicate choice label ${nextLabel}`,
          line,
        );
      }

      if (!bulletMatch[2]?.trim()) {
        throw createWrongAnswerValidationError(
          'wrong-answer bullet has a blank explanation body',
          line,
        );
      }

      currentLabel = nextLabel;
      currentBodyLines = [bulletMatch[2] ?? ''];
      currentBulletLine = line;
      sawValidBullet = true;
      continue;
    }

    if (!currentLabel) {
      if (!line.trim()) {
        continue;
      }

      throw createWrongAnswerValidationError(
        'wrong-answer section contains non-bullet text before the first choice bullet',
        line,
      );
    }

    if (!line.trim()) {
      currentBodyLines.push('');
      continue;
    }

    if (!INDENTED_CONTINUATION_PATTERN.test(line)) {
      throw createWrongAnswerValidationError(
        'line after a choice bullet is not a valid indented continuation, choice bullet, or ### Reference heading',
        line,
      );
    }

    if (
      NESTED_MARKDOWN_CONTINUATION_PATTERN.test(line) ||
      /^\t/.test(line) ||
      /^ {4,}\S/.test(line)
    ) {
      throw createWrongAnswerValidationError(
        'wrong-answer bullets do not support indentation-sensitive nested markdown yet',
        line,
      );
    }

    currentBodyLines.push(line.trimStart());
  }

  commitCurrent();

  if (!sawValidBullet) {
    throw createWrongAnswerValidationError(
      sawNonEmptySectionContent
        ? 'wrong-answer section contains content but no valid choice bullets'
        : 'wrong-answer section contains no valid choice bullets',
      firstNonEmptySectionLine ?? lines[headingIndex] ?? '',
    );
  }

  let referenceMd: string | null = null;
  if (referenceHeadingLineIndex !== null) {
    const value = canonicalizeMarkdown(
      lines.slice(referenceHeadingLineIndex + 1).join('\n'),
    );
    referenceMd = value.length > 0 ? value : null;
  }

  return {
    generalExplanation,
    perChoice,
    referenceMd,
  };
}
