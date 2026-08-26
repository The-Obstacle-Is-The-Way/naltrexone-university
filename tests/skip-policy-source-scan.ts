import { readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';

export type SkipPolicySourceFile = {
  filePath: string;
  contents: string;
};

type TestApi = 'describe' | 'it' | 'test';
type FrameworkModule = '@playwright/test' | 'vitest';
type ControlKind = 'call' | 'conditional-reference';

export type FrameworkControlOccurrence = {
  api: TestApi;
  filePath: string;
  kind: ControlKind;
  lineNumber: number;
  method: string;
  moduleName: FrameworkModule;
};

type SkipPolicyAllowance = Omit<
  FrameworkControlOccurrence,
  'lineNumber' | 'moduleName'
> & {
  expectedCount: number;
  reason: string;
};

type SourceReader = (filePath: string, encoding: 'utf8') => string;

const SOURCE_GLOBS = [
  'tests/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'scripts/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'app/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'components/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
  'lib/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
];

const FRAMEWORK_MODULES = new Set<FrameworkModule>([
  '@playwright/test',
  'vitest',
]);
const TEST_APIS = new Set<TestApi>(['describe', 'it', 'test']);
const CONTROL_METHODS = new Set([
  'fixme',
  'only',
  'runIf',
  'skip',
  'skipIf',
  'todo',
]);

const DOCUMENTED_ALLOWANCES: readonly SkipPolicyAllowance[] = [
  {
    api: 'describe',
    filePath:
      'tests/integration/stripe-checkout-client-contract.integration.test.ts',
    kind: 'conditional-reference',
    method: 'skip',
    expectedCount: 1,
    reason:
      'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
  },
  {
    api: 'describe',
    filePath: 'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
    kind: 'conditional-reference',
    method: 'skip',
    expectedCount: 1,
    reason:
      'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
  },
  {
    api: 'it',
    filePath: 'scripts/run-stripe-provider-contracts.test.ts',
    kind: 'call',
    method: 'skipIf',
    expectedCount: 1,
    reason:
      'The descendant-process fixture depends on POSIX process-group semantics.',
  },
  {
    api: 'it',
    filePath: 'scripts/run-stripe-provider-contracts-process.test.ts',
    kind: 'call',
    method: 'skipIf',
    expectedCount: 1,
    reason:
      'The ignored-signal fixture is constructible only on POSIX platforms.',
  },
];

type ImportedApi = {
  api: TestApi;
  moduleName: FrameworkModule;
};

type FrameworkBindings = {
  named: Map<string, ImportedApi>;
  namespaces: Map<string, FrameworkModule>;
};

export class SkipPolicyScanError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkipPolicyScanError';
  }
}

export function readSkipPolicySources(
  filePaths: readonly string[],
  readSource: SourceReader = readFileSync,
): SkipPolicySourceFile[] {
  if (filePaths.length === 0) {
    throw new SkipPolicyScanError('SKIP_POLICY_SOURCE_WALK_EMPTY');
  }

  return [...filePaths].sort().map((filePath) => {
    try {
      return {
        filePath,
        contents: readSource(path.resolve(process.cwd(), filePath), 'utf8'),
      };
    } catch (error) {
      throw new SkipPolicyScanError(
        `SKIP_POLICY_SOURCE_UNREADABLE: ${filePath}`,
        { cause: error },
      );
    }
  });
}

