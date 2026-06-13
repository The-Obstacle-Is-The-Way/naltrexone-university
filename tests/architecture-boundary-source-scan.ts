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
