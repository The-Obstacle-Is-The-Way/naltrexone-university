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
  '*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
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
const CONTROL_TOKEN_PATTERN = /\b(?:fixme|only|runIf|skip|skipIf|todo)\b/;

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

type FrameworkBindingScope = FrameworkBindings & {
  declared: Set<string>;
  functionOwner: FrameworkBindingScope | undefined;
  parent: FrameworkBindingScope | undefined;
};

type FrameworkBindingIndex = {
  root: FrameworkBindingScope;
  scopes: Map<ts.Node, FrameworkBindingScope>;
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
    .filter(mayContainFrameworkControl)
    .flatMap(collectSourceControlOccurrences)
    .sort(compareOccurrences);
}

function mayContainFrameworkControl(source: SkipPolicySourceFile): boolean {
  // This is candidate pruning only; the AST import/receiver resolver below is
  // still the authority. Parse escaped sources too so an encoded identifier or
  // static string (for example, a Unicode-escaped `skip`) cannot bypass policy.
  return (
    CONTROL_TOKEN_PATTERN.test(source.contents) ||
    source.contents.includes('\\u') ||
    source.contents.includes('\\x')
  );
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
  const bindingIndex = collectFrameworkBindingIndex(parsed);
  const occurrences: FrameworkControlOccurrence[] = [];

  function recordControl(
    member: FrameworkControlMember,
    kind: ControlKind,
    scope: FrameworkBindingScope,
    guardExpression?: ts.Expression,
  ): void {
    const staticMember = getStaticMember(member);
    if (!staticMember) return;
    const { method, location } = staticMember;
    if (!CONTROL_METHODS.has(method)) return;
    const importedApi = resolveImportedApi(member.expression, scope);
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

  function visit(node: ts.Node, enclosingScope: FrameworkBindingScope): void {
    const scope = bindingIndex.scopes.get(node) ?? enclosingScope;
    if (
      ts.isCallExpression(node) &&
      isFrameworkControlMember(node.expression)
    ) {
      const method = getStaticMember(node.expression)?.method;
      const guardExpression =
        method !== undefined && ['runIf', 'skipIf'].includes(method)
          ? node.arguments[0]
          : undefined;
      recordControl(node.expression, 'call', scope, guardExpression);
    }

    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        if (isFrameworkControlMember(branch)) {
          recordControl(branch, 'conditional-reference', scope, node.condition);
        }
      }
    }

    if (
      isFrameworkControlMember(node) &&
      !isDirectControlUseHandledByParent(node)
    ) {
      recordControl(node, 'reference', scope);
    }

    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(parsed, bindingIndex.root);
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

function collectFrameworkBindingIndex(
  parsed: ts.SourceFile,
): FrameworkBindingIndex {
  const scopes = new Map<ts.Node, FrameworkBindingScope>();
  const root = createFrameworkBindingScope(undefined);

  function visit(node: ts.Node, enclosingScope: FrameworkBindingScope): void {
    const scope =
      node === parsed
        ? root
        : isFrameworkBindingScope(node)
          ? createFrameworkBindingScope(enclosingScope)
          : enclosingScope;
    if (node === parsed || ts.isFunctionLike(node)) scope.functionOwner = scope;
    if (scope !== enclosingScope || node === parsed) scopes.set(node, scope);
    registerNodeBindings(node, scope);
    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(parsed, root);
  return { root, scopes };
}

function createFrameworkBindingScope(
  parent: FrameworkBindingScope | undefined,
): FrameworkBindingScope {
  return {
    declared: new Set<string>(),
    functionOwner: parent?.functionOwner,
    named: new Map<string, ImportedApi>(),
    namespaces: new Map<string, FrameworkModule>(),
    parent,
  };
}

function isFrameworkBindingScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isFunctionLike(node)
  );
}

function registerNodeBindings(
  node: ts.Node,
  scope: FrameworkBindingScope,
): void {
  if (ts.isImportDeclaration(node)) {
    registerImportBindings(node, scope);
    return;
  }

  if (ts.isImportEqualsDeclaration(node)) {
    scope.declared.add(node.name.text);
    registerImportEqualsBinding(node, scope.namespaces);
    return;
  }

  if (ts.isParameter(node)) {
    declareBindingName(node.name, scope.declared);
    return;
  }

  if (!ts.isVariableDeclaration(node)) return;
  const declarationScope = isBlockScopedVariableDeclaration(node)
    ? scope
    : (scope.functionOwner ?? scope);
  declareBindingName(node.name, declarationScope.declared);
  const moduleName = requiredFrameworkModule(node.initializer);
  if (moduleName) {
    registerCommonJsBindings(
      node.name,
      moduleName,
      declarationScope.named,
      declarationScope.namespaces,
    );
    return;
  }

  if (!ts.isIdentifier(node.name)) return;
  const importedApi = requiredFrameworkApi(node.initializer);
  if (importedApi) declarationScope.named.set(node.name.text, importedApi);
}

