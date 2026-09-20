import { canonicalizeMarkdown } from '../../lib/content/parse-mdx-question';
import type { SeedQuestionRep } from './question-parser';

function sameText(left: string | null, right: string | null): boolean {
  return canonicalizeMarkdown(left ?? '') === canonicalizeMarkdown(right ?? '');
}

export function computeContentRewriteChanges(
  existing: SeedQuestionRep,
  desired: SeedQuestionRep,
): string[] {
  const changes: string[] = [];
  for (const field of ['stem_md', 'explanation_md', 'reference_md'] as const) {
    if (!sameText(existing[field], desired[field])) changes.push(field);
  }

  const existingByLabel = new Map(
    existing.choices.map((choice) => [choice.label, choice]),
  );
  if (
    existing.choices.length !== desired.choices.length ||
    desired.choices.some((choice) => !existingByLabel.has(choice.label))
  ) {
    changes.push('choice_labels');
  }

  for (const choice of desired.choices) {
    const previous = existingByLabel.get(choice.label);
    if (!previous) continue;
    if (!sameText(previous.text_md, choice.text_md)) {
      changes.push(`choice_${choice.label}_text`);
    }
    // Correctness flips require adding/removing the wrong-answer explanation.
    // The existing answer-key policy owns that explicit correction. With an
    // unchanged key, feedback rewrites receive the same protection as stems.
    if (
      previous.is_correct === choice.is_correct &&
      !sameText(previous.explanation_md, choice.explanation_md)
    ) {
      changes.push(`choice_${choice.label}_explanation`);
    }
  }

  return changes;
}
