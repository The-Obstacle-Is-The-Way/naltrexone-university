import { expect, type Page } from '@playwright/test';

export async function selectChoiceByLabel(
  page: Page,
  label: 'A' | 'B' | 'C' | 'D' = 'A',
): Promise<void> {
  const choice = page.getByRole('radio', { name: `Choice ${label}` }).first();
  const choiceLabel = choice.locator('xpath=ancestor::label[1]');
  await expect(choice).toBeVisible({ timeout: 30_000 });
  await expect(choice).toBeEnabled({ timeout: 30_000 });
  await expect(choiceLabel).toBeVisible({ timeout: 30_000 });
  await choiceLabel.click();
  await expect(choice).toBeChecked();
}

export async function assertQuestionSlugExists(
  page: Page,
  slug: string,
): Promise<void> {
  await page.goto(`/app/questions/${slug}`);
  await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();

  const notFound = page.getByText('Question not found.', { exact: true });
  try {
    await notFound.waitFor({ state: 'visible', timeout: 2_000 });
    throw new Error(
      `Seeded question '${slug}' not found — update seeds or tests`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    // waitFor timed out — question exists, proceed
  }
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
      .isVisible()
      .catch(() => false);
    if (matchedOutcome) {
      return label;
    }
  }

  throw new Error(`Unable to produce ${outcome} outcome for question ${slug}`);
}
