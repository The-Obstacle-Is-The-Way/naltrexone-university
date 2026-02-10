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
  // ChoiceButton renders: <label> wrapping an sr-only <input type="radio">
  // and a flex div containing a circle indicator (with just the letter A/B/C/D)
  // followed by the choice text in Markdown.
  //
  // Locate the label that contains a child div with the exact letter text.
  // The circle indicator is the only element with just the single letter.
  const choiceLabel = page
    .locator('label')
    .filter({
      has: page.locator(`div.rounded-full:text-is("${label}")`),
    })
    .first();
  await expect(choiceLabel).toBeVisible({ timeout: 30_000 });
  await choiceLabel.click();
  const radio = choiceLabel.locator('input[type="radio"]');
  await expect(radio).toBeChecked();
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
