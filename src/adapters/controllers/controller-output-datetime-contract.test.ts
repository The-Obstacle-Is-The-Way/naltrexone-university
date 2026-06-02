// biome-ignore lint/nursery/noExcessiveLinesPerFile: Keep the DEBT-397 AST scanner and assertions colocated so the controller-output datetime contract is auditable in one guardrail.
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as practiceSchemas from './practice-schemas';

type ContractIssue = string;

type SourceFile = {
  filePath: string;
  source: string;
  ast: ts.SourceFile;
};

type PassThroughAction = {
  action: string;
  datetimeFields: readonly string[];
  filePath: string;
};

type PassThroughTypeScan = {
  action: string;
  filePath: string;
  prefix: string;
  typeName: string;
};

type ZodSchema = z.ZodType<unknown>;

type TypeScanContext = {
  activeAliases: Set<string>;
  aliases: ReadonlyMap<string, ts.TypeNode>;
  issues: ContractIssue[];
  sourceFile: SourceFile;
};

type ZodDef = {
  checks?: readonly unknown[];
  element?: ZodSchema;
  innerType?: ZodSchema;
  options?: readonly ZodSchema[];
  type?: string;
};

const CONTROLLER_ROOT = resolve(process.cwd(), 'src/adapters/controllers');
const DATETIME_CONTRACT_REF =
  'docs/practice-engine/interaction-contracts.md#datetime-representation-at-the-controller-boundary';
const DATE_LIKE_FIELD_PATTERN =
  /(?:At|Date)$|^expires|^period|^created|^updated/i;
const ZOD_SOURCE_WRAPPER_METHODS = new Set([
  'brand',
  'catch',
  'default',
  'describe',
  'nullable',
  'optional',
  'readonly',
  'refine',
  'strict',
  'superRefine',
]);

const EXPECTED_SCHEMALESS_ACTIONS: readonly PassThroughAction[] = [
  {
    filePath: 'src/adapters/controllers/bookmark-controller.ts',
    action: 'getBookmarks',
    datetimeFields: ['rows[].bookmarkedAt'],
  },
  {
    filePath: 'src/adapters/controllers/practice-controller.ts',
    action: 'getCompletedSessionQuestionsWithFeedback',
    datetimeFields: [],
  },
  {
    filePath: 'src/adapters/controllers/practice-controller.ts',
    action: 'getPracticeSessionReview',
    datetimeFields: [],
  },
  {
    filePath: 'src/adapters/controllers/practice-controller.ts',
    action: 'getSessionHistory',
    datetimeFields: ['rows[].startedAt', 'rows[].endedAt'],
  },
  {
    filePath: 'src/adapters/controllers/question-controller.ts',
    action: 'getNextQuestion',
    datetimeFields: ['session.deadlineAt'],
  },
  {
    filePath: 'src/adapters/controllers/question-view-controller.ts',
    action: 'getPreviousAttempt',
    datetimeFields: ['answeredAt'],
  },
  {
    filePath: 'src/adapters/controllers/question-view-controller.ts',
    action: 'getQuestionBySlug',
    datetimeFields: [],
  },
  {
    filePath: 'src/adapters/controllers/review-controller.ts',
    action: 'getAttemptedQuestions',
    datetimeFields: ['rows[].lastAnsweredAt'],
  },
  {
    filePath: 'src/adapters/controllers/stats-controller.ts',
    action: 'getUserStats',
    datetimeFields: ['recentActivity[].answeredAt'],
  },
  {
    filePath: 'src/adapters/controllers/tag-controller.ts',
    action: 'getTags',
    datetimeFields: [],
  },
];

