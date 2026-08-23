import path from 'node:path';
import ts from 'typescript';
import type {
  TestDoubleOccurrence,
  TestSourceFile,
} from './test-double-fidelity-source-scan';

const TYPE_WRAPPERS_THAT_PRESERVE_PORT_IDENTITY = new Set([
  'Omit',
  'Partial',
  'Pick',
  'Readonly',
  'Required',
]);

export function readRepositoryCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    process.cwd(),
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (!configPath) {
    throw new Error('Could not find tsconfig.json for the test-double scan');
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatTypeScriptDiagnostics([configFile.error]));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  if (parsed.errors.length > 0) {
    throw new Error(formatTypeScriptDiagnostics(parsed.errors));
  }

  return parsed.options;
}

export function collectHandRolledPortDoubleOccurrences(
  sources: readonly TestSourceFile[],
  fakePortNames: ReadonlySet<string>,
  compilerOptions: ts.CompilerOptions = {},
): TestDoubleOccurrence[] {
  const program = createProgramForSources(sources, compilerOptions);
  const checker = program.getTypeChecker();
  const occurrences: TestDoubleOccurrence[] = [];

  for (const source of sources) {
    const parsed = program.getSourceFile(absolutePathFor(source.filePath));
    if (!parsed) {
      throw new Error(
        `TypeScript did not parse test source: ${source.filePath}`,
      );
    }
    const parsedSource = parsed;
    const recordedPortsByObject = new Map<
      ts.ObjectLiteralExpression,
      Set<string>
    >();

    function recordOrigins(
      expression: ts.Expression,
      portNames: ReadonlySet<string>,
    ): void {
      for (const objectLiteral of findOriginObjectLiterals(
        expression,
        checker,
      )) {
        const recordedPorts =
          recordedPortsByObject.get(objectLiteral) ?? new Set<string>();
        for (const portName of portNames) {
          recordedPorts.add(portName);
        }
        recordedPortsByObject.set(objectLiteral, recordedPorts);
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isObjectLiteralExpression(node)) {
        const portNames = collectFakePortNamesFromType(
          checker.getContextualType(node),
          fakePortNames,
        );
        if (portNames.size > 0) {
          recordOrigins(node, portNames);
        }
      }

      if (ts.isIdentifier(node) || ts.isCallExpression(node)) {
        const portNames = collectFakePortNamesFromType(
          checker.getContextualType(node),
          fakePortNames,
        );
        if (portNames.size > 0) {
          recordOrigins(node, portNames);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(parsedSource);
    for (const [objectLiteral, portNames] of recordedPortsByObject) {
      const names = [...portNames].sort();
      occurrences.push({
        filePath: source.filePath,
        lineNumber: lineNumberFor(parsedSource, objectLiteral),
        detail: `object literal implements '${names.join(', ')}', which already has a maintained fake`,
      });
    }
  }

  return occurrences.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      left.lineNumber - right.lineNumber,
  );
}

function findOriginObjectLiterals(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seen = new Set<ts.Node>(),
): Set<ts.ObjectLiteralExpression> {
  const unwrapped = unwrapExpression(expression);
  if (seen.has(unwrapped)) {
    return new Set();
  }
  seen.add(unwrapped);

  if (ts.isObjectLiteralExpression(unwrapped)) {
    return new Set([unwrapped]);
  }

  if (ts.isIdentifier(unwrapped)) {
    const symbol = checker.getSymbolAtLocation(unwrapped);
    return collectObjectsFromDeclarations(
      symbol?.declarations ?? [],
      checker,
      seen,
    );
  }

  if (ts.isCallExpression(unwrapped)) {
    const declaration = checker.getResolvedSignature(unwrapped)?.declaration;
    return collectObjectsFromDeclarations(
      declaration ? [declaration] : [],
      checker,
      seen,
    );
  }

  return new Set();
}

function collectObjectsFromDeclarations(
  declarations: readonly ts.Declaration[],
  checker: ts.TypeChecker,
  seen: Set<ts.Node>,
): Set<ts.ObjectLiteralExpression> {
  const objects = new Set<ts.ObjectLiteralExpression>();

  for (const declaration of declarations) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      addAll(
        objects,
        findOriginObjectLiterals(declaration.initializer, checker, seen),
      );
      continue;
    }

    if (isFunctionWithBody(declaration)) {
      const body = declaration.body;
      if (!ts.isBlock(body)) {
        addAll(objects, findOriginObjectLiterals(body, checker, seen));
        continue;
      }

      function visitReturn(node: ts.Node): void {
        if (node !== body && ts.isFunctionLike(node)) {
          return;
        }
        if (ts.isReturnStatement(node) && node.expression) {
          addAll(
            objects,
            findOriginObjectLiterals(node.expression, checker, seen),
          );
          return;
        }
        ts.forEachChild(node, visitReturn);
      }

      visitReturn(body);
    }
  }

  return objects;
}

