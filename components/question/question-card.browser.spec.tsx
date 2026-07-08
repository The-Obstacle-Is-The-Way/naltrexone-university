import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
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

  expect(onSelectChoice).toHaveBeenCalledWith(fixtureChoiceBId, 'pointer');
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

test('Enter on the focused radio submits the selected choice', async () => {
  const onSelectChoice = vi.fn();
  const onSubmitSelectedChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A' },
        { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={fixtureChoiceAId}
      correctChoiceId={null}
      canSubmitSelectedChoice
      onSelectChoice={onSelectChoice}
      onSubmitSelectedChoice={onSubmitSelectedChoice}
    />,
  );

  (
    screen.getByRole('radio', { name: /Choice A/i }).element() as HTMLElement
  ).focus();
  await userEvent.keyboard('{Enter}');

  expect(onSubmitSelectedChoice).toHaveBeenCalledTimes(1);
});

test('Enter on a link inside choice markdown follows the link instead of committing', async () => {
  const onSelectChoice = vi.fn();
  const onSubmitSelectedChoice = vi.fn();
  const screen = await render(
    <QuestionCard
      stemMd="Stem"
      choices={[
        {
          id: fixtureChoiceAId,
          label: 'A',
          textMd: 'See [the reference](#reference-anchor) for details',
        },
        { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B' },
      ]}
      selectedChoiceId={fixtureChoiceAId}
      correctChoiceId={null}
      canSubmitSelectedChoice
      onSelectChoice={onSelectChoice}
      onSubmitSelectedChoice={onSubmitSelectedChoice}
    />,
  );

  const link = screen.getByRole('link', { name: /the reference/i });
  (link.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  expect(onSubmitSelectedChoice).not.toHaveBeenCalled();
});
