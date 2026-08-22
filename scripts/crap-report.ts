import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import {
  type CoverageMap,
  type CoverageMapData,
  createCoverageMap,
  type FileCoverageData,
} from 'istanbul-lib-coverage';
import ts from 'typescript';

export type CoverageLane = 'merged' | 'unit' | 'browser' | 'integration';

export type CrapReportOptions = {
  json: boolean;
  lane: CoverageLane;
  min: number;
  top: number;
};

export type CrapFunctionScore = {
  path: string;
  line: number;
  functionName: string;
  complexity: number;
  coverage: number;
  coveredStatements: number;
  totalStatements: number;
  crap: number;
};

export type CrapReport = {
  lane: CoverageLane;
  coverageInputs: string[];
  analyzedFiles: number;
  totalFunctions: number;
  matchedFunctions: number;
  entries: CrapFunctionScore[];
};

type ConcreteCoverageLane = Exclude<CoverageLane, 'merged'>;

type CreateCrapReportInput = {
  cwd?: string;
  options?: CrapReportOptions;
  readSourceFile?: (filePath: string) => string;
};

type RunCrapReportCliInput = {
  argv?: string[];
  cwd?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

type ExecutableFunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

type FunctionSpan = {
  node: ExecutableFunctionLike;
  start: number;
  end: number;
  coveredStatements: number;
  totalStatements: number;
};

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.Diagnostic[];
};

type CoveragePosition = {
  line: number;
  column: number;
};

type CoverageEndPosition = {
  line: number;
  column: number | null;
};

const DEFAULT_OPTIONS: CrapReportOptions = {
  json: false,
  lane: 'merged',
  min: 0,
  top: 25,
};

const COVERAGE_INPUTS: Record<ConcreteCoverageLane, string> = {
  unit: 'coverage/coverage-final.json',
  browser: 'coverage/browser/coverage-final.json',
  integration: 'coverage/integration/coverage-final.json',
};

const SOURCE_PATTERNS = [
  'src/**/*.{ts,tsx}',
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'db/schema.ts',
  'instrumentation-client.ts',
  'instrumentation.ts',
  'next.config.ts',
  'proxy.ts',
  'sentry.client.config.ts',
] as const;

const SOURCE_IGNORES = [
  '**/*.d.ts',
  '**/test-helpers/**',
  '**/*-test-helpers.*',
  '**/*.test.*',
  '**/*.browser.spec.*',
  '**/*.fixtures.*',
  '**/*.browser.probes.*',
  '**/*.browser.setup.*',
] as const;

const DECISION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

const DECISION_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const VALID_LANES = new Set<CoverageLane>([
  'merged',
  'unit',
  'browser',
  'integration',
]);

export function calculateCrapScore(
  complexity: number,
  coverage: number,
): number {
  if (!Number.isInteger(complexity) || complexity < 1) {
    throw new Error('Complexity must be a positive integer.');
  }
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    throw new Error('Coverage must be a finite fraction from 0 through 1.');
  }

  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

export function analyzeSourceText(
  filePath: string,
  sourceText: string,
  coverage?: FileCoverageData,
): CrapFunctionScore[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(filePath),
  ) as SourceFileWithParseDiagnostics;
  const parseDiagnostics = readParseDiagnostics(sourceFile);
  if (parseDiagnostics.length > 0) {
    const details = parseDiagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      )
      .join('; ');
    throw new Error(`Could not parse ${filePath}: ${details}`);
  }

  const spans = collectFunctionSpans(sourceFile);
  assignCoverageStatements(sourceFile, spans, coverage);

  return spans.map((span) => {
    const complexity = calculateCyclomaticComplexity(span.node);
    const coverageFraction =
      span.totalStatements === 0
        ? 0
        : span.coveredStatements / span.totalStatements;
    const { line } = sourceFile.getLineAndCharacterOfPosition(span.start);

    return {
      path: filePath,
      line: line + 1,
      functionName: getFunctionName(span.node, sourceFile),
      complexity,
      coverage: coverageFraction,
      coveredStatements: span.coveredStatements,
      totalStatements: span.totalStatements,
      crap: calculateCrapScore(complexity, coverageFraction),
    };
  });
}