function isFunctionWithBody(
  declaration: ts.Declaration,
): declaration is (
  | ts.ArrowFunction
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.MethodDeclaration
) & { body: ts.ConciseBody } {
  return (
    (ts.isArrowFunction(declaration) ||
      ts.isFunctionDeclaration(declaration) ||
      ts.isFunctionExpression(declaration) ||
      ts.isMethodDeclaration(declaration)) &&
    Boolean(declaration.body)
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let unwrapped = expression;
  while (
    ts.isParenthesizedExpression(unwrapped) ||
    ts.isAsExpression(unwrapped) ||
    ts.isSatisfiesExpression(unwrapped) ||
    ts.isNonNullExpression(unwrapped)
  ) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function addAll<T>(target: Set<T>, source: ReadonlySet<T>): void {
  for (const value of source) {
    target.add(value);
  }
}

function lineNumberFor(parsed: ts.SourceFile, node: ts.Node): number {
  return parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
}

function absolutePathFor(filePath: string): string {
  return path.resolve(process.cwd(), filePath);
}

function createProgramForSources(
  sources: readonly TestSourceFile[],
  compilerOptions: ts.CompilerOptions,
): ts.Program {
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    ...compilerOptions,
  };
  const defaultHost = ts.createCompilerHost(options, true);
  const sourcesByPath = new Map(
    sources.map((source) => [absolutePathFor(source.filePath), source]),
  );
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (fileName) =>
      sourcesByPath.has(path.resolve(fileName)) ||
      defaultHost.fileExists(fileName),
    readFile: (fileName) =>
      sourcesByPath.get(path.resolve(fileName))?.contents ??
      defaultHost.readFile(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNew) => {
      const source = sourcesByPath.get(path.resolve(fileName));
      if (source) {
        return ts.createSourceFile(
          fileName,
          source.contents,
          languageVersion,
          true,
          source.filePath.endsWith('.tsx')
            ? ts.ScriptKind.TSX
            : ts.ScriptKind.TS,
        );
      }
      return defaultHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNew,
      );
    },
  };

  return ts.createProgram({
    rootNames: [...sourcesByPath.keys()],
    options,
    host,
  });
}

function collectFakePortNamesFromType(
  type: ts.Type | undefined,
  fakePortNames: ReadonlySet<string>,
  seen = new Set<ts.Type>(),
): Set<string> {
  if (!type || seen.has(type)) {
    return new Set();
  }
  seen.add(type);

  const names = new Set<string>();
  for (const symbolName of [
    type.aliasSymbol?.getName(),
    type.symbol?.getName(),
  ]) {
    if (symbolName && fakePortNames.has(symbolName)) {
      names.add(symbolName);
    }
  }

  if (type.isUnionOrIntersection()) {
    for (const childType of type.types) {
      addAll(
        names,
        collectFakePortNamesFromType(childType, fakePortNames, seen),
      );
    }
  }

  const aliasName = type.aliasSymbol?.getName();
  if (aliasName && TYPE_WRAPPERS_THAT_PRESERVE_PORT_IDENTITY.has(aliasName)) {
    for (const typeArgument of type.aliasTypeArguments ?? []) {
      addAll(
        names,
        collectFakePortNamesFromType(typeArgument, fakePortNames, seen),
      );
    }
  }

  return names;
}

function formatTypeScriptDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
}