const PASS_THROUGH_TYPE_SCANS: readonly PassThroughTypeScan[] = [
  {
    filePath: 'src/application/ports/bookmarks.ts',
    typeName: 'AvailableBookmarkRow',
    prefix: 'rows[]',
    action: 'getBookmarks',
  },
  {
    filePath: 'src/application/ports/bookmarks.ts',
    typeName: 'UnavailableBookmarkRow',
    prefix: 'rows[]',
    action: 'getBookmarks',
  },
  {
    filePath:
      'src/application/use-cases/get-completed-session-questions-with-feedback.ts',
    typeName: 'GetCompletedSessionQuestionsWithFeedbackOutput',
    prefix: '',
    action: 'getCompletedSessionQuestionsWithFeedback',
  },
  {
    filePath: 'src/application/use-cases/get-attempted-questions.ts',
    typeName: 'AvailableAttemptedQuestionRow',
    prefix: 'rows[]',
    action: 'getAttemptedQuestions',
  },
  {
    filePath: 'src/application/use-cases/get-attempted-questions.ts',
    typeName: 'UnavailableAttemptedQuestionRow',
    prefix: 'rows[]',
    action: 'getAttemptedQuestions',
  },
  {
    filePath: 'src/application/use-cases/get-next-question.ts',
    typeName: 'NextQuestion',
    prefix: '',
    action: 'getNextQuestion',
  },
  {
    filePath: 'src/application/use-cases/get-previous-attempt.ts',
    typeName: 'AttemptPreviousAttemptOutput',
    prefix: '',
    action: 'getPreviousAttempt',
  },
  {
    filePath: 'src/application/use-cases/get-practice-session-review.ts',
    typeName: 'GetPracticeSessionReviewOutput',
    prefix: '',
    action: 'getPracticeSessionReview',
  },
  {
    filePath: 'src/adapters/controllers/question-view-controller.ts',
    typeName: 'GetQuestionBySlugOutput',
    prefix: '',
    action: 'getQuestionBySlug',
  },
  {
    filePath: 'src/application/use-cases/get-session-history.ts',
    typeName: 'SessionHistoryRow',
    prefix: 'rows[]',
    action: 'getSessionHistory',
  },
  {
    filePath: 'src/application/use-cases/get-user-stats.ts',
    typeName: 'UserStatsOutput',
    prefix: '',
    action: 'getUserStats',
  },
  {
    filePath: 'src/adapters/controllers/tag-controller.ts',
    typeName: 'GetTagsOutput',
    prefix: '',
    action: 'getTags',
  },
];

function toRepoPath(filePath: string): string {
  return relative(process.cwd(), filePath).replaceAll('\\', '/');
}

function readControllerSources(dir = CONTROLLER_ROOT): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) return readControllerSources(entryPath);
    if (!entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.test.ts')) return [];
    if (entry.name.endsWith('-test-helpers.ts')) return [];

    const source = readFileSync(entryPath, 'utf8');
    return [
      {
        filePath: toRepoPath(entryPath),
        source,
        ast: ts.createSourceFile(entryPath, source, ts.ScriptTarget.Latest),
      },
    ];
  });
}

function parseRepoSource(filePath: string): SourceFile {
  const absolutePath = resolve(process.cwd(), filePath);
  const source = readFileSync(absolutePath, 'utf8');
  return parseSourceText(filePath, source);
}

function parseSourceText(filePath: string, source: string): SourceFile {
  return {
    filePath,
    source,
    ast: ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest),
  };
}

function getZodDef(schema: ZodSchema): ZodDef {
  return (schema as unknown as { _def: ZodDef })._def;
}

function isZodSchema(value: unknown): value is ZodSchema {
  return typeof value === 'object' && value !== null && '_def' in value;
}

function unwrapZodSchema(schema: ZodSchema): ZodSchema {
  let current = schema;
  while (true) {
    const innerType = getZodDef(current).innerType;
    if (!innerType) return current;
    current = innerType;
  }
}

function getCheckDef(check: unknown): Record<string, unknown> | null {
  if (typeof check !== 'object' || check === null) return null;
  const nested = (check as { _zod?: { def?: Record<string, unknown> } })._zod
    ?.def;
  if (nested) return nested;
  return check as Record<string, unknown>;
}

function isDatetimeStringSchema(schema: ZodSchema): boolean {
  const unwrapped = unwrapZodSchema(schema);
  const def = getZodDef(unwrapped);

  return (
    def.type === 'string' &&
    (def.checks ?? []).some(
      (check) => getCheckDef(check)?.format === 'datetime',
    )
  );
}

