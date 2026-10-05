import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const REGISTERS = {
  debt: /^(?:debt|fe)-\d+.*\.md$/i,
  bugs: /^bug-\d+.*\.md$/i,
  specs: /^spec-\d+.*\.md$/i,
  brainstorming: /^bs-\d+.*\.md$/i,
  audits: /^audit-\d+.*\.md$/i,
  qa: /^qa-\d+.*\.md$/i,
};

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: {
    start: { line: number; offset?: number };
    end: { offset?: number };
  };
};

export type DocumentationLink = {
  file: string;
  line: number;
  url: string;
  target: string;
  invalidEncoding?: true;
  inTable: boolean;
  rowId?: string;
  start: number;
  end: number;
};

export type DocumentationAudit = {
  duplicates: string[];
  closedLive: string[];
  missingArchiveDispositions: string[];
  invalidNow: string[];
  strayRegisterFiles: string[];
  unnamedVerifying: string[];
  invalidVerifying: string[];
  longStatus: string[];
  verifyingOverdue: { file: string; due: string }[];
  verifyingFarFuture: { file: string; due: string }[];
  missingLiveRows: string[];
  missingRowTargets: string[];
  brokenLive: DocumentationLink[];
  brokenArchive: DocumentationLink[];
  repairableArchive: ArchiveLinkRepair[];
  oversized: string[];
  counts: { register: string; live: number; archived: number }[];
};

// An index lists open records and the current position; its budget keeps it
// a list rather than a history. Frozen register history in the archive is
// parsed whole by the link audit, so its budget bounds that audit's cost.
export const REGISTER_INDEX_BUDGET_BYTES = 32 * 1024;
// The Now stanza, with its list, states the current position in a few lines.
export const NOW_STANZA_BUDGET_BYTES = 2 * 1024;
// A Verifying check is meant to happen soon; a far-off date is reported.
const VERIFYING_HORIZON_DAYS = 90;
export const REGISTER_ARCHIVE_BUDGET_BYTES = 256 * 1024;

// A live record's status is one line; its detail belongs in the record body.
export const STATUS_MAX_CHARACTERS = 200;

function registerFileBudget(file: string): number | undefined {
  const parts = file.split('/');
  const isRegister = (name?: string) =>
    name !== undefined && Object.hasOwn(REGISTERS, name);
  if (parts.length === 3 && parts[0] === 'docs' && isRegister(parts[1]))
    return parts[2] === 'index.md' ? REGISTER_INDEX_BUDGET_BYTES : undefined;
  if (
    parts.length === 4 &&
    parts[0] === 'docs' &&
    parts[1] === '_archive' &&
    isRegister(parts[2]) &&
    /^register-.*\.md$/.test(parts[3] ?? '')
  )
    return REGISTER_ARCHIVE_BUDGET_BYTES;
  return undefined;
}

// Beside the bug and debt indexes only open records belong: change history
// lives in git, and frozen register history lives in the archive.
const RESTRUCTURED_REGISTERS = ['bugs', 'debt'] as const;

function isStrayRegisterFile(file: string): boolean {
  const [docs, register, name, ...rest] = file.split('/');
  if (docs !== 'docs' || rest.length > 0 || name === undefined) return false;
  if (!RESTRUCTURED_REGISTERS.some((entry) => entry === register)) return false;
  const pattern =
    REGISTERS[register as (typeof RESTRUCTURED_REGISTERS)[number]];
  return name !== 'index.md' && !pattern.test(name);
}

type ArchiveLinkRepair = DocumentationLink & {
  replacementTarget: string;
  replacementUrl: string;
  kind: 'depth' | 'later-archive';
};

