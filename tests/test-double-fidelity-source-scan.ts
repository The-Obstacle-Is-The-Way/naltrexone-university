import { readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';

export {
  collectHandRolledPortDoubleOccurrences,
  readRepositoryCompilerOptions,
} from './test-double-fidelity-port-double-scan';

export type TestSourceFile = {
  filePath: string;
  contents: string;
};

export type TestDoubleOccurrence = {
  filePath: string;
  lineNumber: number;
  detail: string;
};

type UnknownCastContext = {
  source: TestSourceFile;
  parsed: ts.SourceFile;
  cast: ts.AsExpression;
  targetText: string;
  expressionText: string;
};

type UnknownCastAllowlistRule = {
  name: string;
  rationale: string;
  matches: (context: UnknownCastContext) => boolean;
};

type IntentionalInvalidCastPattern = {
  filePath: RegExp;
  target: RegExp;
  expression: RegExp;
  rationale: string;
};

type MaintainedFakePortSources = {
  barrelSource: TestSourceFile;
  fakeSources: readonly TestSourceFile[];
  additionalFakeClassNames?: readonly string[];
};

const TEST_FILE_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
];

const TEST_FILE_IGNORE_GLOBS = [
  'node_modules/**',
  '.next/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
];

const APPLICATION_FAKE_BARREL_PATH =
  'src/application/test-helpers/fakes/index.ts';
const STRIPE_CHECKOUT_FAKE_PATH =
  'src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts';
const STRIPE_CHECKOUT_FAKE_CLASS = 'FakeStripeCheckoutClient';

