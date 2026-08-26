import ts from 'typescript';
import { DOCUMENTED_SKIP_POLICY_ALLOWANCES } from './skip-policy-source-scan-allowances';
import type { SkipPolicySourceFile } from './skip-policy-source-scan-files';

export type { SkipPolicySourceFile } from './skip-policy-source-scan-files';
export {
  readRepositorySkipPolicySources,
  readSkipPolicySources,
  SkipPolicyScanError,
} from './skip-policy-source-scan-files';

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

export type SkipPolicyAllowance = Omit<
  FrameworkControlOccurrence,
  'lineNumber'
> & {
  expectedCount: number;
  reason: string;
};

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
  allowances: readonly SkipPolicyAllowance[] = DOCUMENTED_SKIP_POLICY_ALLOWANCES,
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

  function recordResolvedControl(
    importedApi: ImportedApi,
    method: string,
    location: ts.Node,
    kind: ControlKind,
    guardExpression?: ts.Expression,
  ): void {
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
    recordResolvedControl(importedApi, method, location, kind, guardExpression);
  }

  function recordControlBindings(
    pattern: ts.ObjectBindingPattern,
    importedApi: ImportedApi,
  ): void {
    for (const element of pattern.elements) {
      if (!ts.isBindingElement(element)) continue;
      const method = staticBindingPropertyName(element);
      if (!method || !CONTROL_METHODS.has(method)) continue;
      recordResolvedControl(
        importedApi,
        method,
        element.propertyName ?? element.name,
        'reference',
      );
    }
  }

  function recordDestructuredControls(
    declaration: ts.VariableDeclaration,
    scope: FrameworkBindingScope,
  ): void {
    if (
      !ts.isObjectBindingPattern(declaration.name) ||
      !declaration.initializer
    ) {
      return;
    }

    const importedApi = resolveImportedApi(declaration.initializer, scope);
    if (importedApi) {
      recordControlBindings(declaration.name, importedApi);
      return;
    }

    const moduleName = resolveFrameworkModuleBinding(
      declaration.initializer,
      scope,
    );
    if (!moduleName) return;
    for (const element of declaration.name.elements) {
      if (!ts.isBindingElement(element)) continue;
      const api = staticBindingPropertyName(element);
      if (!api || !isTestApi(api) || !ts.isObjectBindingPattern(element.name)) {
        continue;
      }
      recordControlBindings(element.name, { api, moduleName });
    }
  }

  function visit(node: ts.Node, enclosingScope: FrameworkBindingScope): void {
    const scope = bindingIndex.scopes.get(node) ?? enclosingScope;
    if (ts.isVariableDeclaration(node)) {
      recordDestructuredControls(node, scope);
    }
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

  function visitDeclarations(
    node: ts.Node,
    enclosingScope: FrameworkBindingScope,
  ): void {
    const scope =
      node === parsed
        ? root
        : isFrameworkBindingScope(node)
          ? createFrameworkBindingScope(enclosingScope)
          : enclosingScope;
    if (node === parsed || ts.isFunctionLike(node)) scope.functionOwner = scope;
    if (scope !== enclosingScope || node === parsed) scopes.set(node, scope);
    registerDeclaredBindings(node, scope, enclosingScope);
    ts.forEachChild(node, (child) => visitDeclarations(child, scope));
  }

  function visitFrameworkBindings(
    node: ts.Node,
    enclosingScope: FrameworkBindingScope,
  ): void {
    const scope = scopes.get(node) ?? enclosingScope;
    registerFrameworkBindings(node, scope);
    ts.forEachChild(node, (child) => visitFrameworkBindings(child, scope));
  }

  visitDeclarations(parsed, root);
  visitFrameworkBindings(parsed, root);
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
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isFunctionLike(node) ||
    ts.isModuleBlock(node)
  );
}

function registerDeclaredBindings(
  node: ts.Node,
  scope: FrameworkBindingScope,
  enclosingScope: FrameworkBindingScope,
): void {
  if (ts.isImportDeclaration(node)) {
    declareImportBindings(node, scope.declared);
    return;
  }

  if (ts.isImportEqualsDeclaration(node)) {
    scope.declared.add(node.name.text);
    return;
  }

  if (ts.isParameter(node)) {
    declareBindingName(node.name, scope.declared);
    return;
  }

  if (ts.isEnumDeclaration(node) && node.name) {
    enclosingScope.declared.add(node.name.text);
    return;
  }

  if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
    enclosingScope.declared.add(node.name.text);
    return;
  }

  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.name
  ) {
    enclosingScope.declared.add(node.name.text);
    scope.declared.add(node.name.text);
    return;
  }

  if (
    (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
    node.name
  ) {
    scope.declared.add(node.name.text);
    return;
  }

  if (!ts.isVariableDeclaration(node)) return;
  const declarationScope = isBlockScopedVariableDeclaration(node)
    ? scope
    : (scope.functionOwner ?? scope);
  declareBindingName(node.name, declarationScope.declared);
}

