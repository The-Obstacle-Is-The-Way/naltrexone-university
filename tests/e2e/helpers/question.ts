import { expect, type Page } from '@playwright/test';

export class SeededQuestionMissingError extends Error {
  constructor(slug: string) {
    super(`Seeded question '${slug}' not found — update seeds or tests`);
    this.name = 'SeededQuestionMissingError';
  }
}

export function isPlaywrightTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

export function rethrowIfQuestionMissingCheckError(error: unknown): void {
  if (error instanceof SeededQuestionMissingError) {
    throw error;
  }

  if (isPlaywrightTimeoutError(error)) {
    // waitFor timed out — question exists, proceed
    return;
  }

  throw error;
}

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
    throw new SeededQuestionMissingError(slug);
  } catch (error) {
    rethrowIfQuestionMissingCheckError(error);
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
