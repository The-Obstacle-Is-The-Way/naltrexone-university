import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { parse } from 'yaml';

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
    if (line.startsWith('#') || !/(?<!\\)\|/.test(line)) continue;
    // GitHub renders a row without either outer pipe, so skipping one would
    // let a stale row pass unseen.
    if (!line.startsWith('|')) {
      throw new Error(
        `A scripts directory row must start with a pipe: ${line}`,
      );
    }
    if (!line.endsWith('|') || line.endsWith('\\|')) {
      throw new Error(`A scripts directory row must end with a pipe: ${line}`);
    }
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replaceAll('\\|', '|').trim());
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

export type ScriptCallers = {
  packageScripts: Readonly<Record<string, string>>;
  readWorkflow: (name: string) => string | null;
  vercelConfig: string;
};

const PACKAGE_SCRIPT_REFERENCE = /`pnpm (?:run )?([^\s`]+)`/g;
// The README's contract: a backticked `*.yml` name in Run by is a workflow.
const WORKFLOW_REFERENCE = /`([^`\r\n]+\.yml)`/g;
const VERCEL_REFERENCE = '`vercel.json`';

type WorkflowDocument = {
  jobs?: Record<string, { steps?: { run?: unknown }[] }>;
};

function commandLines(commands: string): string {
  return commands
    .split('\n')
    .filter((line) => !/^\s*(?:#|echo\b)/.test(line))
    .join('\n');
}

// This is a static reference check, not a shell interpreter. It excludes
// whole comment/echo lines but cannot prove which branch executes.
function workflowCommands(workflow: string): string {
  const jobs = (parse(workflow) as WorkflowDocument | null)?.jobs ?? {};
  return Object.values(jobs)
    .flatMap((job) => job.steps ?? [])
    .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
    .join('\n');
}

function referencesScript(
  commands: string,
  scriptPath: string,
  packageScripts: ScriptCallers['packageScripts'],
  visited = new Set<string>(),
): boolean {
  const lines = commandLines(commands);
  return (
    new RegExp(`(?:^|[\\s"'])${escapeRegExp(scriptPath)}(?=$|[\\s"';&|])`).test(
      lines,
    ) ||
    Object.entries(packageScripts).some(([name, command]) => {
      if (
        visited.has(name) ||
        !new RegExp(
          `(?:^|[\\s;&|])pnpm (?:run )?${escapeRegExp(name)}(?=$|[\\s;&|])`,
        ).test(lines)
      )
        return false;
      return referencesScript(
        command,
        scriptPath,
        packageScripts,
        new Set([...visited, name]),
      );
    })
  );
}

// Named package scripts, workflows and the Vercel build must reference the
// row's path, directly or through package commands. Actual execution and
// completeness of the caller list still need source review.
export function collectRunByIssues(
  entries: readonly ScriptsDirectoryEntry[],
  { packageScripts, readWorkflow, vercelConfig }: ScriptCallers,
): string[] {
  const issues: string[] = [];

  for (const { file, runBy } of entries) {
    const scriptPath = `${SCRIPTS_FOLDER}/${file}`;

    for (const [, name = ''] of runBy.matchAll(PACKAGE_SCRIPT_REFERENCE)) {
      const command = packageScripts[name];
      if (command === undefined) {
        issues.push(
          `${file} names \`pnpm ${name}\`, which package.json does not define.`,
        );
      } else if (!referencesScript(command, scriptPath, packageScripts)) {
        issues.push(
          `${file} names \`pnpm ${name}\`, whose command does not reference it.`,
        );
      }
    }

    for (const [, workflow = ''] of runBy.matchAll(WORKFLOW_REFERENCE)) {
      const contents = readWorkflow(workflow);
      if (contents === null) {
        issues.push(`${file} names \`${workflow}\`, which is not a workflow.`);
      } else if (
        !referencesScript(
          workflowCommands(contents),
          scriptPath,
          packageScripts,
        )
      ) {
        issues.push(
          `${file} names \`${workflow}\`, which does not reference it.`,
        );
      }
    }

    if (
      runBy.includes(VERCEL_REFERENCE) &&
      !referencesScript(
        (JSON.parse(vercelConfig) as { buildCommand?: string }).buildCommand ??
          '',
        scriptPath,
        packageScripts,
      )
    ) {
      issues.push(
        `${file} names ${VERCEL_REFERENCE}, whose build command does not reference it.`,
      );
    }
  }

  return issues.sort();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readScriptCallers(): ScriptCallers {
  const root = process.cwd();
  const packageJson = JSON.parse(
    readFileSync(path.resolve(root, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };

  return {
    packageScripts: packageJson.scripts ?? {},
    readWorkflow: (name) => {
      const file = path.resolve(root, '.github/workflows', name);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    },
    vercelConfig: readFileSync(path.resolve(root, 'vercel.json'), 'utf8'),
  };
}

// The folder on disk, not git's index, so a new untracked script fails too.
// Dotfiles are not scripts, so the glob leaves them out.
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
