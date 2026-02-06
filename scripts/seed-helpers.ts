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
const CHOICE_BULLET_PATTERN = /^\s*[-*+]\s*([A-Ea-e])\s*(?:[).:])+\s*(.*)$/;

export function parseChoiceExplanations(explanationMd: string): {
  generalExplanation: string;
  perChoice: Map<string, string>;
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
    };
  }

  const generalExplanation = canonicalizeMarkdown(
    lines.slice(0, headingIndex).join('\n'),
  );
  const perChoice = new Map<string, string>();

  let currentLabel: string | null = null;
  let currentBodyLines: string[] = [];

  const commitCurrent = () => {
    if (!currentLabel) return;
    const body = canonicalizeMarkdown(currentBodyLines.join('\n'));
    if (body) {
      perChoice.set(currentLabel, body);
    }
    currentLabel = null;
    currentBodyLines = [];
  };

  for (const line of lines.slice(headingIndex + 1)) {
    if (SECTION_HEADING_PATTERN.test(line)) {
      break;
    }

    const bulletMatch = line.match(CHOICE_BULLET_PATTERN);
    if (bulletMatch) {
      commitCurrent();
      currentLabel = bulletMatch[1].toUpperCase();
      currentBodyLines = [bulletMatch[2] ?? ''];
      continue;
    }

    if (!currentLabel) {
      continue;
    }

    if (!line.trim()) {
      currentBodyLines.push('');
      continue;
    }

    currentBodyLines.push(line.trimStart());
  }

  commitCurrent();

  return {
    generalExplanation,
    perChoice,
  };
}