function formatPath(path: readonly string[]): string {
  return path.join('.');
}

function withArrayMarker(path: readonly string[]): string[] {
  if (path.length === 0) return ['[]'];
  return [...path.slice(0, -1), `${path[path.length - 1]}[]`];
}

function getLastFieldName(path: readonly string[]): string {
  return (path[path.length - 1] ?? '').replace(/\[\]$/, '');
}

function getZodContractIssues(
  schema: ZodSchema,
  schemaName: string,
  path: readonly string[] = [],
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const unwrapped = unwrapZodSchema(schema);
  const def = getZodDef(unwrapped);
  const fieldName = getLastFieldName(path);
  const displayPath = formatPath(path) || '<root>';

  if (def.type === 'date') {
    issues.push(
      `${schemaName}.${displayPath} uses z.date(); controller output datetimes must use z.string().datetime() (${DATETIME_CONTRACT_REF}).`,
    );
  }

  if (
    DATE_LIKE_FIELD_PATTERN.test(fieldName) &&
    !isDatetimeStringSchema(schema)
  ) {
    const representation =
      def.type === 'number'
        ? 'date-like z.number()'
        : `z.${def.type ?? 'unknown'}()`;
    issues.push(
      `${schemaName}.${displayPath} uses ${representation}; schema-backed controller output datetime fields must use z.string().datetime() (${DATETIME_CONTRACT_REF}).`,
    );
  }

  if (def.type === 'object') {
    const shape = (unwrapped as unknown as { shape: Record<string, ZodSchema> })
      .shape;
    for (const [key, childSchema] of Object.entries(shape)) {
      issues.push(
        ...getZodContractIssues(childSchema, schemaName, [...path, key]),
      );
    }
  }

  if (def.type === 'array' && def.element) {
    issues.push(
      ...getZodContractIssues(def.element, schemaName, withArrayMarker(path)),
    );
  }

  for (const option of def.options ?? []) {
    issues.push(...getZodContractIssues(option, schemaName, path));
  }

  return issues;
}

function unwrapSourceCallChain(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression)
  ) {
    const methodName = current.expression.name.text;
    if (
      methodName === 'array' ||
      methodName === 'date' ||
      methodName === 'literal' ||
      methodName === 'null' ||
      methodName === 'number' ||
      methodName === 'object' ||
      methodName === 'string' ||
      methodName === 'undefined' ||
      methodName === 'union'
    ) {
      return current;
    }
    current = current.expression.expression;
  }
  return current;
}

function isZodFactoryCall(
  expression: ts.Expression,
  methodName: string,
): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression)) return false;
  if (!ts.isPropertyAccessExpression(expression.expression)) return false;
  if (expression.expression.name.text !== methodName) return false;
  return (
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'z'
  );
}

function getZodObjectShape(
  expression: ts.Expression,
): ts.ObjectLiteralExpression | null {
  const unwrapped = unwrapSourceCallChain(expression);
  if (!isZodFactoryCall(unwrapped, 'object')) return null;
  const [shape] = unwrapped.arguments;
  return shape && ts.isObjectLiteralExpression(shape) ? shape : null;
}

function getZodArrayElement(expression: ts.Expression): ts.Expression | null {
  const unwrapped = unwrapSourceCallChain(expression);
  if (!isZodFactoryCall(unwrapped, 'array')) return null;
  return unwrapped.arguments[0] ?? null;
}

function stripSourceWrappers(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    ZOD_SOURCE_WRAPPER_METHODS.has(current.expression.name.text)
  ) {
    current = current.expression.expression;
  }
  return current;
}

function getZodUnionOptions(expression: ts.Expression): ts.Expression[] {
  const stripped = stripSourceWrappers(expression);
  const unwrapped = unwrapSourceCallChain(stripped);

  if (isZodFactoryCall(unwrapped, 'union')) {
    const [options] = unwrapped.arguments;
    if (!options || !ts.isArrayLiteralExpression(options)) return [];
    return [...options.elements];
  }

  if (
    ts.isCallExpression(stripped) &&
    ts.isPropertyAccessExpression(stripped.expression) &&
    stripped.expression.name.text === 'or'
  ) {
    const [right] = stripped.arguments;
    return right ? [stripped.expression.expression, right] : [];
  }

  return [];
}