function isBlockScopedVariableDeclaration(
  declaration: ts.VariableDeclaration,
): boolean {
  const declarationList = declaration.parent;
  return (
    !ts.isVariableDeclarationList(declarationList) ||
    (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
  );
}

function declareBindingName(
  binding: ts.BindingName,
  declared: Set<string>,
): void {
  if (ts.isIdentifier(binding)) {
    declared.add(binding.text);
    return;
  }
  for (const element of binding.elements) {
    if (!ts.isBindingElement(element)) continue;
    declareBindingName(element.name, declared);
  }
}

function registerImportBindings(
  statement: ts.ImportDeclaration,
  scope: FrameworkBindingScope,
): void {
  const importClause = statement.importClause;
  if (importClause?.name) scope.declared.add(importClause.name.text);
  const bindings = importClause?.namedBindings;
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) {
      scope.declared.add(bindings.name.text);
    } else {
      for (const element of bindings.elements) {
        scope.declared.add(element.name.text);
      }
    }
  }

  if (
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    !isFrameworkModule(statement.moduleSpecifier.text)
  ) {
    return;
  }

  const moduleName = statement.moduleSpecifier.text;
  if (!bindings) return;

  if (ts.isNamespaceImport(bindings)) {
    scope.namespaces.set(bindings.name.text, moduleName);
    return;
  }

  for (const element of bindings.elements) {
    const importedName = (element.propertyName ?? element.name).text;
    if (!isTestApi(importedName)) continue;
    scope.named.set(element.name.text, { api: importedName, moduleName });
  }
}

function registerImportEqualsBinding(
  statement: ts.ImportEqualsDeclaration,
  namespaces: Map<string, FrameworkModule>,
): void {
  if (!ts.isExternalModuleReference(statement.moduleReference)) return;
  const moduleName = staticStringValue(statement.moduleReference.expression);
  if (moduleName && isFrameworkModule(moduleName)) {
    namespaces.set(statement.name.text, moduleName);
  }
}

function requiredFrameworkModule(
  initializer: ts.Expression | undefined,
): FrameworkModule | undefined {
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== 'require' ||
    initializer.arguments.length !== 1
  ) {
    return undefined;
  }

  const moduleSpecifier = staticStringValue(initializer.arguments[0]);
  return moduleSpecifier && isFrameworkModule(moduleSpecifier)
    ? moduleSpecifier
    : undefined;
}

function requiredFrameworkApi(
  initializer: ts.Expression | undefined,
): ImportedApi | undefined {
  if (!initializer || !isFrameworkControlMember(initializer)) return undefined;

  const staticMember = getStaticMember(initializer);
  if (!staticMember || !isTestApi(staticMember.method)) return undefined;

  const moduleName = requiredFrameworkModule(initializer.expression);
  return moduleName ? { api: staticMember.method, moduleName } : undefined;
}

function registerCommonJsBindings(
  binding: ts.BindingName,
  moduleName: FrameworkModule,
  named: Map<string, ImportedApi>,
  namespaces: Map<string, FrameworkModule>,
): void {
  if (ts.isIdentifier(binding)) {
    namespaces.set(binding.text, moduleName);
    return;
  }
  if (!ts.isObjectBindingPattern(binding)) return;

  for (const element of binding.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const importedName = staticBindingPropertyName(element);
    if (!importedName || !isTestApi(importedName)) continue;
    named.set(element.name.text, { api: importedName, moduleName });
  }
}

function staticBindingPropertyName(
  element: ts.BindingElement,
): string | undefined {
  const propertyName = element.propertyName;
  if (!propertyName) {
    return ts.isIdentifier(element.name) ? element.name.text : undefined;
  }
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
    return propertyName.text;
  }
  return ts.isComputedPropertyName(propertyName)
    ? staticStringValue(propertyName.expression)
    : undefined;
}

function staticStringValue(
  expression: ts.Expression | undefined,
): string | undefined {
  return expression &&
    (ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : undefined;
}

function resolveImportedApi(
  expression: ts.Expression,
  scope: FrameworkBindingScope,
): ImportedApi | undefined {
  if (ts.isIdentifier(expression)) {
    return resolveNamedBinding(expression.text, scope);
  }

  if (ts.isCallExpression(expression)) {
    return resolveImportedApi(expression.expression, scope);
  }

  if (!isFrameworkControlMember(expression)) return undefined;

  const staticMember = getStaticMember(expression);
  if (!staticMember) return undefined;

  const requiredModuleName = requiredFrameworkModule(expression.expression);
  if (requiredModuleName && isTestApi(staticMember.method)) {
    return { api: staticMember.method, moduleName: requiredModuleName };
  }

  if (ts.isIdentifier(expression.expression)) {
    const moduleName = resolveNamespaceBinding(
      expression.expression.text,
      scope,
    );
    if (moduleName && isTestApi(staticMember.method)) {
      return { api: staticMember.method, moduleName };
    }
  }

  return resolveImportedApi(expression.expression, scope);
}

function resolveNamedBinding(
  name: string,
  scope: FrameworkBindingScope,
): ImportedApi | undefined {
  let current: FrameworkBindingScope | undefined = scope;
  while (current) {
    if (current.declared.has(name)) return current.named.get(name);
    current = current.parent;
  }
  return undefined;
}

function resolveNamespaceBinding(
  name: string,
  scope: FrameworkBindingScope,
): FrameworkModule | undefined {
  let current: FrameworkBindingScope | undefined = scope;
  while (current) {
    if (current.declared.has(name)) return current.namespaces.get(name);
    current = current.parent;
  }
  return undefined;
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
  if (
    filePath.endsWith('.js') ||
    filePath.endsWith('.mjs') ||
    filePath.endsWith('.cjs')
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
