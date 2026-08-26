import { readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';

export type SkipPolicySourceFile = {
  filePath: string;
  contents: string;
};

type TestApi = 'bench' | 'describe' | 'it' | 'suite' | 'test';
type FrameworkModule = '@playwright/test' | 'vitest';
type ControlKind = 'call' | 'conditional-reference' | 'reference';

export type FrameworkControlOccurrence = {
  api: TestApi;
  filePath: string;
  guardExpression?: string;
  kind: ControlKind;
  lineNumber: number;
  method: string;
  moduleName: FrameworkModule;
};

type SkipPolicyAllowance = Omit<FrameworkControlOccurrence, 'lineNumber'> & {
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
const TEST_APIS = new Set<TestApi>([
  'bench',
  'describe',
  'it',
  'suite',
  'test',
]);
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
    guardExpression: "providerGate.mode==='skip'",
    kind: 'conditional-reference',
    method: 'skip',
    moduleName: 'vitest',
    expectedCount: 1,
    reason:
      'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
  },
  {
    api: 'describe',
    filePath: 'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
    guardExpression: "providerGate.mode==='skip'",
    kind: 'conditional-reference',
    method: 'skip',
    moduleName: 'vitest',
    expectedCount: 1,
    reason:
      'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
  },
  {
    api: 'it',
    filePath: 'scripts/run-stripe-provider-contracts.test.ts',
    guardExpression: "process.platform==='win32'",
    kind: 'call',
    method: 'skipIf',
    moduleName: 'vitest',
    expectedCount: 1,
    reason:
      'The descendant-process fixture depends on POSIX process-group semantics.',
  },
  {
    api: 'it',
    filePath: 'scripts/run-stripe-provider-contracts-process.test.ts',
    guardExpression: "process.platform==='win32'",
    kind: 'call',
    method: 'skipIf',
    moduleName: 'vitest',
    expectedCount: 1,
    reason:
      'The ignored-signal fixture is constructible only on POSIX platforms.',
  },
];

type ImportedApi = {
  api: TestApi;
  moduleName: FrameworkModule;
};

type FrameworkControlMember =
  | ts.ElementAccessExpression
  | ts.PropertyAccessExpression;

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
    member: FrameworkControlMember,
    kind: ControlKind,
    guardExpression?: ts.Expression,
  ): void {
    const staticMember = getStaticMember(member);
    if (!staticMember) return;
    const { method, location } = staticMember;
    if (!CONTROL_METHODS.has(method)) return;
    const importedApi = resolveImportedApi(member.expression, bindings);
    if (!importedApi) return;
    const normalizedGuardExpression = guardExpression
      ? normalizeGuardExpression(guardExpression, parsed)
      : undefined;

    occurrences.push({
      ...importedApi,
      filePath: source.filePath,
      ...(normalizedGuardExpression
        ? { guardExpression: normalizedGuardExpression }
        : {}),
      kind,
      lineNumber:
        parsed.getLineAndCharacterOfPosition(location.getStart(parsed)).line +
        1,
      method,
    });
  }

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      isFrameworkControlMember(node.expression)
    ) {
      const method = getStaticMember(node.expression)?.method;
      const guardExpression =
        method !== undefined && ['runIf', 'skipIf'].includes(method)
          ? node.arguments[0]
          : undefined;
      recordControl(node.expression, 'call', guardExpression);
    }

    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        if (isFrameworkControlMember(branch)) {
          recordControl(branch, 'conditional-reference', node.condition);
        }
      }
    }

    if (
      isFrameworkControlMember(node) &&
      !isDirectControlUseHandledByParent(node)
    ) {
      recordControl(node, 'reference');
    }

    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return occurrences;
}

function isDirectControlUseHandledByParent(
  member: FrameworkControlMember,
): boolean {
  const parent = member.parent;
  if (ts.isCallExpression(parent) && parent.expression === member) return true;
  return (
    ts.isConditionalExpression(parent) &&
    (parent.whenTrue === member || parent.whenFalse === member)
  );
}

function normalizeGuardExpression(
  expression: ts.Expression,
  parsed: ts.SourceFile,
): string {
  return expression.getText(parsed).replaceAll(/\s+/g, '');
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

  if (!isFrameworkControlMember(expression)) return undefined;

  const staticMember = getStaticMember(expression);
  if (!staticMember) return undefined;

  if (ts.isIdentifier(expression.expression)) {
    const moduleName = bindings.namespaces.get(expression.expression.text);
    if (moduleName && isTestApi(staticMember.method)) {
      return { api: staticMember.method, moduleName };
    }
  }

  return resolveImportedApi(expression.expression, bindings);
}

function isFrameworkControlMember(
  node: ts.Node,
): node is FrameworkControlMember {
  return (
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
  );
}

function getStaticMember(
  member: FrameworkControlMember,
): { method: string; location: ts.Node } | undefined {
  if (ts.isPropertyAccessExpression(member)) {
    return { method: member.name.text, location: member.name };
  }

  const argument = member.argumentExpression;
  if (
    ts.isStringLiteral(argument) ||
    ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    return { method: argument.text, location: argument };
  }

  return undefined;
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
    'api' | 'filePath' | 'guardExpression' | 'kind' | 'method' | 'moduleName'
  >,
): string {
  return [
    occurrence.filePath,
    occurrence.moduleName,
    occurrence.api,
    occurrence.method,
    occurrence.kind,
    occurrence.guardExpression ?? '',
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
