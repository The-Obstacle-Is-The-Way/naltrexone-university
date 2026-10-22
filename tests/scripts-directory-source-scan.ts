import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { globSync } from 'tinyglobby';
import { parse } from 'yaml';

const SCRIPTS_FOLDER = 'scripts';
const SCRIPTS_DIRECTORY_PATH = 'scripts/README.md';
const DIRECTORY_START = '<!-- scripts-directory:start -->';
const DIRECTORY_END = '<!-- scripts-directory:end -->';
const DIRECTORY_HEADER = ['File', 'What it does', 'Run by'] as const;
const DATA_FIXTURE_EXTENSION = /\.(?:json|ya?ml)$/;

export type ScriptsDirectoryEntry = {
  file: string;
  purpose: string;
  runBy: string;
};

// Tests, their helpers and fixtures sit beside the script they serve and are
// named after it, so the README describes them once, by convention, rather
// than in a row each. Code placed in `fixtures/` still needs a row.
export function isListedScript(file: string): boolean {
  return !(
    file === 'README.md' ||
    file.endsWith('.test.ts') ||
    file.endsWith('-test-helpers.ts') ||
    (file.split('/').includes('fixtures') && DATA_FIXTURE_EXTENSION.test(file))
  );
}

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { line: number } };
};

// Parse the whole document: fences and HTML blocks can start before a marker.
// Use the same installed Markdown/GFM seam as the documentation link audit.
function renderedTableRows(markdown: string): Set<number> {
  const lines = new Set<number>();
  Markdown({
    children: markdown,
    remarkPlugins: [
      remarkGfm,
      () => (tree: MarkdownNode) => {
        const visit = (node: MarkdownNode) => {
          if (node.type === 'table') {
            for (const row of node.children ?? []) {
              if (row.position) lines.add(row.position.start.line);
            }
          }
          for (const child of node.children ?? []) visit(child);
        };
        visit(tree);
      },
    ],
  });
  return lines;
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

  const body = markdown.slice(start + DIRECTORY_START.length, end);
  // A row inside either one does not render as a table row.
  if (/<!--|^\s*(?:```|~~~)/m.test(body)) {
    throw new Error(
      'The scripts directory must not contain HTML comments or code fences, which hide rows or stop them rendering as a table.',
    );
  }

  const entries: ScriptsDirectoryEntry[] = [];
  const renderedRows = renderedTableRows(markdown);
  let lineNumber =
    markdown.slice(0, start + DIRECTORY_START.length).split('\n').length - 1;
  let table: 'none' | 'header' | 'rows' = 'none';
  for (const rawLine of body.split('\n')) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (line.startsWith('#') || !/(?<!\\)\|/.test(line)) {
      if (table === 'header')
        throw new Error('A table header must be followed by its delimiter.');
      table = 'none';
      continue;
    }
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
    const isHeader =
      cells.length === DIRECTORY_HEADER.length &&
      DIRECTORY_HEADER.every((heading, index) => cells[index] === heading);
    if (isHeader) {
      table = 'header';
      continue;
    }
    if (
      cells.length === DIRECTORY_HEADER.length &&
      cells.every((cell) => /^:?-+:?$/.test(cell))
    ) {
      if (table !== 'header')
        throw new Error('A table delimiter needs its table header.');
      table = 'rows';
      continue;
    }
    if (cells.length !== DIRECTORY_HEADER.length) {
      throw new Error(
        `A scripts directory row must have exactly three cells: ${line}`,
      );
    }

    if (table !== 'rows')
      throw new Error(
        'A scripts directory row needs a table header and delimiter.',
      );
    if (!renderedRows.has(lineNumber)) {
      throw new Error(
        'A scripts directory row must render as a Markdown table row.',
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

// The README's contract: Run by names automation only as a code span, either
// `pnpm <script>` (arguments allowed), a workflow file or `vercel.json`. Any
// other way of naming one fails, so a caller is never silently unchecked. A
// `pnpm exec` command, run by hand, must name the row's own path.
const PACKAGE_SCRIPT_REFERENCE =
  /`pnpm\s+(?:run\s+)?(?!exec\s)([^\s`]+)[^`]*`/g;
const PNPM_EXEC_REFERENCE = /`(pnpm\s+exec\s[^`]*)`/g;
const WORKFLOW_REFERENCE = /`([^`\r\n]+\.ya?ml)`/g;
const VERCEL_REFERENCE = '`vercel.json`';
const OTHER_PACKAGE_MANAGER = /`(?:npm|npx|yarn)\s[^`]*`/g;
const CALLER_OUTSIDE_CODE_SPAN = /\bpnpm\b|\.ya?ml\b|\bvercel\b/i;

type WorkflowDocument = {
  jobs?: Record<string, { steps?: { run?: unknown }[] }>;
};

// Drops comments, then splits on command separators and drops `echo` and
// `printf` commands, so a path they only print does not count.
function commandLines(commands: string): string {
  const parts: string[] = [];
  let command = '';
  let quote: string | null = null;
  const finish = () => {
    const firstWord =
      command.trimStart().match(/^("[^"]*"|'[^']*'|\S+)/)?.[0] ?? '';
    const executable = path.posix.basename(
      firstWord.replace(/^(['"])(.*)\1$/, '$2'),
    );
    if (executable !== 'echo' && executable !== 'printf') parts.push(command);
    command = '';
  };
  for (let index = 0; index < commands.length; index += 1) {
    const char = commands[index];
    if (char === '\\' && quote !== "'") {
      command += char + (commands[++index] ?? '');
    } else if (quote !== null) {
      command += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      command += char;
    } else if (
      char === '#' &&
      (index === 0 || /\s/.test(commands[index - 1] ?? ''))
    ) {
      while (index < commands.length && commands[index] !== '\n') index += 1;
      finish();
    } else if (char !== undefined && /[;&|\n]/.test(char)) {
      finish();
    } else {
      command += char;
    }
  }
  finish();
  return parts.join('\n');
}

// This is a static reference check, not a shell interpreter. It excludes
// comments and echo/printf commands but cannot prove which branch executes,
// and it does not read heredocs or continued lines.
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

    for (const [span] of runBy.matchAll(OTHER_PACKAGE_MANAGER)) {
      issues.push(
        `${file} names ${span}; name its package script as \`pnpm <name>\`.`,
      );
    }
    if (CALLER_OUTSIDE_CODE_SPAN.test(runBy.replace(/`[^`]*`/g, ' '))) {
      issues.push(
        `${file} names a caller outside a code span, which this check cannot read.`,
      );
    }

    for (const [, command = ''] of runBy.matchAll(PNPM_EXEC_REFERENCE)) {
      if (!referencesScript(command, scriptPath, {})) {
        issues.push(
          `${file} names \`${command}\`, which does not reference it.`,
        );
      }
    }

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