const INTENTIONAL_INVALID_CAST_PATTERNS: readonly IntentionalInvalidCastPattern[] =
  [
    {
      filePath:
        /^src\/adapters\/repositories\/drizzle-question-repository\.test\.ts$/,
      target: /^QuestionProgressStatus$/,
      expression: /^['"]unknown['"]$/,
      rationale:
        'Exercises repository rejection of a deliberately impossible progress status.',
    },
    {
      filePath:
        /^src\/application\/use-cases\/get-next-question-fallback\.test\.ts$/,
      target:
        /^Parameters<\s*typeof getNextQuestion\.execute\s*>\s*\[\s*0\s*\]$/,
      expression: /^\{\s*userId:\s*USER_ID\s*\}$/,
      rationale:
        'Exercises the runtime guard for a deliberately incomplete use-case request.',
    },
    {
      filePath: /^src\/domain\/test-helpers\/factories\.test\.ts$/,
      target:
        /^Parameters<\s*typeof createQuestionRatingFeedback\s*>\s*\[\s*0\s*\]$/,
      expression: /^\{[\s\S]*kind:\s*['"]report['"][\s\S]*\}$/,
      rationale:
        'Supplies the report discriminator deliberately to prove the rating factory reasserts its invariants.',
    },
    {
      filePath: /^src\/domain\/test-helpers\/factories\.test\.ts$/,
      target:
        /^Parameters<\s*typeof createQuestionReportFeedback\s*>\s*\[\s*0\s*\]$/,
      expression: /^\{[\s\S]*kind:\s*['"]rating['"][\s\S]*\}$/,
      rationale:
        'Supplies the rating discriminator deliberately to prove the report factory reasserts its invariants.',
    },
    {
      filePath:
        /^src\/application\/test-helpers\/fakes\/fake-practice-session-repository\.test\.ts$/,
      target: /^ReturnType<\s*typeof createPracticeSession\s*>$/,
      expression: /^legacySession$/,
      rationale:
        'Models a deliberately incomplete legacy persisted session for compatibility coverage.',
    },
    {
      filePath:
        /^tests\/integration\/practice-session-params-json-cleanup\.integration\.test\.ts$/,
      target: /^schema\.PracticeSessionParams$/,
      expression: /^objectParamsJson$/,
      rationale:
        'Seeds deliberately legacy JSON so the cleanup migration can repair it.',
    },
    {
      filePath:
        /^src\/adapters\/jobs\/reconcile-stripe-subscriptions\.test\.ts$/,
      target: /^ReconciliationDeps\s*\[\s*['"]stripe['"]\s*\]$/,
      expression: /^\{[\s\S]*subscriptions:\s*undefined[\s\S]*\}$/,
      rationale:
        'Removes a required provider surface deliberately to prove the reconciliation guard.',
    },
    {
      filePath:
        /^src\/application\/use-cases\/save-exam-draft-answer\.test\.ts$/,
      target: /^number$/,
      expression: /^Number\.NaN$/,
      rationale:
        'Passes NaN deliberately through the public numeric seam to prove normalization.',
    },
  ];

// These are shape-only test seams, not behavioral collaborators. Each rule is
// narrow on purpose so a new target starts at a zero ratchet floor.
export const UNKNOWN_CAST_ALLOWLIST: readonly UnknownCastAllowlistRule[] = [
  {
    name: 'process-env-fixture',
    rationale:
      'A partial environment fixture exercises parsing while production still receives NodeJS.ProcessEnv.',
    matches: ({ targetText }) => targetText === 'NodeJS.ProcessEnv',
  },
  {
    name: 'timer-handle-platform-shape',
    rationale:
      'Browser and Node timer handles differ structurally; these tests only carry the opaque handle.',
    matches: ({ targetText }) => targetText === 'ReturnType<typeof setTimeout>',
  },
  {
    name: 'focusable-element-shape',
    rationale:
      'The focus helper consumes only HTMLElement.focus, so a narrow element shape is sufficient.',
    matches: ({ targetText }) => targetText === 'HTMLElement',
  },
  {
    name: 'dynamic-import-binding-type',
    rationale:
      'React 19 tests use typeof import(...) only to type bindings populated by beforeAll.',
    matches: ({ targetText }) => targetText.startsWith('typeof import('),
  },
  {
    name: 'exhaustiveness-negative-case',
    rationale:
      'A never cast deliberately reaches an exhaustive runtime guard with an impossible value.',
    matches: ({ cast }) => cast.type.kind === ts.SyntaxKind.NeverKeyword,
  },
  {
    name: 'intentional-invalid-fixture',
    rationale:
      'Negative and legacy-compatibility tests deliberately cross a runtime boundary with an invalid value; every accepted shape is enumerated below.',
    matches: (context) =>
      INTENTIONAL_INVALID_CAST_PATTERNS.some((pattern) =>
        matchesIntentionalInvalidCast(context, pattern),
      ),
  },
];

export function readTestSources(): TestSourceFile[] {
  return fg
    .sync(TEST_FILE_GLOBS, {
      cwd: process.cwd(),
      ignore: TEST_FILE_IGNORE_GLOBS,
      onlyFiles: true,
    })
    .sort()
    .map((filePath) => ({
      filePath,
      contents: readFileSync(path.resolve(process.cwd(), filePath), 'utf-8'),
    }));
}

export function collectMaintainedFakePortNames({
  barrelSource,
  fakeSources,
  additionalFakeClassNames = [],
}: MaintainedFakePortSources): Set<string> {
  const barrelExports = collectFakeBarrelExports(barrelSource);
  const sourcesByPath = new Map(
    fakeSources.map((source) => [
      path.posix.normalize(source.filePath),
      source,
    ]),
  );
  const ports = new Set<string>();

  for (const [fakeClassName, moduleSpecifier] of barrelExports) {
    const modulePath = resolveTypeScriptModulePath(
      barrelSource.filePath,
      moduleSpecifier,
      sourcesByPath,
    );
    const fakeSource = sourcesByPath.get(modulePath);
    if (!fakeSource) {
      throw new Error(
        `Could not resolve ${moduleSpecifier} for ${fakeClassName} from ${barrelSource.filePath}`,
      );
    }
    addImplementedPortNames(fakeSource, fakeClassName, ports);
  }

  for (const fakeClassName of additionalFakeClassNames) {
    const containingSources = fakeSources.filter((source) =>
      source.contents.includes(`class ${fakeClassName}`),
    );
    if (containingSources.length !== 1) {
      throw new Error(
        `Expected exactly one source for ${fakeClassName}, found ${containingSources.length}`,
      );
    }
    const fakeSource = containingSources[0];
    if (!fakeSource) {
      throw new Error(`Missing source for ${fakeClassName}`);
    }
    addImplementedPortNames(fakeSource, fakeClassName, ports);
  }

  return ports;
}

export function readMaintainedFakePortNames(): Set<string> {
  const barrelSource = readSourceFile(APPLICATION_FAKE_BARREL_PATH);
  const barrelExports = collectFakeBarrelExports(barrelSource);
  const modulePaths = new Set(
    [...barrelExports.values()].map((moduleSpecifier) =>
      path.posix.normalize(
        path.posix.join(
          path.posix.dirname(APPLICATION_FAKE_BARREL_PATH),
          `${moduleSpecifier}.ts`,
        ),
      ),
    ),
  );
  modulePaths.add(STRIPE_CHECKOUT_FAKE_PATH);

  return collectMaintainedFakePortNames({
    barrelSource,
    fakeSources: [...modulePaths].sort().map(readSourceFile),
    additionalFakeClassNames: [STRIPE_CHECKOUT_FAKE_CLASS],
  });
}

export function collectOwnCodeModuleMockOccurrences(
  sources: readonly TestSourceFile[],
): TestDoubleOccurrence[] {
  const occurrences: TestDoubleOccurrence[] = [];

  for (const source of sources) {
    const parsed = parseSource(source);

    function visit(node: ts.Node): void {
      if (isViMockCall(node)) {
        const [moduleArgument, implementationArgument] = node.arguments;
        if (
          moduleArgument &&
          ts.isStringLiteralLike(moduleArgument) &&
          isOwnCodePath(moduleArgument.text) &&
          !isAllowedBrowserSpy(source.filePath, implementationArgument)
        ) {
          occurrences.push({
            filePath: source.filePath,
            lineNumber: lineNumberFor(parsed, node),
            detail: `own-code module '${moduleArgument.text}' must not use a factory-form vi.mock`,
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(parsed);
  }

  return occurrences;
}

export function collectUnknownDoubleCastOccurrences(
  sources: readonly TestSourceFile[],
): TestDoubleOccurrence[] {
  const occurrences: TestDoubleOccurrence[] = [];

  for (const source of sources) {
    const parsed = parseSource(source);

    function visit(node: ts.Node): void {
      if (ts.isAsExpression(node)) {
        const unknownCast = asUnknownCast(node.expression);
        if (unknownCast) {
          const context: UnknownCastContext = {
            source,
            parsed,
            cast: node,
            targetText: normalizeTypeText(node.type.getText(parsed)),
            expressionText: normalizeExpressionText(
              unknownCast.expression.getText(parsed),
            ),
          };

          if (!UNKNOWN_CAST_ALLOWLIST.some((rule) => rule.matches(context))) {
            occurrences.push({
              filePath: source.filePath,
              lineNumber: lineNumberFor(parsed, node),
              detail: `'as unknown as ${context.targetText}' is outside the documented shape-only allowlist`,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(parsed);
  }

  return occurrences;
}

export function collectRatchetGrowthIssues(
  label: string,
  occurrences: readonly TestDoubleOccurrence[],
  floors: ReadonlyMap<string, number>,
): string[] {
  const occurrencesByFile = new Map<string, TestDoubleOccurrence[]>();

  for (const occurrence of occurrences) {
    const fileOccurrences = occurrencesByFile.get(occurrence.filePath) ?? [];
    fileOccurrences.push(occurrence);
    occurrencesByFile.set(occurrence.filePath, fileOccurrences);
  }

  return [...occurrencesByFile]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([filePath, fileOccurrences]) => {
      const floor = floors.get(filePath) ?? 0;
      if (fileOccurrences.length <= floor) {
        return [];
      }

      const firstNewOccurrence = fileOccurrences[floor];
      const newSite = firstNewOccurrence
        ? `${firstNewOccurrence.detail} at line ${firstNewOccurrence.lineNumber}`
        : 'new site';

      return [
        `${filePath} has ${fileOccurrences.length} ${label} site(s), above its ratchet floor of ${floor} (${newSite}).`,
      ];
    });
}

function parseSource(source: TestSourceFile): ts.SourceFile {
  const parsed = ts.createSourceFile(
    source.filePath,
    source.contents,
    ts.ScriptTarget.Latest,
    true,
    source.filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = (
    parsed as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (!diagnostics) {
    throw new Error(
      `TypeScript did not expose parse diagnostics for ${source.filePath}`,
    );
  }
  if (diagnostics.length > 0) {
    throw new Error(
      `Could not parse ${source.filePath}:\n${formatTypeScriptDiagnostics(diagnostics)}`,
    );
  }
  return parsed;
}

function readSourceFile(filePath: string): TestSourceFile {
  return {
    filePath,
    contents: readFileSync(path.resolve(process.cwd(), filePath), 'utf-8'),
  };
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

function collectFakeBarrelExports(
  barrelSource: TestSourceFile,
): Map<string, string> {
  const parsed = parseSource(barrelSource);
  const exports = new Map<string, string>();

  for (const statement of parsed.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      if (element.name.text.startsWith('Fake')) {
        exports.set(element.name.text, statement.moduleSpecifier.text);
      }
    }
  }

  return exports;
}

function resolveTypeScriptModulePath(
  importerPath: string,
  moduleSpecifier: string,
  sourcesByPath: ReadonlyMap<string, TestSourceFile>,
): string {
  const basePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerPath), moduleSpecifier),
  );
  const candidates = [`${basePath}.ts`, `${basePath}/index.ts`];
  const resolved = candidates.find((candidate) => sourcesByPath.has(candidate));
  return resolved ?? candidates[0] ?? basePath;
}

function addImplementedPortNames(
  source: TestSourceFile,
  fakeClassName: string,
  ports: Set<string>,
): void {
  const parsed = parseSource(source);
  let foundClass = false;

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name?.text === fakeClassName) {
      foundClass = true;
      for (const heritageClause of node.heritageClauses ?? []) {
        if (heritageClause.token !== ts.SyntaxKind.ImplementsKeyword) {
          continue;
        }
        for (const implementedType of heritageClause.types) {
          const qualifiedName = implementedType.expression.getText(parsed);
          const portName = qualifiedName.split('.').at(-1);
          if (portName) {
            ports.add(portName);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  if (!foundClass) {
    throw new Error(`Could not find ${fakeClassName} in ${source.filePath}`);
  }
}

function lineNumberFor(parsed: ts.SourceFile, node: ts.Node): number {
  return parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
}

function isViMockCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'vi' &&
    node.expression.name.text === 'mock'
  );
}

function isOwnCodePath(modulePath: string): boolean {
  return (
    modulePath.startsWith('@/') ||
    modulePath.startsWith('./') ||
    modulePath.startsWith('../')
  );
}

function isAllowedBrowserSpy(
  filePath: string,
  implementationArgument: ts.Expression | undefined,
): boolean {
  if (
    !filePath.endsWith('.browser.spec.tsx') ||
    !implementationArgument ||
    !ts.isObjectLiteralExpression(implementationArgument)
  ) {
    return false;
  }

  return implementationArgument.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      property.name.getText() === 'spy' &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );
}

function asUnknownCast(expression: ts.Expression): ts.AsExpression | null {
  const unwrapped = unwrapParentheses(expression);
  return ts.isAsExpression(unwrapped) &&
    unwrapped.type.kind === ts.SyntaxKind.UnknownKeyword
    ? unwrapped
    : null;
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let unwrapped = expression;
  while (ts.isParenthesizedExpression(unwrapped)) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function normalizeTypeText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([<>,[\]])\s*/g, '$1')
    .trim();
}

function normalizeExpressionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function matchesIntentionalInvalidCast(
  context: UnknownCastContext,
  pattern: IntentionalInvalidCastPattern,
): boolean {
  return (
    pattern.filePath.test(context.source.filePath) &&
    pattern.target.test(context.targetText) &&
    pattern.expression.test(context.expressionText)
  );
}
