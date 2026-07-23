import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SERVER_SPAN_FAMILIES } from '@/src/adapters/shared/server-tracing';

const PRODUCTION_SOURCE_GLOBS = [
  'app/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'src/**/*.{ts,tsx}',
  '*.ts',
];
const PRODUCTION_SOURCE_IGNORE_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.browser.spec.tsx',
  '**/*test-helpers.ts',
  '**/*test-helpers.tsx',
];

const EXPECTED_START_SPAN_SITES = [
  {
    filePath: 'lib/container/use-cases.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.finalizeExamAnswers',
  },
  {
    filePath: 'src/adapters/controllers/bookmark-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getBookmarks',
  },
  {
    filePath: 'src/adapters/controllers/review-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getAttemptedQuestions',
  },
  {
    filePath: 'src/adapters/controllers/stats-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getUserStats',
  },
  {
    filePath: 'src/adapters/controllers/stripe-webhook-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.stripe.parent',
  },
  {
    filePath: 'src/adapters/gateways/stripe/stripe-subscription-normalizer.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.stripe.subscriptionRetrieve',
  },
] as const;

interface SourceAnalysis {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
}

const SOURCE_ANALYSIS_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  noLib: true,
  noResolve: true,
  target: ts.ScriptTarget.Latest,
};

function collectCallExpressions(
  root: ts.Node,
  predicate: (call: ts.CallExpression) => boolean,
): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && predicate(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return calls;
}

function findImportDeclaration(
  node: ts.Node,
): ts.ImportDeclaration | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isImportDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isNamespaceImportFrom(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  moduleName: string,
): boolean {
  const declarations = checker.getSymbolAtLocation(identifier)?.declarations;
  return Boolean(
    declarations?.some((declaration) => {
      if (!ts.isNamespaceImport(declaration)) return false;
      const importDeclaration = findImportDeclaration(declaration);
      return (
        importDeclaration !== undefined &&
        ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
        importDeclaration.moduleSpecifier.text === moduleName
      );
    }),
  );
}

function isNamedImportFrom(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  moduleName: string,
  importedName: string,
): boolean {
  const declarations = checker.getSymbolAtLocation(identifier)?.declarations;
  return Boolean(
    declarations?.some((declaration) => {
      if (!ts.isImportSpecifier(declaration)) return false;
      const importDeclaration = findImportDeclaration(declaration);
      return (
        (declaration.propertyName ?? declaration.name).text === importedName &&
        importDeclaration !== undefined &&
        ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
        importDeclaration.moduleSpecifier.text === moduleName
      );
    }),
  );
}

function isApprovedStartSpanCall(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): boolean {
  if (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'startSpan' &&
    ts.isIdentifier(call.expression.expression)
  ) {
    return isNamespaceImportFrom(
      call.expression.expression,
      checker,
      '@sentry/nextjs',
    );
  }

  return (
    ts.isIdentifier(call.expression) &&
    isNamedImportFrom(call.expression, checker, '@sentry/nextjs', 'startSpan')
  );
}

function isSpanAttributeWrite(call: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.expression.getText() === 'span' &&
    call.expression.name.text === 'setAttributes'
  );
}

function getProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === name,
  );
}

function isSafeAttributeProjection(
  node: ts.Node | undefined,
  checker: ts.TypeChecker,
): boolean {
  return (
    node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    isNamedImportFrom(
      node.expression,
      checker,
      '@/src/adapters/shared/server-tracing',
      'projectSafeSpanAttributes',
    )
  );
}

function findApprovedStartSpanCalls(
  analysis: SourceAnalysis,
): ts.CallExpression[] {
  return collectCallExpressions(analysis.sourceFile, (call) =>
    isApprovedStartSpanCall(call, analysis.checker),
  );
}

function findSafeAttributeProjectionCalls(
  analysis: SourceAnalysis,
): ts.CallExpression[] {
  return collectCallExpressions(analysis.sourceFile, (call) =>
    isSafeAttributeProjection(call, analysis.checker),
  );
}

function analyzeSourceText(source: string): SourceAnalysis {
  const fileName = '/virtual/server-span-family-boundary-fixture.ts';
  const host = ts.createCompilerHost(SOURCE_ANALYSIS_OPTIONS);
  host.fileExists = (candidate) => candidate === fileName;
  host.readFile = (candidate) => (candidate === fileName ? source : undefined);
  host.getSourceFile = (candidate, languageVersion) =>
    candidate === fileName
      ? ts.createSourceFile(candidate, source, languageVersion, true)
      : undefined;

  const program = ts.createProgram([fileName], SOURCE_ANALYSIS_OPTIONS, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error('Failed to parse server span boundary fixture');
  }

  return { sourceFile, checker: program.getTypeChecker() };
}

function analyzeSourcePaths(filePaths: readonly string[]): SourceAnalysis[] {
  const absolutePaths = filePaths.map((filePath) =>
    resolve(process.cwd(), filePath),
  );
  const program = ts.createProgram(absolutePaths, SOURCE_ANALYSIS_OPTIONS);
  const checker = program.getTypeChecker();

  return absolutePaths.flatMap((absolutePath) => {
    const sourceFile = program.getSourceFile(absolutePath);
    return sourceFile ? [{ sourceFile, checker }] : [];
  });
}

