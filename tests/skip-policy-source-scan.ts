import ts from 'typescript';
import { DOCUMENTED_SKIP_POLICY_ALLOWANCES } from './skip-policy-source-scan-allowances';
import type { SkipPolicySourceFile } from './skip-policy-source-scan-files';
import {
  mayContainFrameworkControl,
  scriptKindFor,
} from './skip-policy-source-scan-script-kind';

export type { SkipPolicySourceFile } from './skip-policy-source-scan-files';
export {
  readRepositorySkipPolicySources,
  readSkipPolicySources,
  SkipPolicyScanError,
} from './skip-policy-source-scan-files';

type TestApi = 'bench' | 'describe' | 'it' | 'suite' | 'test';
type FrameworkModule = '@playwright/test' | 'vitest';
type ControlKind = 'call' | 'conditional-reference' | 'reference';

type ControlOccurrenceBase = {
  filePath: string;
  guardExpression?: string;
  kind: ControlKind;
  lineNumber: number;
  method: string;
};

export type FrameworkControlOccurrence = ControlOccurrenceBase &
  (
    | {
        api: TestApi;
        moduleName: FrameworkModule;
        resolution: 'framework';
      }
    | {
        api: string;
        moduleName: 'unresolved';
        resolution: 'unresolved';
      }
  );

export type SkipPolicyAllowance = Omit<ControlOccurrenceBase, 'lineNumber'> & {
  api: TestApi;
  expectedCount: number;
  moduleName: FrameworkModule;
  reason: string;
};

type ImportedApi = {
  api: TestApi;
  moduleName: FrameworkModule;
};

type FrameworkReference =
  | (ImportedApi & { kind: 'api' })
  | { kind: 'namespace'; moduleName: FrameworkModule };

type ReceiverResolution =
  | (ImportedApi & { resolution: 'framework' })
  | { resolution: 'known-non-framework' }
  | { receiverName: string; resolution: 'unresolved' };

type DirectBindings = {
  frameworkApis: Map<string, ImportedApi>;
  frameworkNamespaces: Map<string, FrameworkModule>;
  nonFrameworkImports: Set<string>;
};

type ControlMember = ts.ElementAccessExpression | ts.PropertyAccessExpression;

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

export function collectFrameworkControlOccurrences(
  sources: readonly SkipPolicySourceFile[],
): FrameworkControlOccurrence[] {
  return sources
    .filter(mayContainFrameworkControl)
    .flatMap(collectSourceControlOccurrences)
    .sort(compareOccurrences);
}

export function collectSkipPolicyIssues(
  sources: readonly SkipPolicySourceFile[],
  allowances: readonly SkipPolicyAllowance[] = DOCUMENTED_SKIP_POLICY_ALLOWANCES,
): string[] {
  const occurrences = collectFrameworkControlOccurrences(sources);
  const allowedKeys = new Set(allowances.map(allowanceKey));
  const issues = occurrences
    .filter((occurrence) => !allowedKeys.has(occurrenceKey(occurrence)))
    .map(formatUnapprovedOccurrence);

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
  const bindings = collectDirectBindings(parsed);
  const occurrences: FrameworkControlOccurrence[] = [];

  function recordOccurrence(
    resolution: ReceiverResolution,
    method: string,
    location: ts.Node,
    kind: ControlKind,
    guardExpression?: ts.Expression,
  ): void {
    if (resolution.resolution === 'known-non-framework') return;

    const normalizedGuardExpression = guardExpression
      ? normalizeGuardExpression(guardExpression, parsed)
      : undefined;
    const common = {
      filePath: source.filePath,
      ...(normalizedGuardExpression
        ? { guardExpression: normalizedGuardExpression }
        : {}),
      kind,
      lineNumber:
        parsed.getLineAndCharacterOfPosition(location.getStart(parsed)).line +
        1,
      method,
    };

    if (resolution.resolution === 'framework') {
      occurrences.push({ ...common, ...resolution });
      return;
    }

    occurrences.push({
      ...common,
      api: resolution.receiverName,
      moduleName: 'unresolved',
      resolution: 'unresolved',
    });
  }

  function recordControl(
    member: ControlMember,
    kind: ControlKind,
    guardExpression?: ts.Expression,
  ): void {
    const staticMember = getStaticMember(member);
    if (!staticMember || !CONTROL_METHODS.has(staticMember.method)) return;
    recordOccurrence(
      classifyReceiver(member.expression, bindings, parsed),
      staticMember.method,
      staticMember.location,
      kind,
      guardExpression,
    );
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isControlMember(node.expression)) {
      const method = getStaticMember(node.expression)?.method;
      const guardExpression =
        method !== undefined && ['runIf', 'skipIf'].includes(method)
          ? node.arguments[0]
          : undefined;
      recordControl(node.expression, 'call', guardExpression);
    }

    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        if (isControlMember(branch)) {
          recordControl(branch, 'conditional-reference', node.condition);
        }
      }
    }

    if (isControlMember(node) && !isDirectControlUseHandledByParent(node)) {
      recordControl(node, 'reference');
    }

    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return occurrences;
}