function decodedLinkPath(url: string): string | undefined {
  try {
    return decodeURIComponent(url.split(/[?#]/)[0] ?? '');
  } catch {
    // Malformed encoding is an unresolvable link, never a guessed raw path.
    return undefined;
  }
}

export function archiveLinkRepairs(
  links: DocumentationLink[],
  exists: (file: string) => boolean,
): ArchiveLinkRepair[] {
  return links.flatMap((link) => {
    if (!link.file.startsWith('docs/_archive/')) return [];
    const destination = decodedLinkPath(link.url);
    if (destination === undefined) return [];
    const originalFile = link.file.replace('docs/_archive/', 'docs/');
    const originalTarget = path.posix.normalize(
      path.posix.join(path.posix.dirname(originalFile), destination),
    );
    const archived = (target: string) =>
      target.replace(
        /^docs\/(debt|bugs|specs|brainstorming|audits|qa)\//,
        'docs/_archive/$1/',
      );
    const candidates = [
      ...new Set([
        originalTarget,
        archived(originalTarget),
        archived(link.target),
      ]),
    ].filter(
      (target) =>
        target !== '..' && !target.startsWith('../') && exists(target),
    );
    const target = candidates[0];
    // No filename guessing: ambiguous and missing historical targets stay reported.
    if (candidates.length !== 1 || !target) return [];
    const suffix = link.url.match(/[?#].*$/)?.[0] ?? '';
    return [
      {
        ...link,
        replacementTarget: target,
        replacementUrl:
          path.posix
            .relative(path.posix.dirname(link.file), target)
            .split('/')
            .map(encodeURIComponent)
            .join('/') + suffix,
        kind: target === originalTarget ? 'depth' : 'later-archive',
      },
    ];
  });
}

function recordIdentity(value: string): string | undefined {
  return value.match(/^[a-z]+-\d+/i)?.[0].toLowerCase();
}

function nodeText(node?: MarkdownNode): string {
  return node?.value ?? (node?.children ?? []).map(nodeText).join('');
}

export function documentationLinks(
  file: string,
  contents: string,
): DocumentationLink[] {
  return scanMarkdown(file, contents).links;
}

type StanzaLabel = { text: string; start: number; end: number };

// One parse yields a file's links and its top-level labelled stanzas.
function scanMarkdown(
  file: string,
  contents: string,
): { links: DocumentationLink[]; labels: StanzaLabel[] } {
  const links: DocumentationLink[] = [];
  const labels: StanzaLabel[] = [];
  // Use the installed first-party application Markdown seam, including GFM
  // tables. Code examples are not links; definitions cover reference links.
  Markdown({
    children: contents,
    remarkPlugins: [
      remarkGfm,
      () => (tree: MarkdownNode) => {
        // Top-level paragraphs that open with a bold label, such as **Now**.
        // A stanza runs to the end of a list that directly follows it.
        const children = tree.children ?? [];
        children.forEach((node, index) => {
          if (
            node.type !== 'paragraph' ||
            node.children?.[0]?.type !== 'strong'
          )
            return;
          const next = children[index + 1];
          labels.push({
            text: nodeText(node.children[0]),
            start: node.position?.start.offset ?? 0,
            end:
              (next?.type === 'list' ? next : node).position?.end.offset ?? 0,
          });
        });
        function visit(
          node: MarkdownNode,
          inTable = false,
          rowId?: string,
        ): void {
          if (
            node.type === 'html' &&
            /\b(?:href|src)\s*=/i.test(node.value ?? '')
          ) {
            throw new Error(
              `Unsupported HTML link attributes: ${file}:${node.position?.start.line ?? 1}; use Markdown links or images`,
            );
          }
          const table = inTable || node.type === 'table';
          const identity =
            node.type === 'tableRow'
              ? recordIdentity(nodeText(node.children?.[0]).trim())
              : rowId;
          if (
            ['link', 'image', 'definition'].includes(node.type) &&
            node.url &&
            !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(node.url)
          ) {
            const start = node.position?.start.offset;
            const end = node.position?.end.offset;
            if (start === undefined || end === undefined)
              throw new Error(`Missing Markdown source position: ${file}`);
            const destination = decodedLinkPath(node.url);
            links.push({
              file,
              line: node.position?.start.line ?? 1,
              url: node.url,
              target: path.posix.normalize(
                path.posix.join(
                  path.posix.dirname(file),
                  destination ?? node.url.split(/[?#]/)[0] ?? '',
                ),
              ),
              ...(destination === undefined
                ? { invalidEncoding: true as const }
                : {}),
              inTable: table,
              ...(identity ? { rowId: identity } : {}),
              start,
              end,
            });
          }
          for (const child of node.children ?? [])
            visit(child, table, identity);
        }
        visit(tree);
      },
    ],
  });
  return { links, labels };
}

function recordStatus(file: string, contents: string): string {
  const field =
    /^\s*(?:>\s*)?\*\*(?:Status|Resolution State):?\*\*:?\s*(.+)$/im.exec(
      contents,
    );
  if (!field) return '';
  const offset = field.index + field[0].indexOf('**');
  const prefix = contents.slice(0, field.index + field[0].length);
  // Validate the first candidate's code-block context, not every historical
  // body. Ambiguous metadata fails closed instead of searching for a later
  // status that happens to pass. Existing unrelated earlier code is allowed.
  // A code block needs a fence or an indented line, and a block quote can
  // hold one after its marker; without any of these, skip the parse.
  if (!/```|~~~|^(?: {4}|\t| {0,3}>)/m.test(prefix)) return statusValue(field);
  Markdown({
    children: prefix,
    remarkPlugins: [
      () => (tree: MarkdownNode) => {
        function visit(node: MarkdownNode): void {
          if (
            node.type === 'code' &&
            (node.position?.end.offset ?? prefix.length) >= offset
          )
            throw new Error(
              `Status metadata inside a code example: ${file}; put the record disposition before examples`,
            );
          for (const child of node.children ?? []) visit(child);
        }
        visit(tree);
      },
    ],
  });
  return statusValue(field);
}

function statusValue(field: RegExpExecArray): string {
  return (field[1] ?? '')
    .replaceAll('**', '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

// Only the leading disposition counts; explanations may describe earlier work.
const CLOSED_STATUS =
  /^(?:resolved|archived|implemented|closed|completed?|fixed|fully addressed)\b/i;
const HISTORICAL_DISPOSITION =
  /^(?:accepted|invalidated|decomposed|deferred|decided|won['’]t fix|reclassified|superseded|parked)\b/i;

const VERIFYING_STATUS = /^verifying\b/i;
const DUE_DATE = /\bdue (\d{4}-\d{2}-\d{2})\b/gi;
const HISTORY_LABEL = /^(?:latest|earlier|update history)\b/i;
// A status line followed by a plain text line was hard-wrapped.
const WRAPPED_STATUS =
  /^\s*(?:>\s*)?\*\*(?:Status|Resolution State):?\*\*:?.*\n(?!\s*$|\s*(?:>\s*)?\*\*|\s*#|\s*-{3}|\s*[-*+]\s|\s*\d+\.\s)/im;

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function auditRecordLifecycle(
  files: ReadonlyMap<string, string>,
  exists: (file: string) => boolean,
  today: string = new Date().toISOString().slice(0, 10),
): DocumentationAudit {
  const targetExists = (file: string) =>
    file !== '..' && !file.startsWith('../') && exists(file);
  const result: DocumentationAudit = {
    duplicates: [],
    closedLive: [],
    missingArchiveDispositions: [],
    invalidNow: [],
    strayRegisterFiles: [],
    unnamedVerifying: [],
    invalidVerifying: [],
    longStatus: [],
    verifyingOverdue: [],
    verifyingFarFuture: [],
    missingLiveRows: [],
    missingRowTargets: [],
    brokenLive: [],
    brokenArchive: [],
    repairableArchive: [],
    oversized: [],
    counts: [],
  };
  const scans = new Map(
    Object.keys(REGISTERS).map((register) => {
      const file = `docs/${register}/index.md`;
      return [file, scanMarkdown(file, files.get(file) ?? '')];
    }),
  );
  for (const [file, contents] of files) {
    const budget = registerFileBudget(file);
    if (budget !== undefined && Buffer.byteLength(contents, 'utf8') > budget)
      result.oversized.push(file);
    if (isStrayRegisterFile(file)) result.strayRegisterFiles.push(file);
  }

  for (const [register, pattern] of Object.entries(REGISTERS)) {
    const liveDirectory = `docs/${register}`;
    const archiveDirectory = `docs/_archive/${register}`;
    const indexFile = `${liveDirectory}/index.md`;
    const labels = scans.get(indexFile)?.labels ?? [];
    const nowLabels = labels.filter((label) => /^now\b/i.test(label.text));
    const now = nowLabels[0];
    const nowText = now
      ? (files.get(indexFile) ?? '').slice(now.start, now.end)
      : '';
    // Bug and debt indexes state their current position in one Now stanza,
    // replaced in place, and carry no changelog under any label. Other
    // registers need no Now stanza, but none keeps a Latest changelog.
    const restructured = RESTRUCTURED_REGISTERS.some(
      (entry) => entry === register,
    );
    if (
      restructured
        ? nowLabels.length !== 1 ||
          now?.text !== 'Now' ||
          labels.some((label) => HISTORY_LABEL.test(label.text)) ||
          Buffer.byteLength(nowText, 'utf8') > NOW_STANZA_BUDGET_BYTES
        : labels.filter((label) => label.text === 'Now').length > 1 ||
          labels.some((label) => label.text === 'Latest')
    )
      result.invalidNow.push(indexFile);
    const records = (directory: string) =>
      [...files.keys()].filter(
        (file) =>
          path.posix.dirname(file) === directory &&
          pattern.test(path.posix.basename(file)),
      );
    const live = records(liveDirectory);
    const archived = records(archiveDirectory);
    const recordId = (file: string) =>
      recordIdentity(path.posix.basename(file));
    const archivedIds = new Set(archived.map(recordId));
    const rows = (scans.get(indexFile)?.links ?? []).filter(
      (link) => link.inTable,
    );
    // A related link in another record's notes is not this record's own row.
    const registered = new Set(
      rows
        .filter(
          (link) =>
            !link.invalidEncoding && link.rowId === recordId(link.target),
        )
        .map((link) => link.target),
    );
    for (const record of live) {
      const status = recordStatus(record, files.get(record) ?? '');
      if (archivedIds.has(recordId(record))) result.duplicates.push(record);
      if (CLOSED_STATUS.test(status)) result.closedLive.push(record);
      if (!registered.has(record)) result.missingLiveRows.push(record);
      if (
        status.length > STATUS_MAX_CHARACTERS ||
        WRAPPED_STATUS.test(files.get(record) ?? '')
      )
        result.longStatus.push(record);
      // A record whose fix shipped but whose check can only happen in
      // production stays live, as Verifying, until that check is done.
      if (VERIFYING_STATUS.test(status)) {
        const dues = [...status.matchAll(DUE_DATE)].map((match) => match[1]);
        const due = dues[0];
        if (dues.length !== 1 || !due || !isCalendarDate(due))
          result.invalidVerifying.push(record);
        else if (due < today)
          result.verifyingOverdue.push({ file: record, due });
        else if (due > addDays(today, VERIFYING_HORIZON_DAYS))
          result.verifyingFarFuture.push({ file: record, due });
        if (!nowText.toLowerCase().includes(recordId(record) ?? record))
          result.unnamedVerifying.push(record);
      }
    }
    for (const record of archived) {
      const status = recordStatus(record, files.get(record) ?? '');
      if (!CLOSED_STATUS.test(status) && !HISTORICAL_DISPOSITION.test(status))
        result.missingArchiveDispositions.push(record);
    }
    for (const row of rows) {
      if (row.invalidEncoding || !targetExists(row.target))
        result.missingRowTargets.push(
          `${row.file}:${row.line} -> ${row.target}`,
        );
    }
    result.counts.push({
      register,
      live: live.length,
      archived: archived.length,
    });
  }
  result.strayRegisterFiles.sort();
  return result;
}

export function brokenDocumentationLinks(
  file: string,
  contents: string,
  exists: (file: string) => boolean,
): DocumentationLink[] {
  return documentationLinks(file, contents).filter(
    (link) =>
      link.invalidEncoding ||
      link.target === '..' ||
      link.target.startsWith('../') ||
      !exists(link.target),
  );
}

export function auditDocumentation(
  files: ReadonlyMap<string, string>,
  exists: (file: string) => boolean,
): DocumentationAudit {
  const result = auditRecordLifecycle(files, exists);
  for (const [file, contents] of files) {
    for (const link of brokenDocumentationLinks(file, contents, exists)) {
      const list = link.file.startsWith('docs/_archive/')
        ? result.brokenArchive
        : result.brokenLive;
      list.push(link);
    }
  }
  result.repairableArchive = archiveLinkRepairs(result.brokenArchive, exists);
  return result;
}

export function repairArchiveLinks(
  root: string,
  repairs: ArchiveLinkRepair[],
): void {
  const edits = new Map<string, ArchiveLinkRepair[]>();
  for (const repair of repairs) {
    const fileEdits = edits.get(repair.file) ?? [];
    fileEdits.push(repair);
    edits.set(repair.file, fileEdits);
  }
  const rewritten = new Map<string, string>();
  for (const [file, fileEdits] of edits) {
    const original = readFileSync(path.join(root, file), 'utf8');
    let contents = original;
    for (const repair of fileEdits.toSorted((a, b) => b.start - a.start)) {
      const span = original.slice(repair.start, repair.end);
      const offset = span.lastIndexOf(repair.url);
      if (offset < 0)
        throw new Error(`Cannot safely rewrite ${file}:${repair.line}`);
      const start = repair.start + offset;
      contents =
        contents.slice(0, start) +
        repair.replacementUrl +
        contents.slice(start + repair.url.length);
    }
    const expected = documentationLinks(file, original).map(
      (link) =>
        fileEdits.find((repair) => repair.start === link.start)
          ?.replacementUrl ?? link.url,
    );
    const actual = documentationLinks(file, contents);
    if (
      actual.length !== expected.length ||
      actual.some((link, i) => link.url !== expected[i])
    )
      throw new Error(
        `Cannot safely rewrite ${file}: Markdown destinations changed unexpectedly`,
      );
    for (const repair of fileEdits) {
      if (!existsSync(path.join(root, repair.replacementTarget)))
        throw new Error(
          `Repair target disappeared: ${repair.replacementTarget}`,
        );
    }
    rewritten.set(file, contents);
  }
  // Validate every planned rewrite before any write; unsupported syntax cannot
  // leave a partially repaired batch. Write failures still fail the command.
  for (const [file, contents] of rewritten)
    writeFileSync(path.join(root, file), contents);
}

export function readDocumentationFiles(root: string): Map<string, string> {
  // Repository-authored documentation, not vendored skill packages or build
  // artifacts. Numbered records are direct children of their register folder;
  // indexes, templates, assets, living guides and ADRs are not open records.
  const names = globSync(
    ['docs/**/*.md', '*.md', '.claude/rules/**/*.md', '.github/**/*.md'],
    { cwd: root },
  ).sort();
  for (const register of Object.keys(REGISTERS)) {
    if (!names.includes(`docs/${register}/index.md`))
      throw new Error(`Missing documentation register: ${register}`);
  }
  return new Map(
    names.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
  );
}

export function readDocumentation(root: string): DocumentationAudit {
  return auditDocumentation(readDocumentationFiles(root), (file) =>
    existsSync(path.resolve(root, file)),
  );
}

export function runDocumentationCommand(
  root: string,
  report: (json: string) => void,
  args: readonly string[] = [],
): number {
  let result = readDocumentation(root);
  if (args.includes('--repair-archive')) {
    repairArchiveLinks(root, result.repairableArchive);
    result = readDocumentation(root);
  }
  report(JSON.stringify(result, null, 2));
  return [
    result.duplicates,
    result.closedLive,
    result.missingArchiveDispositions,
    result.invalidNow,
    result.strayRegisterFiles,
    result.unnamedVerifying,
    result.invalidVerifying,
    result.longStatus,
    result.missingLiveRows,
    result.missingRowTargets,
    result.brokenLive,
    result.oversized,
    result.repairableArchive,
    result.brokenArchive.filter((link) => link.invalidEncoding),
  ].some((issues) => issues.length > 0)
    ? 1
    : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = runDocumentationCommand(
    process.cwd(),
    console.log,
    process.argv.slice(2),
  );
}