function registerFrameworkBindings(
  node: ts.Node,
  scope: FrameworkBindingScope,
): void {
  if (ts.isImportDeclaration(node)) {
    registerImportBindings(node, scope);
    return;
  }

  if (ts.isImportEqualsDeclaration(node)) {
    registerImportEqualsBinding(node, scope.namespaces);
    return;
  }

  if (!ts.isVariableDeclaration(node)) return;
  const declarationScope = isBlockScopedVariableDeclaration(node)
    ? scope
    : (scope.functionOwner ?? scope);
  const moduleName = resolveFrameworkModuleBinding(
    node.initializer,
    declarationScope,
  );
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
  const importedApi = node.initializer
    ? resolveImportedApi(node.initializer, declarationScope)
    : undefined;
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
  declareImportBindings(statement, scope.declared);
  const importClause = statement.importClause;
  const bindings = importClause?.namedBindings;

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

function declareImportBindings(
  statement: ts.ImportDeclaration,
  declared: Set<string>,
): void {
  const importClause = statement.importClause;
  if (importClause?.name) declared.add(importClause.name.text);
  const bindings = importClause?.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    declared.add(bindings.name.text);
    return;
  }
  for (const element of bindings.elements) {
    declared.add(element.name.text);
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
  scope: FrameworkBindingScope,
): FrameworkModule | undefined {
  const candidate = initializer
    ? unwrapTransparentExpression(initializer)
    : undefined;
  if (!candidate || !ts.isCallExpression(candidate)) return undefined;
  if (candidate.arguments.length !== 1) return undefined;

  const isDynamicImport =
    candidate.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isUnshadowedRequire =
    ts.isIdentifier(candidate.expression) &&
    candidate.expression.text === 'require' &&
    !hasDeclaredBinding('require', scope);
  if (!isDynamicImport && !isUnshadowedRequire) return undefined;

  const moduleSpecifier = staticStringValue(candidate.arguments[0]);
  return moduleSpecifier && isFrameworkModule(moduleSpecifier)
    ? moduleSpecifier
    : undefined;
}

function resolveFrameworkModuleBinding(
  initializer: ts.Expression | undefined,
  scope: FrameworkBindingScope,
): FrameworkModule | undefined {
  const directModule = requiredFrameworkModule(initializer, scope);
  if (directModule) return directModule;
  if (!initializer) return undefined;

  const candidate = unwrapTransparentExpression(initializer);
  return ts.isIdentifier(candidate)
    ? resolveNamespaceBinding(candidate.text, scope)
    : undefined;
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let candidate = expression;
  while (
    ts.isAsExpression(candidate) ||
    ts.isAwaitExpression(candidate) ||
    ts.isNonNullExpression(candidate) ||
    ts.isParenthesizedExpression(candidate) ||
    ts.isSatisfiesExpression(candidate) ||
    ts.isTypeAssertionExpression(candidate)
  ) {
    candidate = candidate.expression;
  }
  return candidate;
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
  const candidate = unwrapTransparentExpression(expression);
  if (ts.isIdentifier(candidate)) {
    return resolveNamedBinding(candidate.text, scope);
  }

  if (ts.isCallExpression(candidate)) {
    return resolveImportedApi(candidate.expression, scope);
  }

  if (!isFrameworkControlMember(candidate)) return undefined;

  const staticMember = getStaticMember(candidate);
  if (!staticMember) return undefined;

  const requiredModuleName = requiredFrameworkModule(
    candidate.expression,
    scope,
  );
  if (requiredModuleName && isTestApi(staticMember.method)) {
    return { api: staticMember.method, moduleName: requiredModuleName };
  }

  if (ts.isIdentifier(candidate.expression)) {
    const moduleName = resolveNamespaceBinding(
      candidate.expression.text,
      scope,
    );
    if (moduleName && isTestApi(staticMember.method)) {
      return { api: staticMember.method, moduleName };
    }
  }

  return resolveImportedApi(candidate.expression, scope);
}

function hasDeclaredBinding(
  name: string,
  scope: FrameworkBindingScope,
): boolean {
  let current: FrameworkBindingScope | undefined = scope;
  while (current) {
    if (current.declared.has(name)) return true;
    current = current.parent;
  }
  return false;
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