export function readParseDiagnostics(
  sourceFile: ts.SourceFile,
): readonly ts.Diagnostic[] {
  const parseDiagnostics = (sourceFile as SourceFileWithParseDiagnostics)
    .parseDiagnostics;
  if (!Array.isArray(parseDiagnostics)) {
    throw new Error(
      `TypeScript compiler API did not expose parse diagnostics for ${sourceFile.fileName}.`,
    );
  }
  return parseDiagnostics;
}

export function parseCrapReportArgs(
  argv: readonly string[],
): CrapReportOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument || argument === '--') continue;

    if (argument === '--json') {
      options.json = true;
      continue;
    }

    const topValue = readOptionValue(argument, '--top', argv[index + 1]);
    if (topValue !== null) {
      if (!argument.includes('=')) index += 1;
      const top = Number(topValue);
      if (!Number.isInteger(top) || top < 1) {
        throw new Error('--top must be a positive integer.');
      }
      options.top = top;
      continue;
    }

    const minValue = readOptionValue(argument, '--min', argv[index + 1]);
    if (minValue !== null) {
      if (!argument.includes('=')) index += 1;
      const min = Number(minValue);
      if (!Number.isFinite(min) || min < 0) {
        throw new Error('--min must be a finite non-negative number.');
      }
      options.min = min;
      continue;
    }

    const laneValue = readOptionValue(argument, '--lane', argv[index + 1]);
    if (laneValue !== null) {
      if (!argument.includes('=')) index += 1;
      if (!VALID_LANES.has(laneValue as CoverageLane)) {
        throw new Error(
          '--lane must be one of merged, unit, browser, or integration.',
        );
      }
      options.lane = laneValue as CoverageLane;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

export function createCrapReport({
  cwd = process.cwd(),
  options = DEFAULT_OPTIONS,
  readSourceFile = (filePath) => readFileSync(filePath, 'utf8'),
}: CreateCrapReportInput = {}): CrapReport {
  const repositoryRoot = resolve(cwd);
  const coverageLanes = resolveCoverageLanes(options.lane);
  const coverageMap = loadMergedCoverageMap(repositoryRoot, coverageLanes);
  const coverageFiles = new Set(
    coverageMap.files().map((file) => resolve(file)),
  );
  const sourceFiles = fg
    .sync([...SOURCE_PATTERNS], {
      absolute: true,
      cwd: repositoryRoot,
      ignore: [...SOURCE_IGNORES],
      onlyFiles: true,
      unique: true,
    })
    .map((filePath) => resolve(filePath))
    .sort((left, right) =>
      toDisplayPath(repositoryRoot, left).localeCompare(
        toDisplayPath(repositoryRoot, right),
      ),
    );

  const allScores: CrapFunctionScore[] = [];
  for (const absolutePath of sourceFiles) {
    const displayPath = toDisplayPath(repositoryRoot, absolutePath);
    let sourceText: string;
    try {
      sourceText = readSourceFile(absolutePath);
    } catch (error) {
      throw new Error(`Could not read source ${displayPath}.`, {
        cause: error,
      });
    }

    const fileCoverage = coverageFiles.has(absolutePath)
      ? coverageMap.fileCoverageFor(absolutePath).data
      : undefined;
    allScores.push(...analyzeSourceText(displayPath, sourceText, fileCoverage));
  }

  const rankedScores = [...allScores].sort(compareScores);
  const matchingScores = rankedScores.filter(
    (entry) => entry.crap >= options.min,
  );

  return {
    lane: options.lane,
    coverageInputs: coverageLanes.map((lane) => COVERAGE_INPUTS[lane]),
    analyzedFiles: sourceFiles.length,
    totalFunctions: allScores.length,
    matchedFunctions: matchingScores.length,
    entries: matchingScores.slice(0, options.top),
  };
}

export function runCrapReportCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = (line) => console.log(line),
  stderr = (line) => console.error(line),
}: RunCrapReportCliInput = {}): number {
  try {
    const options = parseCrapReportArgs(argv);
    const report = createCrapReport({ cwd, options });
    stdout(options.json ? formatJsonReport(report) : formatTableReport(report));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`[crap-report] ${message}`);
    return 1;
  }
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function isExecutableFunctionLike(
  node: ts.Node,
): node is ExecutableFunctionLike {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    return node.body !== undefined;
  }
  if (ts.isMethodDeclaration(node)) return node.body !== undefined;
  if (ts.isConstructorDeclaration(node)) return node.body !== undefined;
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.body !== undefined;
  }
  return ts.isArrowFunction(node);
}

