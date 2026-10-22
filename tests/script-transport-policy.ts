import ts from '@typescript/typescript6';
import type { TestSourceFile } from './test-double-fidelity-source-scan';

function member(
  node: ts.Expression,
): { owner: ts.Expression; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node))
    return { owner: node.expression, name: node.name.text };
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return { owner: node.expression, name: node.argumentExpression.text };
  return undefined;
}

// Bounded literal-source contract: globals, named/namespace Vitest imports,
// dot/bracket APIs and literal import() targets. Not arbitrary JS evaluation.
export function childProcessModuleMocks(
  sources: readonly TestSourceFile[],
): string[] {
  return sources.flatMap(({ filePath, contents }) => {
    // Only sources that spell 'child_process' literally are parsed; an escaped
    // spelling is outside this literal-source contract.
    if (!contents.includes('child_process')) return [];
    const parsed = ts.createSourceFile(
      filePath,
      contents,
      ts.ScriptTarget.Latest,
      true,
    );
    const names = new Set(['vi', 'vitest']);
    const namespaces = new Set<string>();
    for (const statement of parsed.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== 'vitest'
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings))
        namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements) {
          if (
            ['vi', 'vitest'].includes(
              element.propertyName?.text ?? element.name.text,
            )
          )
            names.add(element.name.text);
        }
    }
    const issues: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const call = member(node.expression);
        const namespace = call && member(call.owner);
        const isVitest =
          call &&
          ((ts.isIdentifier(call.owner) && names.has(call.owner.text)) ||
            (namespace &&
              ['vi', 'vitest'].includes(namespace.name) &&
              ts.isIdentifier(namespace.owner) &&
              namespaces.has(namespace.owner.text)));
        if (call && isVitest && ['mock', 'doMock'].includes(call.name)) {
          let target = node.arguments[0];
          if (
            target &&
            ts.isCallExpression(target) &&
            target.expression.kind === ts.SyntaxKind.ImportKeyword
          )
            target = target.arguments[0];
          if (
            target &&
            ts.isStringLiteralLike(target) &&
            ['node:child_process', 'child_process'].includes(target.text)
          )
            issues.push(
              `${filePath}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`,
            );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    return issues;
  });
}
