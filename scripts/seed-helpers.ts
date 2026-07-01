import { canonicalizeMarkdown } from '../lib/content/parse-mdx-question';

export type ChoiceRef = {
  id: string;
  label: string;
};

type AttemptChoiceReferenceRow = {
  selectedChoiceId: string | null;
};

type PracticeSessionChoiceReferenceRow = {
  latestSelectedChoiceId: string | null;
  draftSelectedChoiceId: string | null;
};

export function computeReferencedChoiceIds(input: {
  attemptRows: readonly AttemptChoiceReferenceRow[];
  stateRows: readonly PracticeSessionChoiceReferenceRow[];
}): ReadonlySet<string> {
  const referencedChoiceIds = new Set<string>();

  for (const row of input.attemptRows) {
    if (row.selectedChoiceId) {
      referencedChoiceIds.add(row.selectedChoiceId);
    }
  }

  for (const row of input.stateRows) {
    if (row.latestSelectedChoiceId) {
      referencedChoiceIds.add(row.latestSelectedChoiceId);
    }
    if (row.draftSelectedChoiceId) {
      referencedChoiceIds.add(row.draftSelectedChoiceId);
    }
  }

  return referencedChoiceIds;
}

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
        `Refusing to delete choice ${choice.id} (${choice.label}) because it is referenced by an attempt or practice session state`,
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

  const unexpectedHeadingAfterReference = lines
    .slice(referenceHeadingIndex + 1)
    .find((line) => SECTION_HEADING_PATTERN.test(line));
  if (unexpectedHeadingAfterReference) {
    throw new Error(
      `reference section must be terminal; unexpected heading after ### Reference: '${unexpectedHeadingAfterReference}'`,
    );
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
