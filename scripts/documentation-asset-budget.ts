// Documentation is reviewed text plus small illustrations. A large image
// stays in every clone forever, so screenshots belong in the pull request
// that needs them, or are compressed below this budget.
export const DOCUMENTATION_FILE_BUDGET_BYTES = 300 * 1024;

// Files already over the budget when it was introduced (2026-10-05). The
// list only shrinks: remove an entry when its file is deleted or shrunk.
export const LARGE_FILES_BEFORE_BUDGET: readonly string[] = [
  'docs/debt/assets/debt-463/privacy-desktop-after.webp',
  'docs/debt/assets/debt-463/privacy-desktop-before.webp',
  'docs/debt/assets/debt-463/privacy-mobile-after.webp',
  'docs/debt/assets/debt-463/privacy-mobile-before.webp',
  'docs/debt/assets/debt-463/terms-desktop-after.webp',
  'docs/debt/assets/debt-463/terms-desktop-before.webp',
  'docs/debt/assets/debt-463/terms-mobile-after.webp',
  'docs/debt/assets/debt-463/terms-mobile-before.webp',
  'docs/debt/assets/debt-477/review-after-local-privacy-1024-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-privacy-1440-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-privacy-390-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-privacy-768-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-terms-1024-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-terms-1440-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-terms-390-2026-09-16.png',
  'docs/debt/assets/debt-477/review-after-local-terms-768-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-privacy-1024-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-privacy-1440-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-privacy-390-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-privacy-768-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-terms-1024-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-terms-1440-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-terms-390-2026-09-16.png',
  'docs/debt/assets/debt-477/review-before-production-terms-768-2026-09-16.png',
  'docs/debt/assets/debt-478/measurements-after-478.json',
];

export function overBudgetDocumentationFiles(
  files: readonly { file: string; bytes: number }[],
  allowed: ReadonlySet<string>,
): { overBudget: string[]; staleAllowances: string[] } {
  const large = new Set(
    files
      .filter(({ bytes }) => bytes > DOCUMENTATION_FILE_BUDGET_BYTES)
      .map(({ file }) => file),
  );
  return {
    overBudget: [...large].filter((file) => !allowed.has(file)).sort(),
    staleAllowances: [...allowed].filter((file) => !large.has(file)).sort(),
  };
}
