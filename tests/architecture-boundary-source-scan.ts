import { readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';

export type ArchitectureSourceFile = {
  filePath: string;
  contents: string;
};

type ImportOccurrence = {
  specifier: string;
  lineNumber: number;
  typeOnly: boolean;
};

const PRODUCTION_ARCHITECTURE_SOURCE_GLOBS = [
  'src/domain/**/*.{ts,tsx}',
  'src/application/**/*.{ts,tsx}',
  'src/adapters/**/*.{ts,tsx}',
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
];

const PRODUCTION_ARCHITECTURE_SOURCE_IGNORE_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.browser.spec.tsx',
  '**/*.fixtures.ts',
  '**/*.probes.tsx',
  '**/*.setup.ts',
  '**/*test-helpers.ts',
  '**/*test-helpers.tsx',
  'src/**/test-helpers/**',
];

const APPLICATION_BANNED_LOCAL_PREFIXES = [
  'src/adapters/',
  'app/',
  'components/',
  'lib/',
  'db/',
];

const APPLICATION_BANNED_EXACT_LOCAL_IMPORTS = new Set(['db']);

const APPLICATION_BANNED_PACKAGE_PREFIXES = [
  'next',
  'next/',
  'react',
  'react/',
  'react-dom',
  'react-dom/',
  '@clerk/',
  'stripe',
  'stripe/',
  'drizzle-orm',
  'drizzle-orm/',
  'server-only',
];

const ADAPTER_BANNED_LOCAL_PREFIXES = ['app/', 'components/'];
const OUTER_BYPASS_LOCAL_PREFIXES = [
  'src/application/use-cases/',
  'src/application/ports/repositories',
  'src/adapters/repositories/',
];

const REPOSITORY_TYPESCRIPT_FILE_GLOBS = [
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'db/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx}',
  'src/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
];

const STANDARD_TEST_SUFFIXES = [
  '.browser.spec',
  '.integration.test',
  '.test',
  '.spec',
  '.e2e',
];

const ALLOWED_MULTI_DOT_BASENAMES = new Set([
  'app/(app)/app/billing/page.manage-billing.test.tsx',
  'app/(app)/app/practice/[sessionId]/components/post-exam-review-view.fixtures.ts',
  'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.fixtures.ts',
  'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
  'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.setup.ts',
  'app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.fixtures.ts',
  'app/(app)/app/questions/[slug]/hooks/question-page-model.browser.fixtures.ts',
  'lib/container.skip-clerk.test.ts',
  'tests/e2e/helpers/reset-bookmarks-for-e2e-user.default-services.test.ts',
  'tests/e2e/global.setup.ts',
  'tests/integration/actions.stripe.integration.test.ts',
]);

const QUESTION_ROUTE_ROOT = 'app/(app)/app/questions/[slug]/';
const QUESTION_ROUTE_HOOKS_ROOT = `${QUESTION_ROUTE_ROOT}hooks/`;

export function readProductionArchitectureSources(): ArchitectureSourceFile[] {
  return fg
    .sync(PRODUCTION_ARCHITECTURE_SOURCE_GLOBS, {
      cwd: process.cwd(),
      ignore: PRODUCTION_ARCHITECTURE_SOURCE_IGNORE_GLOBS,
      onlyFiles: true,
    })
    .sort()
    .map((filePath) => ({
      filePath,
      contents: readFileSync(path.resolve(process.cwd(), filePath), 'utf-8'),
    }));
}

export function readRepositoryTypescriptFilePaths(): string[] {
  return fg
    .sync(REPOSITORY_TYPESCRIPT_FILE_GLOBS, {
      cwd: process.cwd(),
      onlyFiles: true,
    })
    .sort();
}

export function collectArchitectureBoundaryIssues(
  sources: readonly ArchitectureSourceFile[],
): string[] {
  const issues: string[] = [];

  for (const sourceFile of sources) {
    for (const occurrence of collectImportOccurrences(sourceFile)) {
      const localTarget = toLocalTarget(
        sourceFile.filePath,
        occurrence.specifier,
      );

      if (sourceFile.filePath.startsWith('src/domain/')) {
        if (
          !isRelativeImport(occurrence.specifier) ||
          !localTarget?.startsWith('src/domain/')
        ) {
          issues.push(
            `${sourceFile.filePath}:${occurrence.lineNumber} domain production code must use only relative imports; found '${occurrence.specifier}'.`,
          );
        }
        continue;
      }

      if (sourceFile.filePath.startsWith('src/application/')) {
        if (
          isBannedApplicationLocalImport(localTarget) ||
          isBannedApplicationPackageImport(occurrence.specifier)
        ) {
          issues.push(
            `${sourceFile.filePath}:${occurrence.lineNumber} application code must not import adapters/framework code; found '${occurrence.specifier}'.`,
          );
        }
        continue;
      }

      if (sourceFile.filePath.startsWith('src/adapters/')) {
        if (hasPrefix(localTarget, ADAPTER_BANNED_LOCAL_PREFIXES)) {
          issues.push(
            `${sourceFile.filePath}:${occurrence.lineNumber} adapters must not import app/components code; found '${occurrence.specifier}'.`,
          );
        }
        continue;
      }

      if (
        isOuterLayerPath(sourceFile.filePath) &&
        !occurrence.typeOnly &&
        hasPrefix(localTarget, OUTER_BYPASS_LOCAL_PREFIXES)
      ) {
        issues.push(
          `${sourceFile.filePath}:${occurrence.lineNumber} outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '${occurrence.specifier}'.`,
        );
      }
    }
  }

  return issues;
}

