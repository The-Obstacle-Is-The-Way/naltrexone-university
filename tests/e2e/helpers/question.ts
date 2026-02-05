import { expect, type Page } from '@playwright/test';

export async function selectChoiceByLabel(
  page: Page,
  label: 'A' | 'B' | 'C' | 'D' = 'A',
): Promise<void> {
  const choice = page.getByRole('radio', { name: `Choice ${label}` }).first();
  await expect(choice).toBeVisible({ timeout: 30_000 });
  await expect(choice).toBeEnabled({ timeout: 30_000 });
  await choice.check({ force: true });
}

export async function submitQuestionForOutcome(
  page: Page,
  slug: string,
  outcome: 'Correct' | 'Incorrect',
): Promise<'A' | 'B' | 'C' | 'D'> {
  const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

  for (const label of labels) {
    await page.goto(`/app/questions/${slug}`);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await selectChoiceByLabel(page, label);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    const matchedOutcome = await page
      .getByText(outcome, { exact: true })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (matchedOutcome) {
      return label;
    }
  }

  throw new Error(`Unable to produce ${outcome} outcome for question ${slug}`);
}
