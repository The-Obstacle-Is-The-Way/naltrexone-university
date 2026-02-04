import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { QuestionCard } from './QuestionCard';

test('calls onSelectChoice with the clicked choice id', async () => {
  const onSelectChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        { id: 'choice_a', label: 'A', textMd: 'Choice A' },
        { id: 'choice_b', label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={null}
      correctChoiceId={null}
      onSelectChoice={onSelectChoice}
    />,
  );

  await screen.getByRole('radio', { name: /Choice B/i }).click();

  expect(onSelectChoice).toHaveBeenCalledWith('choice_b');
});

test('disables choices when correctChoiceId is present', async () => {
  const onSelectChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        { id: 'choice_a', label: 'A', textMd: 'Choice A' },
        { id: 'choice_b', label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={null}
      correctChoiceId="choice_a"
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
