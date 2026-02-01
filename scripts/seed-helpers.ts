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