function isDirectZodFactoryExpression(
  expression: ts.Expression,
  methodName: string,
): boolean {
  const unwrapped = unwrapSourceCallChain(expression);
  return isZodFactoryCall(unwrapped, methodName);
}

function isNullishZodExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapSourceCallChain(expression);
  return (
    isZodFactoryCall(unwrapped, 'null') ||
    isZodFactoryCall(unwrapped, 'undefined') ||
    (isZodFactoryCall(unwrapped, 'literal') &&
      unwrapped.arguments[0]?.kind === ts.SyntaxKind.NullKeyword)
  );
}

function containsZodStringDatetimeCall(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): boolean {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'datetime'
  ) {
    const receiver = node.expression.expression;
    return (
      ts.isCallExpression(receiver) && isZodFactoryCall(receiver, 'string')
    );
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsZodStringDatetimeCall(child, sourceFile)) {
      found = true;
    }
  });
  return found;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function getSourcePosition(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return `${line + 1}:${character + 1}`;
}

function scanSchemaExpression(
  expression: ts.Expression,
  sourceFile: SourceFile,
  schemaName: string,
  path: readonly string[],
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const fieldName = getLastFieldName(path);
  const displayPath = formatPath(path) || '<root>';
  const unionOptions = getZodUnionOptions(expression);

  if (unionOptions.length > 0) {
    for (const option of unionOptions) {
      issues.push(
        ...scanSchemaExpression(option, sourceFile, schemaName, path),
      );
    }
    return issues;
  }

  if (isDirectZodFactoryExpression(expression, 'date')) {
    issues.push(
      `${sourceFile.filePath}:${getSourcePosition(
        sourceFile.ast,
        expression,
      )} ${schemaName}.${displayPath} uses z.date(); controller output datetimes must use z.string().datetime() (${DATETIME_CONTRACT_REF}).`,
    );
  }

  if (
    DATE_LIKE_FIELD_PATTERN.test(fieldName) &&
    !isNullishZodExpression(expression)
  ) {
    if (isDirectZodFactoryExpression(expression, 'number')) {
      issues.push(
        `${sourceFile.filePath}:${getSourcePosition(
          sourceFile.ast,
          expression,
        )} ${schemaName}.${displayPath} uses date-like z.number(); epoch numbers are not allowed at the controller output boundary (${DATETIME_CONTRACT_REF}).`,
      );
    }

    if (!containsZodStringDatetimeCall(expression, sourceFile.ast)) {
      issues.push(
        `${sourceFile.filePath}:${getSourcePosition(
          sourceFile.ast,
          expression,
        )} ${schemaName}.${displayPath} is date-like but is not z.string().datetime() (${DATETIME_CONTRACT_REF}).`,
      );
    }
  }

  const objectShape = getZodObjectShape(expression);
  if (objectShape) {
    issues.push(...scanObjectShape(objectShape, sourceFile, schemaName, path));
  }

  const arrayElement = getZodArrayElement(expression);
  if (arrayElement) {
    issues.push(
      ...scanSchemaExpression(
        arrayElement,
        sourceFile,
        schemaName,
        withArrayMarker(path),
      ),
    );
  }

  return issues;
}

function scanObjectShape(
  shape: ts.ObjectLiteralExpression,
  sourceFile: SourceFile,
  schemaName: string,
  path: readonly string[],
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  for (const property of shape.properties) {
    if (!ts.isPropertyAssignment(property)) continue;

    const propertyName = getPropertyName(property.name);
    if (!propertyName) continue;

    issues.push(
      ...scanSchemaExpression(property.initializer, sourceFile, schemaName, [
        ...path,
        propertyName,
      ]),
    );
  }

  return issues;
}

function collectOutputSchemaSourceIssues(
  sourceFiles: readonly SourceFile[],
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text.endsWith('OutputSchema') &&
        node.initializer
      ) {
        issues.push(
          ...scanSchemaExpression(
            node.initializer,
            sourceFile,
            node.name.text,
            [],
          ),
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile.ast);
  }

  return issues;
}

