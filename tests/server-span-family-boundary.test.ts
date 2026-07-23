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

function isMethodCall(
  call: ts.CallExpression,
  receiver: string,
  method: string,
): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.expression.getText() === receiver &&
    call.expression.name.text === method
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

function isSafeAttributeProjection(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'projectSafeSpanAttributes'
  );
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
  it('allows only the six pinned startSpan sites within five families', () => {
    expect(Object.keys(SERVER_SPAN_FAMILIES)).toEqual([
      'finalizeExamAnswers',
      'getBookmarks',
      'getUserStats',
      'getAttemptedQuestions',
      'stripe',
    ]);

    const actualSites = fg
      .sync(PRODUCTION_SOURCE_GLOBS, {
        cwd: process.cwd(),
        ignore: PRODUCTION_SOURCE_IGNORE_GLOBS,
        onlyFiles: true,
      })
      .sort()
      .flatMap((filePath) => {
        const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
        const sourceFile = ts.createSourceFile(
          filePath,
          source,
          ts.ScriptTarget.Latest,
          true,
        );
        const calls = collectCallExpressions(sourceFile, (call) =>
          isMethodCall(call, 'Sentry', 'startSpan'),
        );
        return calls.length > 0 ? [{ filePath, calls }] : [];
      });

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
        (call) => isMethodCall(call, 'span', 'setAttributes'),
      );
      for (const write of manualAttributeWrites) {
        expect(write.arguments).toHaveLength(1);
        expect(isSafeAttributeProjection(write.arguments[0])).toBe(true);
      }
    }
  });
});