function collectFunctionSpans(sourceFile: ts.SourceFile): FunctionSpan[] {
  const spans: FunctionSpan[] = [];

  const visit = (node: ts.Node): void => {
    if (isExecutableFunctionLike(node)) {
      spans.push({
        node,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        coveredStatements: 0,
        totalStatements: 0,
      });
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return spans;
}

function calculateCyclomaticComplexity(root: ExecutableFunctionLike): number {
  let complexity = 1;

  const visit = (node: ts.Node): void => {
    if (node !== root && isExecutableFunctionLike(node)) return;
    if (DECISION_KINDS.has(node.kind)) complexity += 1;
    if (
      ts.isBinaryExpression(node) &&
      DECISION_OPERATORS.has(node.operatorToken.kind)
    ) {
      complexity += 1;
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(root, visit);
  return complexity;
}

function assignCoverageStatements(
  sourceFile: ts.SourceFile,
  spans: FunctionSpan[],
  coverage: FileCoverageData | undefined,
): void {
  if (!coverage) return;

  for (const [statementId, statementRange] of Object.entries(
    coverage.statementMap,
  )) {
    const statementPosition = coverageLocationToPosition(
      sourceFile,
      statementRange.start.line,
      statementRange.start.column,
    );
    const owner = findInnermostFunction(spans, statementPosition);
    if (!owner) continue;

    owner.totalStatements += 1;
    if ((coverage.s[statementId] ?? 0) > 0) {
      owner.coveredStatements += 1;
    }
  }
}

function coverageLocationToPosition(
  sourceFile: ts.SourceFile,
  line: number,
  column: number,
): number {
  if (!Number.isInteger(line) || line < 1) {
    throw new Error(
      `Invalid coverage statement line in ${sourceFile.fileName}.`,
    );
  }
  if (!Number.isInteger(column) || column < 0) {
    throw new Error(
      `Invalid coverage statement column in ${sourceFile.fileName}.`,
    );
  }

  try {
    return sourceFile.getPositionOfLineAndCharacter(line - 1, column);
  } catch (error) {
    throw new Error(
      `Invalid coverage statement location in ${sourceFile.fileName}.`,
      { cause: error },
    );
  }
}

function findInnermostFunction(
  spans: FunctionSpan[],
  position: number,
): FunctionSpan | undefined {
  let owner: FunctionSpan | undefined;

  for (const span of spans) {
    if (position < span.start || position >= span.end) continue;
    if (!owner || span.end - span.start < owner.end - owner.start) {
      owner = span;
    }
  }

  return owner;
}

function getFunctionName(
  node: ExecutableFunctionLike,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if ('name' in node && node.name) return node.name.getText(sourceFile);

  const parent = node.parent;
  if (
    ts.isVariableDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertyAssignment(parent)
  ) {
    return parent.name.getText(sourceFile);
  }

  return '<anonymous>';
}

function readOptionValue(
  argument: string,
  optionName: string,
  nextArgument: string | undefined,
): string | null {
  if (argument === optionName) {
    if (!nextArgument || nextArgument.startsWith('--')) {
      throw new Error(`${optionName} requires a value.`);
    }
    return nextArgument;
  }
  if (argument.startsWith(`${optionName}=`)) {
    const value = argument.slice(optionName.length + 1);
    if (!value) throw new Error(`${optionName} requires a value.`);
    return value;
  }
  return null;
}

function resolveCoverageLanes(lane: CoverageLane): ConcreteCoverageLane[] {
  if (lane === 'merged') return ['unit', 'browser', 'integration'];
  return [lane];
}

function loadMergedCoverageMap(
  repositoryRoot: string,
  lanes: readonly ConcreteCoverageLane[],
): CoverageMap {
  const merged = createCoverageMap({});

  for (const lane of lanes) {
    const relativePath = COVERAGE_INPUTS[lane];
    const absolutePath = resolve(repositoryRoot, relativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Missing required ${lane} coverage input: ${relativePath}`,
      );
    }

    let raw: string;
    try {
      raw = readFileSync(absolutePath, 'utf8');
    } catch (error) {
      throw new Error(
        `Could not read ${lane} coverage input: ${relativePath}`,
        {
          cause: error,
        },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Could not parse ${lane} coverage input: ${relativePath}`,
        {
          cause: error,
        },
      );
    }
    if (!isRecord(parsed)) {
      throw new Error(
        `Could not parse ${lane} coverage input: ${relativePath}`,
      );
    }

    try {
      validateCoverageStatements(parsed);
      const laneMap = createCoverageMap(parsed as CoverageMapData);
      for (const file of laneMap.files()) {
        laneMap.fileCoverageFor(file);
      }
      merged.merge(laneMap);
    } catch (error) {
      throw new Error(
        `Could not parse ${lane} coverage input: ${relativePath}`,
        {
          cause: error,
        },
      );
    }
  }

  return merged;
}

function validateCoverageStatements(
  coverageMap: Record<string, unknown>,
): void {
  for (const [filePath, fileCoverage] of Object.entries(coverageMap)) {
    if (
      !isRecord(fileCoverage) ||
      !isRecord(fileCoverage.statementMap) ||
      !isRecord(fileCoverage.s)
    ) {
      throw new Error(`Invalid coverage statement data for ${filePath}.`);
    }

    const statementMap = fileCoverage.statementMap;
    const statementHits = fileCoverage.s;
    for (const [statementId, range] of Object.entries(statementMap)) {
      const hits = statementHits[statementId];
      if (!Number.isInteger(hits) || (hits as number) < 0) {
        throw new Error(
          `Invalid coverage statement counter for ${filePath}#${statementId}.`,
        );
      }
      if (!isValidCoverageRange(range)) {
        throw new Error(
          `Invalid coverage statement range for ${filePath}#${statementId}.`,
        );
      }
    }

    for (const statementId of Object.keys(statementHits)) {
      if (!Object.hasOwn(statementMap, statementId)) {
        throw new Error(
          `Invalid coverage statement counter for ${filePath}#${statementId}.`,
        );
      }
    }
  }
}

function isValidCoverageRange(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isCoveragePosition(value.start) ||
    !isCoverageEndPosition(value.end)
  ) {
    return false;
  }

  const start = value.start;
  const end = value.end;
  return (
    end.line > start.line ||
    (end.line === start.line &&
      (end.column === null || end.column >= start.column))
  );
}

function isCoveragePosition(value: unknown): value is CoveragePosition {
  return (
    isRecord(value) &&
    Number.isInteger(value.line) &&
    (value.line as number) >= 1 &&
    Number.isInteger(value.column) &&
    (value.column as number) >= 0
  );
}

function isCoverageEndPosition(value: unknown): value is CoverageEndPosition {
  return (
    isRecord(value) &&
    Number.isInteger(value.line) &&
    (value.line as number) >= 1 &&
    (value.column === null ||
      (Number.isInteger(value.column) && (value.column as number) >= 0))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareScores(
  left: CrapFunctionScore,
  right: CrapFunctionScore,
): number {
  return (
    right.crap - left.crap ||
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.functionName.localeCompare(right.functionName)
  );
}

function toDisplayPath(repositoryRoot: string, filePath: string): string {
  return relative(repositoryRoot, filePath).split(sep).join('/');
}

function formatTableReport(report: CrapReport): string {
  const summary = `CRAP report (${report.lane}): analyzed ${report.analyzedFiles} files / ${report.totalFunctions} functions; showing ${report.entries.length} of ${report.matchedFunctions} matches.`;
  if (report.entries.length === 0) {
    return `${summary}\nNo functions matched the requested score filter.`;
  }

  const rows = report.entries.map((entry) =>
    [
      `| ${escapeTableCell(`${entry.path}:${entry.line}`)}`,
      escapeTableCell(entry.functionName),
      String(entry.complexity),
      `${(entry.coverage * 100).toFixed(2)}%`,
      `${entry.crap.toFixed(2)} |`,
    ].join(' | '),
  );

  return [
    summary,
    '| Location | Function | Comp | Cov | CRAP |',
    '|---|---|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

function formatJsonReport(report: CrapReport): string {
  return JSON.stringify(
    {
      ...report,
      entries: report.entries.map((entry) => ({
        ...entry,
        coveragePercent: Number((entry.coverage * 100).toFixed(2)),
        crapRounded: Number(entry.crap.toFixed(2)),
      })),
    },
    null,
    2,
  );
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  process.exitCode = runCrapReportCli();
}
/* v8 ignore stop */
