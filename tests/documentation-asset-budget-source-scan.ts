// Documentation is reviewed text plus small illustrations. A large image
// stays in every clone forever, so screenshots belong in the pull request
// that needs them, or are compressed below this budget.
export const DOCUMENTATION_FILE_BUDGET_BYTES = 300 * 1024;

export function overBudgetDocumentationFiles(
  files: readonly { file: string; bytes: number }[],
): string[] {
  return files
    .filter(({ bytes }) => bytes > DOCUMENTATION_FILE_BUDGET_BYTES)
    .map(({ file }) => file)
    .sort();
}