export function readRepositorySkipPolicySources(): SkipPolicySourceFile[] {
  const filePaths = fg.sync(SOURCE_GLOBS, {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/.next/**'],
    onlyFiles: true,
    unique: true,
  });
  return readSkipPolicySources(filePaths);
}

export function collectFrameworkControlOccurrences(
  sources: readonly SkipPolicySourceFile[],
): FrameworkControlOccurrence[] {
  return sources
    .flatMap(collectSourceControlOccurrences)
    .sort(compareOccurrences);
}

export function collectSkipPolicyIssues(
  sources: readonly SkipPolicySourceFile[],
  allowances: readonly SkipPolicyAllowance[] = DOCUMENTED_ALLOWANCES,
): string[] {
  const occurrences = collectFrameworkControlOccurrences(sources);
  const allowedKeys = new Set(allowances.map(allowanceKey));
  const issues = occurrences
    .filter((occurrence) => !allowedKeys.has(occurrenceKey(occurrence)))
    .map(
      (occurrence) =>
        `${occurrence.filePath}:${occurrence.lineNumber} unapproved ${occurrence.moduleName} ${occurrence.api}.${occurrence.method} ${occurrence.kind}; remove it or add one exact documented allowance.`,
    );

  for (const allowance of allowances) {
    const actualCount = occurrences.filter(
      (occurrence) => occurrenceKey(occurrence) === allowanceKey(allowance),
    ).length;
    if (actualCount !== allowance.expectedCount) {
      issues.push(
        `${allowance.filePath} expected exactly ${allowance.expectedCount} allowed ${allowance.api}.${allowance.method} ${allowance.kind}, found ${actualCount}. ${allowance.reason}`,
      );
    }
  }

  return issues.sort();
}

function collectSourceControlOccurrences(
  source: SkipPolicySourceFile,
): FrameworkControlOccurrence[] {
  const parsed = ts.createSourceFile(
    source.filePath,
    source.contents,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(source.filePath),
  );
  const bindings = collectFrameworkBindings(parsed);
  const occurrences: FrameworkControlOccurrence[] = [];

  function recordControl(
    member: ts.PropertyAccessExpression,
    kind: ControlKind,
  ): void {
    const method = member.name.text;
    if (!CONTROL_METHODS.has(method)) return;
    const importedApi = resolveImportedApi(member.expression, bindings);
    if (!importedApi) return;

    occurrences.push({
      ...importedApi,
      filePath: source.filePath,
      kind,
      lineNumber:
        parsed.getLineAndCharacterOfPosition(member.name.getStart(parsed))
          .line + 1,
      method,
    });
  }

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      recordControl(node.expression, 'call');
    }

    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        if (ts.isPropertyAccessExpression(branch)) {
          recordControl(branch, 'conditional-reference');
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return occurrences;
}

function collectFrameworkBindings(parsed: ts.SourceFile): FrameworkBindings {
  const named = new Map<string, ImportedApi>();
  const namespaces = new Map<string, FrameworkModule>();

  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !isFrameworkModule(statement.moduleSpecifier.text)
    ) {
      continue;
    }

    const moduleName = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;

    if (ts.isNamespaceImport(bindings)) {
      namespaces.set(bindings.name.text, moduleName);
      continue;
    }

    for (const element of bindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (!isTestApi(importedName)) continue;
      named.set(element.name.text, { api: importedName, moduleName });
    }
  }

  return { named, namespaces };
}

function resolveImportedApi(
  expression: ts.Expression,
  bindings: FrameworkBindings,
): ImportedApi | undefined {
  if (ts.isIdentifier(expression)) {
    return bindings.named.get(expression.text);
  }

  if (ts.isCallExpression(expression)) {
    return resolveImportedApi(expression.expression, bindings);
  }

  if (!ts.isPropertyAccessExpression(expression)) return undefined;

  if (ts.isIdentifier(expression.expression)) {
    const moduleName = bindings.namespaces.get(expression.expression.text);
    if (moduleName && isTestApi(expression.name.text)) {
      return { api: expression.name.text, moduleName };
    }
  }

  return resolveImportedApi(expression.expression, bindings);
}

function isFrameworkModule(value: string): value is FrameworkModule {
  return FRAMEWORK_MODULES.has(value as FrameworkModule);
}

function isTestApi(value: string): value is TestApi {
  return TEST_APIS.has(value as TestApi);
}

function occurrenceKey(
  occurrence: Pick<
    FrameworkControlOccurrence,
    'api' | 'filePath' | 'kind' | 'method'
  >,
): string {
  return [
    occurrence.filePath,
    occurrence.api,
    occurrence.method,
    occurrence.kind,
  ].join('\0');
}

function allowanceKey(allowance: SkipPolicyAllowance): string {
  return occurrenceKey(allowance);
}

function compareOccurrences(
  left: FrameworkControlOccurrence,
  right: FrameworkControlOccurrence,
): number {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.lineNumber - right.lineNumber ||
    left.method.localeCompare(right.method)
  );
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