export function collectFilenamePolicyIssues(
  filePaths: readonly string[],
): string[] {
  const issues: string[] = [];

  for (const filePath of filePaths) {
    const basename = path.posix.basename(filePath);
    const extension = typescriptExtensionFor(basename);
    if (!extension) {
      continue;
    }

    const stem = basename.slice(0, -extension.length);
    const { policyStem, suffix } = splitStandardTestSuffix(stem);
    const hasAllowedMultiDotName = ALLOWED_MULTI_DOT_BASENAMES.has(filePath);

    if (!hasAllowedMultiDotName && policyStem.includes('.')) {
      issues.push(
        `${filePath} uses an unapproved multi-dot filename; add a specific allowlist entry or rename it to kebab-case.`,
      );
      continue;
    }

    const expectedPolicyStem = toKebabCase(policyStem);
    if (policyStem !== expectedPolicyStem) {
      const suffixDescription = suffix
        ? 'before the standard test suffix'
        : 'before the extension';
      issues.push(
        `${filePath} must use kebab-case ${suffixDescription}; expected ${expectedPolicyStem}${suffix}${extension}.`,
      );
    }
  }

  return issues;
}

export function collectQuestionRouteHookOrganizationIssues(
  filePaths: readonly string[],
): string[] {
  return filePaths
    .filter(
      (filePath) =>
        filePath.startsWith(QUESTION_ROUTE_ROOT) &&
        !filePath.startsWith(QUESTION_ROUTE_HOOKS_ROOT) &&
        path.posix.basename(filePath).startsWith('use-question-page-'),
    )
    .map(
      (filePath) => `${filePath} must live under ${QUESTION_ROUTE_HOOKS_ROOT}.`,
    );
}

export function collectPresentationHookNamingIssues(
  filePaths: readonly string[],
): string[] {
  return filePaths
    .filter(
      (filePath) =>
        filePath.startsWith('app/') &&
        path.posix.basename(filePath).includes('page-controller'),
    )
    .map((filePath) => {
      const expectedBasename = path.posix
        .basename(filePath)
        .replace('page-controller', 'page-model');

      return `${filePath} is presentation state, not an adapter controller; expected ${expectedBasename}.`;
    });
}

function collectImportOccurrences(
  sourceFile: ArchitectureSourceFile,
): ImportOccurrence[] {
  const parsed = ts.createSourceFile(
    sourceFile.filePath,
    sourceFile.contents,
    ts.ScriptTarget.Latest,
    true,
    sourceFile.filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const occurrences: ImportOccurrence[] = [];

  function lineNumberFor(node: ts.Node): number {
    return parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      occurrences.push({
        specifier: node.moduleSpecifier.text,
        lineNumber: lineNumberFor(node.moduleSpecifier),
        typeOnly: isImportDeclarationTypeOnly(node),
      });
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        occurrences.push({
          specifier: node.moduleSpecifier.text,
          lineNumber: lineNumberFor(node.moduleSpecifier),
          typeOnly: isExportDeclarationTypeOnly(node),
        });
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        occurrences.push({
          specifier: argument.text,
          lineNumber: lineNumberFor(argument),
          typeOnly: false,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return occurrences;
}

function isImportDeclarationTypeOnly(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause;
  if (!importClause) {
    return false;
  }

  if (importClause.isTypeOnly) {
    return true;
  }

  if (importClause.name) {
    return false;
  }

  const namedBindings = importClause.namedBindings;
  return Boolean(
    namedBindings &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.length > 0 &&
      namedBindings.elements.every((element) => element.isTypeOnly),
  );
}

function isExportDeclarationTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return true;
  }

  const exportClause = node.exportClause;
  return Boolean(
    exportClause &&
      ts.isNamedExports(exportClause) &&
      exportClause.elements.length > 0 &&
      exportClause.elements.every((element) => element.isTypeOnly),
  );
}

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith('.');
}

function toLocalTarget(
  importerFilePath: string,
  specifier: string,
): string | null {
  if (specifier.startsWith('@/')) {
    return specifier.slice(2);
  }

  if (isRelativeImport(specifier)) {
    return path.posix.normalize(
      path.posix.join(path.posix.dirname(importerFilePath), specifier),
    );
  }

  return null;
}

function isBannedApplicationLocalImport(localTarget: string | null): boolean {
  return (
    APPLICATION_BANNED_EXACT_LOCAL_IMPORTS.has(localTarget ?? '') ||
    hasPrefix(localTarget, APPLICATION_BANNED_LOCAL_PREFIXES)
  );
}

function isBannedApplicationPackageImport(specifier: string): boolean {
  return APPLICATION_BANNED_PACKAGE_PREFIXES.some((prefix) => {
    const exactSpecifier = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return specifier === exactSpecifier || specifier.startsWith(prefix);
  });
}

function isOuterLayerPath(filePath: string): boolean {
  return filePath.startsWith('app/') || filePath.startsWith('components/');
}

function hasPrefix(value: string | null, prefixes: readonly string[]): boolean {
  return Boolean(value && prefixes.some((prefix) => value.startsWith(prefix)));
}

function typescriptExtensionFor(basename: string): '.ts' | '.tsx' | null {
  if (basename.endsWith('.tsx')) {
    return '.tsx';
  }

  if (basename.endsWith('.ts')) {
    return '.ts';
  }

  return null;
}

function splitStandardTestSuffix(stem: string): {
  policyStem: string;
  suffix: string;
} {
  const suffix = STANDARD_TEST_SUFFIXES.find((candidate) =>
    stem.endsWith(candidate),
  );

  if (!suffix) {
    return { policyStem: stem, suffix: '' };
  }

  return { policyStem: stem.slice(0, -suffix.length), suffix };
}

function toKebabCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
