import { expect, type Locator, type Page } from '@playwright/test';

const QUESTION_LOADING_LABEL = 'Loading question';

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

export function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function selectChoiceByLabel(
  page: Page,
  label: 'A' | 'B' | 'C' | 'D' = 'A',
): Promise<void> {
  const choiceRadio = page
    .getByRole('radio', {
      name: new RegExp(`^${escapeRegexLiteral(label)}\\b`),
    })
    .first();
  await expect(choiceRadio).toBeAttached({ timeout: 30_000 });

  const choiceLabel = page
    .locator('label')
    .filter({ has: choiceRadio })
    .first();
  await expect(choiceLabel).toBeVisible({ timeout: 30_000 });
  await choiceLabel.click();
  await expect(choiceRadio).toBeChecked();
}

export async function expectVerdictPillVisible(
  target: Page | Locator,
): Promise<Locator> {
  const verdictPill = target.getByTestId('verdict-pill').first();
  await expect(verdictPill).toBeVisible({ timeout: 10_000 });
  await expect(verdictPill).toHaveText(/^(Correct|Incorrect)$/);
  return verdictPill;
}

function getQuestionLoadingIndicator(page: Page) {
  return page.getByText(QUESTION_LOADING_LABEL, { exact: true });
}

export async function waitForQuestionLoadingToFinish(page: Page) {
  await expect(getQuestionLoadingIndicator(page)).toBeHidden({
    timeout: 15_000,
  });
}

export async function assertQuestionSlugExists(
  page: Page,
  slug: string,
): Promise<void> {
  await page.goto(`/app/questions/${slug}`);
  await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();

  const notFound = page.getByText(/Question not found\.?/i);
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
    await waitForQuestionLoadingToFinish(page);

    await selectChoiceByLabel(page, label);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expectVerdictPillVisible(page);

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
