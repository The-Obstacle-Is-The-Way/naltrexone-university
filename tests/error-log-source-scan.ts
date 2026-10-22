import ts from '@typescript/typescript6';

type Source = { filePath: string; contents: string };
const LOG_METHODS = new Set(['error', 'warn', 'info', 'debug', 'fatal', 'log']);

// Follow declarations, not identifier spellings: aliases and formatter helpers
// must not hide the raw-message patterns this guard is intended to reject.
export function collectRawErrorLogIssues(sources: readonly Source[]): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    const file = ts.createSourceFile(
      source.filePath,
      source.contents,
      ts.ScriptTarget.Latest,
      true,
      source.filePath.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const host = ts.createCompilerHost({ noLib: true, noResolve: true });
    host.getSourceFile = (name) =>
      name === source.filePath ? file : undefined;
    const program = ts.createProgram(
      [source.filePath],
      { noLib: true, noResolve: true },
      host,
    );
    const checker = program.getTypeChecker();
    const declarations = (node: ts.Node) =>
      (ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node)
      )?.declarations ?? [];
    // Only the shared projector, imported from its module, is exempt: a
    // local function with the same name could return raw text.
    const isSharedProjector = (identifier: ts.Identifier) =>
      declarations(identifier).some((declaration) => {
        if (!ts.isImportSpecifier(declaration)) return false;
        const imported = (declaration.propertyName ?? declaration.name).text;
        const module = declaration.parent.parent.parent.moduleSpecifier;
        return (
          imported === 'projectSafeErrorDiagnostics' &&
          ts.isStringLiteral(module) &&
          /(^|\/)safe-error-diagnostics$/.test(module.text)
        );
      });
    // A logging boundary returns nothing: annotated `void`, or unannotated
    // with no `return <value>`. A helper that logs and returns is not one.
    const returnsNothing = (decl: ts.FunctionDeclaration) => {
      if (decl.type) return decl.type.kind === ts.SyntaxKind.VoidKeyword;
      let returnsValue = false;
      function visitReturn(child: ts.Node): void {
        if (ts.isReturnStatement(child) && child.expression)
          returnsValue = true;
        else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visitReturn);
      }
      if (decl.body) ts.forEachChild(decl.body, visitReturn);
      return !returnsValue;
    };
    function isLog(node: ts.Node, seen = new Set<ts.Node>()): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (ts.isPropertyAccessExpression(node))
        return LOG_METHODS.has(node.name.text);
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression)
      )
        return LOG_METHODS.has(node.argumentExpression.text);
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'bind'
      )
        return isLog(node.expression.expression, seen);
      if (ts.isIdentifier(node))
        return declarations(node).some((decl) => {
          if (ts.isVariableDeclaration(decl) && decl.initializer)
            return isLog(decl.initializer, seen);
          if (
            ts.isFunctionDeclaration(decl) &&
            decl.body &&
            returnsNothing(decl)
          ) {
            let logs = false;
            function visit(child: ts.Node): void {
              if (ts.isCallExpression(child) && isLog(child.expression, seen))
                logs = true;
              else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
            }
            visit(decl.body);
            return logs;
          }
          return (
            ts.isBindingElement(decl) &&
            LOG_METHODS.has((decl.propertyName ?? decl.name).getText(file))
          );
        });
      return false;
    }
    function tainted(node: ts.Node, seen = new Set<ts.Node>()): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (
        ts.isPropertyAccessExpression(node) &&
        ['message', 'stack'].includes(node.name.text)
      )
        return true;
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression) &&
        ['message', 'stack'].includes(node.argumentExpression.text)
      )
        return true;
      if (
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)
      )
        return false;
      if (ts.isConditionalExpression(node))
        return tainted(node.whenTrue, seen) || tainted(node.whenFalse, seen);
      if (ts.isCallExpression(node)) {
        if (
          ts.isIdentifier(node.expression) &&
          isSharedProjector(node.expression)
        )
          return false;
        if (
          (ts.isIdentifier(node.expression)
            ? node.expression.text === 'String'
            : node.expression.getText(file) === 'JSON.stringify') &&
          node.arguments.some((arg) => tainted(arg, seen))
        )
          return true;
        if (
          ts.isIdentifier(node.expression) &&
          declarations(node.expression).some((decl) => tainted(decl, seen))
        )
          return true;
        return false;
      }
      if (ts.isIdentifier(node))
        return declarations(node).some((decl) => {
          if (ts.isFunctionDeclaration(decl)) return tainted(decl, seen);
          if (ts.isVariableDeclaration(decl) && ts.isCatchClause(decl.parent))
            return true;
          if (
            ts.isParameter(decl) &&
            /^(err(or)?|cause)$/i.test(node.text) &&
            (!decl.type ||
              decl.type.kind === ts.SyntaxKind.UnknownKeyword ||
              decl.type.getText(file).includes('Error'))
          )
            return true;
          if (ts.isVariableDeclaration(decl) && decl.initializer)
            return tainted(decl.initializer, seen);
          if (ts.isBindingElement(decl))
            return ['message', 'stack'].includes(
              (decl.propertyName ?? decl.name).getText(file),
            );
          return false;
        });
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        if (!node.body) return false;
        if (!ts.isBlock(node.body)) return tainted(node.body, seen);
        const returns: ts.ReturnStatement[] = [];
        function visitReturn(child: ts.Node): void {
          if (ts.isReturnStatement(child)) returns.push(child);
          else if (!ts.isFunctionLike(child))
            ts.forEachChild(child, visitReturn);
        }
        ts.forEachChild(node.body, visitReturn);
        return returns.some(
          (result) => result.expression && tainted(result.expression, seen),
        );
      }
      let result = false;
      ts.forEachChild(node, (child) => {
        if (tainted(child, seen)) result = true;
      });
      return result;
    }
    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        isLog(node.expression) &&
        node.arguments.some((arg) => tainted(arg))
      ) {
        const line =
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        issues.push(
          `${source.filePath}:${line}: raw error text reaches a log; project diagnostics instead`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return issues;
}
