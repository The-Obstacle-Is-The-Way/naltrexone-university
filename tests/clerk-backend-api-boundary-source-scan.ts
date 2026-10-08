// DEBT-503 item 1: Clerk's Backend API is a shared, rate-limited allowance.
// Signed-in requests read the session through auth(), and only the
// composition root may build the Backend API client. A whole-word match
// catches static, dynamic, namespace and re-exported imports. It guards
// against accidental use, not deliberate obfuscation.

export type SourceFile = { path: string; text: string };

export type ClerkBackendApiUse = {
  path: string;
  use: string;
};

const COMPOSITION_ROOT = 'lib/container.ts';
const BACKEND_API_NAMES = ['currentUser', 'clerkClient', 'createClerkClient'];
const ALLOWED_AT_COMPOSITION_ROOT = new Set(['clerkClient']);
const BACKEND_PACKAGE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]@clerk\/backend(?:\/[^'"]*)?['"]/;
const CLERK_STAR_EXPORT = /\bexport\s*\*\s*(?:as\s+\w+\s*)?from\s*['"]@clerk\//;
// A template or a custom lifetime makes getToken() a Backend API call,
// called plainly or optionally (`getToken?.(…)`).
const GET_TOKEN_WITH_OPTIONS = /\bgetToken\s*(?:\?\.\s*)?\(\s*[^)\s]/;

export const PRODUCTION_SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const NOT_PRODUCTION =
  /(?:^tests\/|\.test\.|\.spec\.|test-helpers|\.fixtures\.|\.probes\.)/;

export function findClerkBackendApiUses(
  files: readonly SourceFile[],
): ClerkBackendApiUse[] {
  return files.flatMap(({ path, text }) => {
    const uses: ClerkBackendApiUse[] = [];
    for (const name of BACKEND_API_NAMES) {
      const allowed =
        path === COMPOSITION_ROOT && ALLOWED_AT_COMPOSITION_ROOT.has(name);
      if (!allowed && new RegExp(`\\b${name}\\b`).test(text)) {
        uses.push({ path, use: name });
      }
    }
    if (BACKEND_PACKAGE.test(text)) uses.push({ path, use: '@clerk/backend' });
    if (CLERK_STAR_EXPORT.test(text)) {
      uses.push({ path, use: 'export * from @clerk' });
    }
    if (GET_TOKEN_WITH_OPTIONS.test(text)) {
      uses.push({ path, use: 'getToken with options' });
    }
    return uses;
  });
}
