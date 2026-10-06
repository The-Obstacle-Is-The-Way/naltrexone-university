// Source scanner behind the server action boundary guards
// (tests/server-action-signatures.test.ts, tests/server-action-input.test.ts).
// BUG-324: a client can call an exported server action with any arguments, so
// every export of a 'use server' module takes only its input. It reads the
// syntax because Function.length ignores default and rest parameters.
import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const ROOTS = ['app', 'src', 'lib', 'components'];
const TEST_SUPPORT =
  /\.(test|spec)\.tsx?$|test-helpers|\.browser\.probes\.tsx$/;

// The browser-called controller actions (BUG-324) are thin wrappers: each
// passes its input, alone, to the controller export of its own name, so no
// client value can reach the controller's test dependencies.
const CONTROLLER_WRAPPER = /^src\/adapters\/controllers\/[^/]+-actions\.ts$/;

function wrapperIssue(
  name: string,
  declaration: ts.FunctionDeclaration,
): string | undefined {
  const [statement, ...rest] = declaration.body?.statements ?? [];
  const call =
    statement && ts.isReturnStatement(statement)
      ? statement.expression
      : undefined;
  const [parameter] = declaration.parameters;
  const [argument, ...extra] =
    call && ts.isCallExpression(call) ? call.arguments : [];
  const passesInputToItsName =
    rest.length === 0 &&
    call !== undefined &&
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'controller' &&
    call.expression.name.text === name &&
    extra.length === 0 &&
    argument !== undefined &&
    ts.isIdentifier(argument) &&
    parameter !== undefined &&
    ts.isIdentifier(parameter.name) &&
    argument.text === parameter.name.text;
  return passesInputToItsName
    ? undefined
    : `${name} must only return controller.${name}(input)`;
}

export type ServerActionScan = {
  isServerActionModule: boolean;
  exportedActions: string[];
  issues: string[];
};

function hasUseServerDirective(statements: readonly ts.Statement[]): boolean {
  for (const statement of statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    )
      return false;
    if (statement.expression.text === 'use server') return true;
  }
  return false;
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function isDefaultExport(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    )
  );
}

function parameterIssue(
  name: string,
  parameters: readonly ts.ParameterDeclaration[],
): string | undefined {
  if (parameters.length > 1)
    return `${name} takes ${parameters.length} parameters`;
  const [parameter] = parameters;
  if (parameter?.dotDotDotToken) return `${name} has a rest parameter`;
  if (parameter?.initializer) return `${name} has a default parameter`;
  return undefined;
}

export function scanServerActionSource(
  file: string,
  source: string,
): ServerActionScan {
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const issues: string[] = [];
  const exportedActions: string[] = [];
  const at = (node: ts.Node, issue: string) =>
    issues.push(
      `${file}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${issue}`,
    );

  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionLike(node) &&
      'body' in node &&
      node.body &&
      ts.isBlock(node.body) &&
      hasUseServerDirective(node.body.statements)
    )
      at(node, "'use server' inside a function");
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(ast, visit);

  const isServerActionModule = hasUseServerDirective(ast.statements);
  if (!isServerActionModule)
    return { isServerActionModule, exportedActions, issues };

  for (const statement of ast.statements) {
    if (ts.isExportDeclaration(statement)) {
      const typeOnly =
        statement.isTypeOnly ||
        (statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.every(
            (element) => element.isTypeOnly,
          ));
      if (!typeOnly) at(statement, 're-exports from another module');
    } else if (ts.isExportAssignment(statement) || isDefaultExport(statement)) {
      at(statement, 'has a default export');
    } else if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      const name = statement.name?.text ?? 'anonymous';
      const issue =
        parameterIssue(name, statement.parameters) ??
        (CONTROLLER_WRAPPER.test(file)
          ? wrapperIssue(name, statement)
          : undefined);
      if (issue) at(statement, issue);
      else exportedActions.push(name);
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(ast);
        const value = declaration.initializer;
        if (
          value &&
          (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
        ) {
          const issue = parameterIssue(name, value.parameters);
          if (issue) at(statement, issue);
          else exportedActions.push(name);
        } else {
          at(statement, `${name} is not a function declaration`);
        }
      }
    } else if (
      isExported(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement)
    ) {
      at(statement, 'exports something other than an action');
    }
  }
  return { isServerActionModule, exportedActions, issues };
}

// Every source file that could declare a server action: any whose text holds
// the directive, which a module- or function-level 'use server' must.
export function scanServerActionFiles(): (ServerActionScan & {
  file: string;
})[] {
  return ROOTS.flatMap((root) => [
    ...globSync(`${root}/**/*.ts`),
    ...globSync(`${root}/**/*.tsx`),
  ])
    .filter((file) => !TEST_SUPPORT.test(file))
    .sort()
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('use server')
        ? [{ file, ...scanServerActionSource(file, source) }]
        : [];
    });
}

export function findServerActionModules(): (ServerActionScan & {
  file: string;
})[] {
  return scanServerActionFiles().filter(
    ({ isServerActionModule }) => isServerActionModule,
  );
}
