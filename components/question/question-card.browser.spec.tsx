import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { QuestionCard } from './question-card';

const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();

test('calls onSelectChoice with the clicked choice id', async () => {
  const onSelectChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A' },
        { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={null}
      correctChoiceId={null}
      onSelectChoice={onSelectChoice}
    />,
  );

  await screen.getByRole('radio', { name: /Choice B/i }).click();

  expect(onSelectChoice).toHaveBeenCalledWith(fixtureChoiceBId);
});

test('disables choices when correctChoiceId is present', async () => {
  const onSelectChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A' },
        { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={null}
      correctChoiceId={fixtureChoiceAId}
      onSelectChoice={onSelectChoice}
    />,
  );

  await expect
    .element(screen.getByRole('radio', { name: /Choice A/i }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('radio', { name: /Choice B/i }))
    .toBeDisabled();
});
