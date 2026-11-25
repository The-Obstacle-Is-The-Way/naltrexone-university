import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from '@typescript/typescript6';

const APPLICATION_FAKE_BARREL_PATH =
  'src/application/test-helpers/fakes/index.ts';
const FAKE_CONTRACT_REGISTER_PATH = 'docs/guides/testing/fake-contracts.md';
const ADAPTER_ROOT_PATH = 'src/adapters';
const TEST_HELPERS_DIRECTORY = 'test-helpers';
const REGISTER_START = '<!-- fake-contract-register:start -->';
const REGISTER_END = '<!-- fake-contract-register:end -->';

export type FakeContractRegisterEntry = {
  name: string;
  verification: string;
  knownDivergences: string;
};

export type AdapterTestHelperSource = { path: string; contents: string };

const hasExportModifier = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );

// Every identifier a declaration binds, through object and array patterns.
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];

  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

// Names a file declares only as a type. `export { Name }` needs no `type`
// keyword for them, so the export alone cannot tell a type from a value.
function localTypeOnlyNames(parsed: ts.SourceFile): Set<string> {
  const types = new Set<string>();
  const values = new Set<string>();

  for (const statement of parsed.statements) {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      types.add(statement.name.text);
    } else if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      statement.name
    ) {
      values.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of boundNames(declaration.name)) values.add(name);
      }
    }
  }

  return new Set([...types].filter((name) => !values.has(name)));
}

// Value bindings a file exports: classes, functions, constants and named
// exports. Types are left out, since a type is not a double.
function exportedBindingNames(source: AdapterTestHelperSource): string[] {
  const parsed = ts.createSourceFile(
    source.path,
    source.contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names: string[] = [];
  const typeOnlyNames = localTypeOnlyNames(parsed);

  for (const statement of parsed.statements) {
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      hasExportModifier(statement) &&
      statement.name
    ) {
      names.push(statement.name.text);
    } else if (
      ts.isVariableStatement(statement) &&
      hasExportModifier(statement)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        names.push(...boundNames(declaration.name));
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      // A re-export names another module's binding, which this file cannot
      // classify, so only a local export is checked against the local types.
      const isLocal = !statement.moduleSpecifier;
      for (const element of statement.exportClause.elements) {
        const localName = (element.propertyName ?? element.name).text;
        if (element.isTypeOnly) continue;
        if (isLocal && typeOnlyNames.has(localName)) continue;
        names.push(element.name.text);
      }
    }
  }

  return names;
}

export function collectAdapterOwnedFakeNames(
  sources: readonly AdapterTestHelperSource[],
): string[] {
  const names = new Set<string>();

  for (const source of sources) {
    if (source.path.endsWith('.test.ts')) continue;
    for (const name of exportedBindingNames(source)) {
      if (name.startsWith('Fake')) names.add(name);
    }
  }

  return [...names].sort();
}

export function collectMaintainedBehaviorDoubleNames(
  barrelContents: string,
  adapterOwnedFakeNames: readonly string[],
): string[] {
  const parsed = ts.createSourceFile(
    APPLICATION_FAKE_BARREL_PATH,
    barrelContents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set<string>(adapterOwnedFakeNames);

  for (const statement of parsed.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text === './fake-use-cases'
    ) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      if (element.name.text.startsWith('Fake')) {
        names.add(element.name.text);
      }
    }
  }

  return [...names].sort();
}

export function parseFakeContractRegister(
  markdown: string,
): FakeContractRegisterEntry[] {
  const startCount = markdown.split(REGISTER_START).length - 1;
  const endCount = markdown.split(REGISTER_END).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(
      'Fake contract register must contain each marker exactly once in one ordered start/end marker pair.',
    );
  }

  const start = markdown.indexOf(REGISTER_START);
  const end = markdown.indexOf(REGISTER_END);
  if (end <= start) {
    throw new Error(
      'Fake contract register must contain one ordered start/end marker pair.',
    );
  }

  const table = markdown.slice(start + REGISTER_START.length, end);
  const entries: FakeContractRegisterEntry[] = [];
  for (const rawLine of table.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells[0] === 'Double' || cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }
    if (cells.length !== 3) {
      throw new Error(
        `Fake contract register row must have exactly three cells: ${line}`,
      );
    }

    const [rawName = '', verification = '', knownDivergences = ''] = cells;
    entries.push({
      name: rawName.replaceAll('`', '').trim(),
      verification,
      knownDivergences,
    });
  }

  return entries;
}

const WAIVER_PATTERN = /\bwaiver\b/i;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;

// A date-shaped string is not a date: `2026-99-99` would satisfy the pattern
// while carrying no point in time to measure a waiver's staleness against.
function hasCalendarDate(verification: string): boolean {
  const match = ISO_DATE_PATTERN.exec(verification);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function collectFakeContractRegisterIssues(
  maintainedNames: readonly string[],
  entries: readonly FakeContractRegisterEntry[],
): string[] {
  const issues: string[] = [];
  const maintained = new Set(maintainedNames);

  for (const name of [...maintained].sort()) {
    const matches = entries.filter((entry) => entry.name === name);
    if (matches.length === 0) {
      issues.push(`${name} is missing from the fake contract register.`);
      continue;
    }
    if (matches.length > 1) {
      issues.push(
        `${name} appears ${matches.length} times in the fake contract register.`,
      );
      continue;
    }

    const entry = matches[0];
    if (!entry?.verification.trim()) {
      issues.push(`${name} has no verification or dated waiver.`);
    } else if (
      WAIVER_PATTERN.test(entry.verification) &&
      !hasCalendarDate(entry.verification)
    ) {
      // A waiver is only meaningful while its date stands: any later behavior
      // change invalidates it. An undated waiver can never go stale, so it
      // would silently become permanent.
      issues.push(`${name} declares a waiver without an ISO date.`);
    }
    if (!entry?.knownDivergences.trim()) {
      issues.push(`${name} has no known-divergences note.`);
    }
  }

  for (const entry of entries) {
    if (!maintained.has(entry.name)) {
      issues.push(
        `${entry.name || '(blank name)'} is not a maintained behavior double.`,
      );
    }
  }

  return issues.sort();
}

// Every `.ts` file in any `test-helpers/` directory under the adapters,
// whatever it is called.
function readAdapterTestHelperSources(): AdapterTestHelperSource[] {
  const root = path.resolve(process.cwd(), ADAPTER_ROOT_PATH);

  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(
      (relativePath) =>
        relativePath.endsWith('.ts') &&
        relativePath.split(path.sep).includes(TEST_HELPERS_DIRECTORY),
    )
    .map((relativePath) => ({
      path: path.posix.join(
        ADAPTER_ROOT_PATH,
        relativePath.split(path.sep).join('/'),
      ),
      contents: readFileSync(path.join(root, relativePath), 'utf8'),
    }));
}

export function readMaintainedBehaviorDoubleNames(): string[] {
  return collectMaintainedBehaviorDoubleNames(
    readFileSync(
      path.resolve(process.cwd(), APPLICATION_FAKE_BARREL_PATH),
      'utf8',
    ),
    collectAdapterOwnedFakeNames(readAdapterTestHelperSources()),
  );
}

export function readFakeContractRegister(): FakeContractRegisterEntry[] {
  return parseFakeContractRegister(
    readFileSync(
      path.resolve(process.cwd(), FAKE_CONTRACT_REGISTER_PATH),
      'utf8',
    ),
  );
}
