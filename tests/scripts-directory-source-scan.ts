import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';

const SCRIPTS_FOLDER = 'scripts';
const SCRIPTS_DIRECTORY_PATH = 'scripts/README.md';
const DIRECTORY_START = '<!-- scripts-directory:start -->';
const DIRECTORY_END = '<!-- scripts-directory:end -->';

export type ScriptsDirectoryEntry = {
  file: string;
  purpose: string;
  runBy: string;
};

// Tests, their helpers and fixtures sit beside the script they serve and are
// named after it, so the README describes them once, by convention, rather
// than in a row each.
export function isListedScript(file: string): boolean {
  return !(
    file === 'README.md' ||
    file.endsWith('.test.ts') ||
    file.endsWith('-test-helpers.ts') ||
    file.startsWith('fixtures/')
  );
}

export function parseScriptsDirectory(
  markdown: string,
): ScriptsDirectoryEntry[] {
  const startCount = markdown.split(DIRECTORY_START).length - 1;
  const endCount = markdown.split(DIRECTORY_END).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(
      'The scripts directory must contain each marker exactly once in one ordered start/end marker pair.',
    );
  }

  const start = markdown.indexOf(DIRECTORY_START);
  const end = markdown.indexOf(DIRECTORY_END);
  if (end <= start) {
    throw new Error(
      'The scripts directory must contain one ordered start/end marker pair.',
    );
  }

  const entries: ScriptsDirectoryEntry[] = [];
  for (const rawLine of markdown
    .slice(start + DIRECTORY_START.length, end)
    .split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells[0] === 'File' || cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }
    if (cells.length !== 3) {
      throw new Error(
        `A scripts directory row must have exactly three cells: ${line}`,
      );
    }

    const [rawFile = '', purpose = '', runBy = ''] = cells;
    entries.push({ file: rawFile.replaceAll('`', '').trim(), purpose, runBy });
  }

  return entries;
}

export function collectScriptsDirectoryIssues(
  files: readonly string[],
  entries: readonly ScriptsDirectoryEntry[],
): string[] {
  const issues: string[] = [];
  const scripts = new Set(files);

  for (const file of [...scripts].sort()) {
    const matches = entries.filter((entry) => entry.file === file);
    if (matches.length === 0) {
      issues.push(`${file} has no row in ${SCRIPTS_DIRECTORY_PATH}.`);
      continue;
    }
    if (matches.length > 1) {
      issues.push(
        `${file} appears ${matches.length} times in ${SCRIPTS_DIRECTORY_PATH}.`,
      );
      continue;
    }

    const entry = matches[0];
    if (!entry?.purpose) {
      issues.push(`${file} has no description in ${SCRIPTS_DIRECTORY_PATH}.`);
    }
    if (!entry?.runBy) {
      issues.push(`${file} names no caller in ${SCRIPTS_DIRECTORY_PATH}.`);
    }
  }

  for (const entry of entries) {
    if (!scripts.has(entry.file)) {
      issues.push(
        `${entry.file || '(blank file)'} is listed in ${SCRIPTS_DIRECTORY_PATH} but is not a script there.`,
      );
    }
  }

  return issues.sort();
}

// The folder on disk, not git's index, so a new untracked script fails too.
export function readScriptFiles(): string[] {
  return globSync('**/*', {
    cwd: path.resolve(process.cwd(), SCRIPTS_FOLDER),
    onlyFiles: true,
  })
    .filter(isListedScript)
    .sort();
}

export function readScriptsDirectory(): ScriptsDirectoryEntry[] {
  return parseScriptsDirectory(
    readFileSync(path.resolve(process.cwd(), SCRIPTS_DIRECTORY_PATH), 'utf8'),
  );
}