function findContainingBlock(node: ts.Node): ts.Block | undefined {
  let current = node.parent;
  while (current) {
    if (ts.isBlock(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function hasPinnedFamilyDeclaration(
  call: ts.CallExpression,
  familyReference: string,
): boolean {
  const block = findContainingBlock(call);
  if (!block) return false;

  return block.statements
    .filter((statement) => statement.getStart() < call.getStart())
    .some(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === 'family' &&
            declaration.initializer?.getText() === familyReference,
        ),
    );
}

describe('server span family boundary', () => {
  it('accepts tracing calls only when identifiers resolve to approved imports', () => {
    const approved = analyzeSourceText(`
      import * as Telemetry from '@sentry/nextjs';
      import { startSpan as beginSpan } from '@sentry/nextjs';
      import {
        projectSafeSpanAttributes as safeAttributes,
      } from '@/src/adapters/shared/server-tracing';

      Telemetry.startSpan(
        { attributes: safeAttributes({ 'app.count': 1 }) },
        () => undefined,
      );
      beginSpan(
        { attributes: safeAttributes({ 'app.count': 1 }) },
        () => undefined,
      );
    `);
    const wrongModule = analyzeSourceText(`
      import * as Sentry from 'unrelated-telemetry';
      import { projectSafeSpanAttributes } from 'unrelated-projector';

      Sentry.startSpan(
        { attributes: projectSafeSpanAttributes({ 'app.count': 1 }) },
        () => undefined,
      );
    `);
    const shadowed = analyzeSourceText(`
      import * as Sentry from '@sentry/nextjs';
      import {
        projectSafeSpanAttributes,
      } from '@/src/adapters/shared/server-tracing';

      function run(
        Sentry: { startSpan: (config: unknown) => unknown },
        projectSafeSpanAttributes: (input: unknown) => unknown,
      ) {
        return Sentry.startSpan({
          attributes: projectSafeSpanAttributes({ 'app.count': 1 }),
        });
      }
    `);

    expect(findApprovedStartSpanCalls(approved)).toHaveLength(2);
    expect(findSafeAttributeProjectionCalls(approved)).toHaveLength(2);
    expect(findApprovedStartSpanCalls(wrongModule)).toHaveLength(0);
    expect(findSafeAttributeProjectionCalls(wrongModule)).toHaveLength(0);
    expect(findApprovedStartSpanCalls(shadowed)).toHaveLength(0);
    expect(findSafeAttributeProjectionCalls(shadowed)).toHaveLength(0);
  });

  it('allows only the six pinned startSpan sites within five families', () => {
    expect(Object.keys(SERVER_SPAN_FAMILIES)).toEqual([
      'finalizeExamAnswers',
      'getBookmarks',
      'getUserStats',
      'getAttemptedQuestions',
      'stripe',
    ]);

    const candidatePaths = fg
      .sync(PRODUCTION_SOURCE_GLOBS, {
        cwd: process.cwd(),
        ignore: PRODUCTION_SOURCE_IGNORE_GLOBS,
        onlyFiles: true,
      })
      .sort()
      .filter((filePath) => {
        const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
        return source.includes('startSpan');
      });
    const actualSites = analyzeSourcePaths(candidatePaths).flatMap(
      (analysis) => {
        const calls = findApprovedStartSpanCalls(analysis);
        const filePath = candidatePaths.find((candidate) =>
          analysis.sourceFile.fileName.endsWith(candidate),
        );
        return filePath && calls.length > 0
          ? [{ filePath, calls, checker: analysis.checker }]
          : [];
      },
    );

    expect(
      actualSites.map(({ filePath, calls }) => ({
        filePath,
        count: calls.length,
      })),
    ).toEqual(
      EXPECTED_START_SPAN_SITES.map(({ filePath }) => ({
        filePath,
        count: 1,
      })),
    );

    for (const expected of EXPECTED_START_SPAN_SITES) {
      const actual = actualSites.find(
        ({ filePath }) => filePath === expected.filePath,
      );
      expect(actual?.calls).toHaveLength(1);
      const startSpanCall = actual?.calls[0];
      if (!startSpanCall) continue;
      const checker = actual.checker;

      expect(
        hasPinnedFamilyDeclaration(startSpanCall, expected.familyReference),
      ).toBe(true);

      const config = startSpanCall.arguments[0];
      expect(config && ts.isObjectLiteralExpression(config)).toBe(true);
      if (!config || !ts.isObjectLiteralExpression(config)) continue;

      expect(getProperty(config, 'name')?.initializer.getText()).toBe(
        'family.name',
      );
      expect(getProperty(config, 'op')?.initializer.getText()).toBe(
        'family.op',
      );
      expect(
        isSafeAttributeProjection(
          getProperty(config, 'attributes')?.initializer,
          checker,
        ),
      ).toBe(true);

      const callback = startSpanCall.arguments[1];
      expect(
        callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)),
      ).toBe(true);
      if (
        !callback ||
        (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
      ) {
        continue;
      }

      const manualAttributeWrites = collectCallExpressions(
        callback.body,
        isSpanAttributeWrite,
      );
      for (const write of manualAttributeWrites) {
        expect(write.arguments).toHaveLength(1);
        expect(isSafeAttributeProjection(write.arguments[0], checker)).toBe(
          true,
        );
      }
    }
  });
});
