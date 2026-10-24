import path from 'node:path';
import ts from '@typescript/typescript6';

/** A bounded wiring check, not a proof of arbitrary module side effects. */
export function entryPointPolicyIssues(source: string, file: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let executable = false;
  let legacyCheck = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      if (
        node.expression.getText(tree) === 'process' &&
        ['argv', 'exitCode'].includes(node.name.text)
      )
        executable = true;
      if (
        node.expression.getText(tree) === 'import.meta' &&
        node.name.text === 'url'
      )
        executable = true;
    }
    if (ts.isIdentifier(node) && node.text === 'pathToFileURL')
      legacyCheck = true;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (!executable) return [];
  const imported = tree.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      return false;
    if (
      path.resolve(path.dirname(file), statement.moduleSpecifier.text) !==
      path.resolve('scripts/lib/entry-point.mts')
    )
      return false;
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) =>
          !element.isTypeOnly &&
          element.name.text === 'isMain' &&
          (element.propertyName?.text ?? element.name.text) === 'isMain',
      )
    );
  });
  const guarded = tree.statements.some((statement) => {
    if (!ts.isIfStatement(statement)) return false;
    const expression = statement.expression;
    return (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'isMain' &&
      expression.arguments.length === 1 &&
      expression.arguments[0]?.getText(tree) === 'import.meta.url'
    );
  });
  return [
    ...(!imported ? ['Missing shared entry import'] : []),
    ...(!guarded ? ['Missing top-level shared entry check'] : []),
    ...(legacyCheck ? ['Legacy file-URL entry comparison'] : []),
  ];
}