function containsOutputSchemaIdentifier(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text.endsWith('OutputSchema')) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsOutputSchemaIdentifier(child)) {
      found = true;
    }
  });
  return found;
}

function collectSchemaLessActions(
  sourceFiles: readonly SourceFile[],
): Pick<PassThroughAction, 'action' | 'filePath'>[] {
  const actions: Pick<PassThroughAction, 'action' | 'filePath'>[] = [];

  for (const sourceFile of sourceFiles) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sourceFile.ast) ===
          'createAction' &&
        !containsOutputSchemaIdentifier(node.initializer)
      ) {
        actions.push({ filePath: sourceFile.filePath, action: node.name.text });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile.ast);
  }

  return actions.sort((a, b) =>
    `${a.filePath}:${a.action}`.localeCompare(`${b.filePath}:${b.action}`),
  );
}

function collectTypeAliases(sourceFile: SourceFile): Map<string, ts.TypeNode> {
  const aliases = new Map<string, ts.TypeNode>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node)) {
      aliases.set(node.name.text, node.type);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile.ast);
  return aliases;
}

function getTypeAlias(
  sourceFile: SourceFile,
  aliases: ReadonlyMap<string, ts.TypeNode>,
  typeName: string,
): ts.TypeNode {
  const typeNode = aliases.get(typeName);

  if (!typeNode) {
    throw new Error(`Missing type alias ${typeName} in ${sourceFile.filePath}`);
  }

  return typeNode;
}

function isStringNullishType(typeNode: ts.TypeNode): boolean {
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) return true;
  if (typeNode.kind === ts.SyntaxKind.NullKeyword) return true;
  if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword) return true;

  if (ts.isLiteralTypeNode(typeNode)) {
    return (
      typeNode.literal.kind === ts.SyntaxKind.NullKeyword ||
      typeNode.literal.kind === ts.SyntaxKind.StringLiteral
    );
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.every(isStringNullishType);
  }

  return false;
}

function collectDateLikeStringFieldsFromType(
  typeNode: ts.TypeNode,
  context: TypeScanContext,
  path: string,
): string[] {
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.flatMap((type) =>
      collectDateLikeStringFieldsFromType(type, context, path),
    );
  }

  if (ts.isArrayTypeNode(typeNode)) {
    return collectDateLikeStringFieldsFromType(
      typeNode.elementType,
      context,
      `${path}[]`,
    );
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(context.sourceFile.ast);

    if (typeName === 'Array' && typeNode.typeArguments?.[0]) {
      return collectDateLikeStringFieldsFromType(
        typeNode.typeArguments[0],
        context,
        `${path}[]`,
      );
    }

    const alias = context.aliases.get(typeName);
    if (!alias || context.activeAliases.has(typeName)) return [];

    context.activeAliases.add(typeName);
    try {
      return collectDateLikeStringFieldsFromType(alias, context, path);
    } finally {
      context.activeAliases.delete(typeName);
    }
  }

  if (!ts.isTypeLiteralNode(typeNode)) return [];

  const fields: string[] = [];
  for (const member of typeNode.members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;

    const propertyName = member.name ? getPropertyName(member.name) : null;
    if (!propertyName) continue;

    const propertyPath = path ? `${path}.${propertyName}` : propertyName;

    if (DATE_LIKE_FIELD_PATTERN.test(propertyName)) {
      if (isStringNullishType(member.type)) {
        fields.push(propertyPath);
      } else {
        context.issues.push(
          `${context.sourceFile.filePath}:${getSourcePosition(
            context.sourceFile.ast,
            member,
          )} ${propertyPath} is date-like but is not typed as string/string|null in a pass-through controller output (${DATETIME_CONTRACT_REF}).`,
        );
      }
    }

    if (ts.isArrayTypeNode(member.type)) {
      fields.push(
        ...collectDateLikeStringFieldsFromType(
          member.type.elementType,
          context,
          `${propertyPath}[]`,
        ),
      );
      continue;
    }

    if (
      ts.isTypeReferenceNode(member.type) &&
      member.type.typeName.getText(context.sourceFile.ast) === 'Array' &&
      member.type.typeArguments?.[0]
    ) {
      fields.push(
        ...collectDateLikeStringFieldsFromType(
          member.type.typeArguments[0],
          context,
          `${propertyPath}[]`,
        ),
      );
      continue;
    }

    fields.push(
      ...collectDateLikeStringFieldsFromType(
        member.type,
        context,
        propertyPath,
      ),
    );
  }

  return fields;
}