function collectDirectBindings(parsed: ts.SourceFile): DirectBindings {
  const bindings: DirectBindings = {
    frameworkApis: new Map<string, ImportedApi>(),
    frameworkNamespaces: new Map<string, FrameworkModule>(),
    nonFrameworkImports: new Set<string>(),
  };

  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement)) registerImport(statement, bindings);
  }
  return bindings;
}

function registerImport(
  statement: ts.ImportDeclaration,
  bindings: DirectBindings,
): void {
  const importClause = statement.importClause;
  if (!importClause || !ts.isStringLiteral(statement.moduleSpecifier)) return;

  const moduleSpecifier = statement.moduleSpecifier.text;
  if (!isFrameworkModule(moduleSpecifier)) {
    registerImportNames(importClause, bindings.nonFrameworkImports);
    return;
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) return;
  if (ts.isNamespaceImport(namedBindings)) {
    bindings.frameworkNamespaces.set(namedBindings.name.text, moduleSpecifier);
    return;
  }

  for (const element of namedBindings.elements) {
    const importedName = (element.propertyName ?? element.name).text;
    if (isTestApi(importedName)) {
      bindings.frameworkApis.set(element.name.text, {
        api: importedName,
        moduleName: moduleSpecifier,
      });
    } else {
      bindings.nonFrameworkImports.add(element.name.text);
    }
  }
}

function registerImportNames(
  importClause: ts.ImportClause,
  names: Set<string>,
): void {
  if (importClause.name) names.add(importClause.name.text);
  const bindings = importClause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    names.add(bindings.name.text);
    return;
  }
  for (const element of bindings.elements) names.add(element.name.text);
}

function classifyReceiver(
  expression: ts.Expression,
  bindings: DirectBindings,
  parsed: ts.SourceFile,
): ReceiverResolution {
  const frameworkReference = resolveDirectFrameworkReference(
    expression,
    bindings,
  );
  if (frameworkReference?.kind === 'api') {
    return {
      api: frameworkReference.api,
      moduleName: frameworkReference.moduleName,
      resolution: 'framework',
    };
  }
  if (isKnownNonFrameworkReceiver(expression, bindings)) {
    return { resolution: 'known-non-framework' };
  }
  return {
    receiverName: receiverLabel(expression, parsed),
    resolution: 'unresolved',
  };
}

function resolveDirectFrameworkReference(
  expression: ts.Expression,
  bindings: DirectBindings,
): FrameworkReference | undefined {
  if (ts.isIdentifier(expression)) {
    const importedApi = bindings.frameworkApis.get(expression.text);
    if (importedApi) return { ...importedApi, kind: 'api' };
    const moduleName = bindings.frameworkNamespaces.get(expression.text);
    return moduleName ? { kind: 'namespace', moduleName } : undefined;
  }
  if (!isControlMember(expression)) return undefined;

  const base = resolveDirectFrameworkReference(expression.expression, bindings);
  const member = getStaticMember(expression)?.method;
  if (!base || !member) return undefined;
  if (base.kind === 'namespace') {
    return isTestApi(member)
      ? { api: member, kind: 'api', moduleName: base.moduleName }
      : undefined;
  }
  return {
    ...base,
    api: isTestApi(member) ? member : base.api,
  };
}

function isKnownNonFrameworkReceiver(
  expression: ts.Expression,
  bindings: DirectBindings,
): boolean {
  const root = rootIdentifier(expression);
  return root ? bindings.nonFrameworkImports.has(root.text) : false;
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  let candidate = expression;
  while (
    ts.isCallExpression(candidate) ||
    ts.isElementAccessExpression(candidate) ||
    ts.isPropertyAccessExpression(candidate)
  ) {
    candidate = candidate.expression;
  }
  return ts.isIdentifier(candidate) ? candidate : undefined;
}

function isDirectControlUseHandledByParent(member: ControlMember): boolean {
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

function receiverLabel(
  expression: ts.Expression,
  parsed: ts.SourceFile,
): string {
  const root = rootIdentifier(expression);
  return root?.text ?? expression.getText(parsed).replaceAll(/\s+/g, '');
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

function isControlMember(node: ts.Node): node is ControlMember {
  return (
    ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)
  );
}

function getStaticMember(
  member: ControlMember,
): { location: ts.Node; method: string } | undefined {
  if (ts.isPropertyAccessExpression(member)) {
    return { location: member.name, method: member.name.text };
  }
  const method = staticStringValue(member.argumentExpression);
  return method ? { location: member.argumentExpression, method } : undefined;
}

function isFrameworkModule(value: string): value is FrameworkModule {
  return FRAMEWORK_MODULES.has(value as FrameworkModule);
}

function isTestApi(value: string): value is TestApi {
  return TEST_APIS.has(value as TestApi);
}

function formatUnapprovedOccurrence(
  occurrence: FrameworkControlOccurrence,
): string {
  if (occurrence.resolution === 'unresolved') {
    return `${occurrence.filePath}:${occurrence.lineNumber} unapproved unresolved receiver ${occurrence.api}.${occurrence.method} ${occurrence.kind}; remove it or prove the receiver is non-framework code.`;
  }
  return `${occurrence.filePath}:${occurrence.lineNumber} unapproved ${occurrence.moduleName} ${occurrence.api}.${occurrence.method} ${occurrence.kind}; remove it or add one exact documented allowance.`;
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