function collectPassThroughDatetimeFields(): {
  fields: string[];
  issues: ContractIssue[];
} {
  const issues: ContractIssue[] = [];
  const fields = new Set<string>();

  for (const scan of PASS_THROUGH_TYPE_SCANS) {
    const sourceFile = parseRepoSource(scan.filePath);
    const aliases = collectTypeAliases(sourceFile);
    const typeNode = getTypeAlias(sourceFile, aliases, scan.typeName);
    const context: TypeScanContext = {
      activeAliases: new Set([scan.typeName]),
      aliases,
      sourceFile,
      issues,
    };

    for (const field of collectDateLikeStringFieldsFromType(
      typeNode,
      context,
      scan.prefix,
    )) {
      fields.add(`${scan.action}:${field}`);
    }
  }

  return { fields: [...fields].sort(), issues };
}

describe('controller output datetime contract', () => {
  it('keeps exported controller output schemas on ISO datetime strings', () => {
    const schemaIssues = Object.entries(practiceSchemas)
      .filter(
        ([name, schema]) =>
          name.endsWith('OutputSchema') && isZodSchema(schema),
      )
      .flatMap(([name, schema]) => getZodContractIssues(schema, name));

    expect(schemaIssues).toEqual([]);
  });

  it('blocks z.date(), date-like z.number(), and unvalidated datetime strings in controller output schemas', () => {
    const schemaIssues = collectOutputSchemaSourceIssues(
      readControllerSources(),
    );

    expect(schemaIssues).toEqual([]);
  });

  it('reports date-like union output schema branches that drift away from ISO strings', () => {
    const sourceFile = parseSourceText(
      'src/adapters/controllers/example-controller.ts',
      `
import { z } from 'zod';

const ExampleOutputSchema = z
  .object({
    answeredAt: z.union([z.string().datetime(), z.number()]),
    expiresAt: z.string().datetime().or(z.date()),
    updatedAt: z.union([z.string().datetime(), z.null()]),
  })
  .strict();
`,
    );

    const schemaIssues = collectOutputSchemaSourceIssues([sourceFile]);

    expect(schemaIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'ExampleOutputSchema.answeredAt uses date-like z.number()',
        ),
        expect.stringContaining(
          'ExampleOutputSchema.answeredAt is date-like but is not z.string().datetime()',
        ),
        expect.stringContaining('ExampleOutputSchema.expiresAt uses z.date()'),
        expect.stringContaining(
          'ExampleOutputSchema.expiresAt is date-like but is not z.string().datetime()',
        ),
      ]),
    );
    expect(
      schemaIssues.some((issue) =>
        issue.includes('ExampleOutputSchema.updatedAt'),
      ),
    ).toBe(false);
  });

  it('keeps pass-through controller datetime outputs explicit and ISO-shaped', () => {
    const schemaLessActions = collectSchemaLessActions(readControllerSources());
    const expectedSchemaLessActions = EXPECTED_SCHEMALESS_ACTIONS.map(
      ({ action, filePath }) => ({ action, filePath }),
    ).sort((a, b) =>
      `${a.filePath}:${a.action}`.localeCompare(`${b.filePath}:${b.action}`),
    );

    expect(schemaLessActions).toEqual(expectedSchemaLessActions);

    const { fields, issues } = collectPassThroughDatetimeFields();
    const expectedFields = EXPECTED_SCHEMALESS_ACTIONS.flatMap((action) =>
      action.datetimeFields.map((field) => `${action.action}:${field}`),
    ).sort();

    expect(issues).toEqual([]);
    expect(fields).toEqual(expectedFields);
  });
});
