import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Open bug and debt records live in one folder, with one index. A closed
// record is deleted and leaves a line in the ledger (DEBT-518).
export const RECORDS = {
  directory: 'docs/records',
  index: 'docs/records/README.md',
  ledger: 'docs/records/closed.md',
  pattern: /^(?:bug|debt)-\d+.*\.md$/i,
};

// The registers that once kept their own folders. Their archived records keep
// a disposition until the archive is deleted, and their old folders hold no
// record or index any more.
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
  retiredRegisterFiles: string[];
  duplicateLedgerIds: string[];
  malformedLedgerLines: string[];
  unnamedVerifying: string[];
  invalidScheduledChecks: string[];
  invalidStatus: string[];
  longStatus: string[];
  scheduledOverdue: { file: string; due: string }[];
  scheduledFarFuture: { file: string; due: string }[];
  missingLiveRows: string[];
  missingRowTargets: string[];
  brokenLive: DocumentationLink[];
  recordLinks: DocumentationLink[];
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

function isRegister(name?: string): name is keyof typeof REGISTERS {
  return name !== undefined && Object.hasOwn(REGISTERS, name);
}

function registerFileBudget(file: string): number | undefined {
  const parts = file.split('/');
  if (file === RECORDS.index) return REGISTER_INDEX_BUDGET_BYTES;
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

// Beside the records index only open records and the ledger belong: change
// history lives in git, and a closed record is a ledger line. Records get no
// asset folders; DEBT-414's predate that rule and go when it closes.
const LEGACY_RECORD_ASSETS =
  /^docs\/records\/assets\/(?:debt-414|inventory-2026-09-21|active-audit-2026-09-21)\//;

function isStrayRecordsFile(file: string): boolean {
  if (!file.startsWith(`${RECORDS.directory}/`)) return false;
  if (path.posix.dirname(file) !== RECORDS.directory)
    return !LEGACY_RECORD_ASSETS.test(file);
  return (
    file !== RECORDS.index &&
    file !== RECORDS.ledger &&
    !RECORDS.pattern.test(path.posix.basename(file))
  );
}

// Markdown left in an old register folder, at any depth, missed the move to
// docs/records or docs/product. Asset folders stay until the archive that
// links them is deleted.
function isRetiredRegisterFile(file: string): boolean {
  const [docs, register, name, ...rest] = file.split('/');
  if (docs !== 'docs' || name === undefined) return false;
  if (!isRegister(register)) return false;
  return !(name === 'assets' && rest.length > 0);
}

// A ledger line: ID · title · disposition · date · path, then optionally the
// closing PR and the commit of the record's last version.
const LEDGER_ENTRY =
  /^- ([A-Z]+-\d+[a-z]?) · [^·\n]+ · [^·\n]+ · \d{4}-\d{2}-\d{2} · \S[^\n]*$/;
// Historical archive entries use the shared snapshot in the ledger header.
// A deleted working record has no such snapshot: its retrieval receipt is
// required on its own line. Reachability and knowledge harvest need review.
const WORKING_RECORD_RECEIPT =
  / · docs\/records\/(?:bug|debt)-\d+[^\s/]*\.md · #[1-9]\d* · [0-9a-f]{40}$/;
const LIST_ITEM = /^\s*[-*+] /;
// IDs given to two records each before anything checked; each ledger line
// names its own file. No third, and no new collision, is allowed.
const HISTORICAL_ID_COLLISIONS = new Set(['DEBT-338', 'FE-055', 'SPEC-028']);

// IDs compare by prefix and number, so `bug-05` and `BUG-005` are the same.
function canonicalId(value: string): string | undefined {
  const match = value.match(/^([a-z]+)-0*(\d+)([a-z]?)(?![a-z0-9])/i);
  if (!match) return undefined;
  const [, prefix = '', digits = '0', letter = ''] = match;
  return `${prefix.toUpperCase()}-${Number(digits)}${letter.toLowerCase()}`;
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
): {
  links: DocumentationLink[];
  absoluteLinks: DocumentationLink[];
  labels: StanzaLabel[];
} {
  const links: DocumentationLink[] = [];
  const absoluteLinks: DocumentationLink[] = [];
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
          } else if (
            ['link', 'image', 'definition'].includes(node.type) &&
            node.url &&
            /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(node.url)
          ) {
            // Web and site-root links are not resolved, but a link to a
            // record by either still breaks when the record closes.
            absoluteLinks.push({
              file,
              line: node.position?.start.line ?? 1,
              url: node.url,
              target: node.url,
              inTable: table,
              start: node.position?.start.offset ?? 0,
              end: node.position?.end.offset ?? 0,
            });
          }
          for (const child of node.children ?? [])
            visit(child, table, identity);
        }
        visit(tree);
      },
    ],
  });
  return { links, absoluteLinks, labels };
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
const OPEN_STATUS =
  /^(?:open|in progress|blocked|verifying)(?:$|\s+[—–-]\s+.+)/i;
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
    retiredRegisterFiles: [],
    duplicateLedgerIds: [],
    malformedLedgerLines: [],
    unnamedVerifying: [],
    invalidScheduledChecks: [],
    invalidStatus: [],
    longStatus: [],
    scheduledOverdue: [],
    scheduledFarFuture: [],
    missingLiveRows: [],
    missingRowTargets: [],
    brokenLive: [],
    recordLinks: [],
    brokenArchive: [],
    repairableArchive: [],
    oversized: [],
    counts: [],
  };
  const index = files.get(RECORDS.index) ?? '';
  const scan = scanMarkdown(RECORDS.index, index);
  for (const [file, contents] of files) {
    const budget = registerFileBudget(file);
    if (budget !== undefined && Buffer.byteLength(contents, 'utf8') > budget)
      result.oversized.push(file);
    if (isStrayRecordsFile(file)) result.strayRegisterFiles.push(file);
    if (isRetiredRegisterFile(file)) result.retiredRegisterFiles.push(file);
  }

  // The index states the current position in one Now stanza, replaced in
  // place, and carries no changelog under any label.
  const nowLabels = scan.labels.filter((label) => /^now\b/i.test(label.text));
  const now = nowLabels[0];
  const nowText = now ? index.slice(now.start, now.end) : '';
  if (
    nowLabels.length !== 1 ||
    now?.text !== 'Now' ||
    scan.labels.some((label) => HISTORY_LABEL.test(label.text)) ||
    Buffer.byteLength(nowText, 'utf8') > NOW_STANZA_BUDGET_BYTES
  )
    result.invalidNow.push(RECORDS.index);

  const recordId = (file: string) => recordIdentity(path.posix.basename(file));
  const inFolder = (directory: string, pattern: RegExp) =>
    [...files.keys()].filter(
      (file) =>
        path.posix.dirname(file) === directory &&
        pattern.test(path.posix.basename(file)),
    );
  const ledgerIds: string[] = [];
  (files.get(RECORDS.ledger) ?? '').split('\n').forEach((line, index) => {
    if (!LIST_ITEM.test(line)) return;
    const id = line.match(LEDGER_ENTRY)?.[1];
    if (
      line.includes(' · docs/records/') &&
      !WORKING_RECORD_RECEIPT.test(line)
    ) {
      result.malformedLedgerLines.push(`${RECORDS.ledger}:${index + 1}`);
      return;
    }
    if (id) ledgerIds.push(id.toUpperCase());
    else result.malformedLedgerLines.push(`${RECORDS.ledger}:${index + 1}`);
  });
  const ledgerCounts = new Map<string, number>();
  for (const id of ledgerIds) {
    const key = canonicalId(id) ?? id;
    const count = (ledgerCounts.get(key) ?? 0) + 1;
    ledgerCounts.set(key, count);
    const allowed = HISTORICAL_ID_COLLISIONS.has(id) ? 2 : 1;
    if (count > allowed && !result.duplicateLedgerIds.includes(id))
      result.duplicateLedgerIds.push(id);
  }
  const closedIds = new Set(
    ledgerIds.map((id) => canonicalId(id) ?? id.toUpperCase()),
  );
  const idOf = (file: string) => canonicalId(path.posix.basename(file)) ?? file;
  for (const [register, pattern] of Object.entries(REGISTERS)) {
    const archived = inFolder(`docs/_archive/${register}`, pattern);
    for (const record of archived) {
      closedIds.add(idOf(record));
      const status = recordStatus(record, files.get(record) ?? '');
      if (!CLOSED_STATUS.test(status) && !HISTORICAL_DISPOSITION.test(status))
        result.missingArchiveDispositions.push(record);
    }
    result.counts.push({ register, live: 0, archived: archived.length });
  }

  const live = inFolder(RECORDS.directory, RECORDS.pattern);
  const rows = scan.links.filter((link) => link.inTable);
  // A related link in another record's notes is not this record's own row.
  const registered = new Set(
    rows
      .filter(
        (link) => !link.invalidEncoding && link.rowId === recordId(link.target),
      )
      .map((link) => link.target),
  );
  const openIds = new Set<string>();
  for (const record of live) {
    const status = recordStatus(record, files.get(record) ?? '');
    const id = idOf(record);
    if (closedIds.has(id) || openIds.has(id)) result.duplicates.push(record);
    openIds.add(id);
    // An open record carries no closed disposition: closing deletes it.
    if (CLOSED_STATUS.test(status) || HISTORICAL_DISPOSITION.test(status))
      result.closedLive.push(record);
    else if (!OPEN_STATUS.test(status)) result.invalidStatus.push(record);
    if (!registered.has(record)) result.missingLiveRows.push(record);
    if (
      status.length > STATUS_MAX_CHARACTERS ||
      WRAPPED_STATUS.test(files.get(record) ?? '')
    )
      result.longStatus.push(record);
    // A record whose fix shipped but whose check can only happen in
    // production stays live, as Verifying, until that check is done.
    if (VERIFYING_STATUS.test(status) || /\bdue \d/i.test(status)) {
      const dues = [...status.matchAll(DUE_DATE)].map((match) => match[1]);
      const due = dues[0];
      const check = status
        .replace(VERIFYING_STATUS, '')
        .replace(DUE_DATE, '')
        .replace(/^[\s—–-]+|[\s;]+$/g, '');
      if (
        dues.length !== 1 ||
        !due ||
        !isCalendarDate(due) ||
        !/[\p{L}\p{N}]/u.test(check)
      )
        result.invalidScheduledChecks.push(record);
      else if (due < today) result.scheduledOverdue.push({ file: record, due });
      else if (due > addDays(today, VERIFYING_HORIZON_DAYS))
        result.scheduledFarFuture.push({ file: record, due });
      if (
        VERIFYING_STATUS.test(status) &&
        !nowText.toLowerCase().includes(recordId(record) ?? record)
      )
        result.unnamedVerifying.push(record);
    }
  }
  for (const row of rows) {
    if (row.invalidEncoding || !targetExists(row.target))
      result.missingRowTargets.push(`${row.file}:${row.line} -> ${row.target}`);
  }
  result.counts.push({
    register: 'records',
    live: live.length,
    archived: ledgerIds.length,
  });
  result.strayRegisterFiles.sort();
  result.retiredRegisterFiles.sort();
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

// A closed record is deleted, so only the index links records; everywhere else
// a record is cited by its ID, which the ledger resolves. An absolute link
// breaks the same way, unless it pins a commit.
const ABSOLUTE_RECORD_LINK =
  /docs\/records\/(?:bug|debt)-\d+[^/?#]*\.md(?:[?#]|$)/i;
const PINNED_COMMIT = /\/blob\/[0-9a-f]{40}\//i;

export function recordLinks(
  file: string,
  contents: string,
): DocumentationLink[] {
  if (file === RECORDS.index || file.startsWith('docs/_archive/')) return [];
  const { links, absoluteLinks } = scanMarkdown(file, contents);
  return [
    ...links.filter(
      (link) =>
        path.posix.dirname(link.target) === RECORDS.directory &&
        RECORDS.pattern.test(path.posix.basename(link.target)),
    ),
    ...absoluteLinks.filter(
      (link) =>
        ABSOLUTE_RECORD_LINK.test(link.url) && !PINNED_COMMIT.test(link.url),
    ),
  ].sort((a, b) => a.start - b.start);
}

export function auditDocumentation(
  files: ReadonlyMap<string, string>,
  exists: (file: string) => boolean,
): DocumentationAudit {
  const result = auditRecordLifecycle(files, exists);
  for (const [file, contents] of files) {
    result.recordLinks.push(...recordLinks(file, contents));
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

// Files .gitignore excludes, such as local backups of question drafts, are not
// repository documentation. Outside a Git work tree, nothing is excluded: git
// exits 128, and the audit reads every file, which is the stricter choice.
function gitIgnored(root: string, names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const result = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: root,
    input: names.join('\0'),
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\0').filter(Boolean);
}

export function readDocumentationFiles(root: string): Map<string, string> {
  // Repository-authored documentation, not vendored skill packages or build
  // artifacts. Numbered records are direct children of their register folder;
  // indexes, templates, assets, living guides and ADRs are not open records.
  const names = globSync(
    [
      'docs/**/*.md',
      '*.md',
      '.claude/**/*.md',
      '.github/**/*.md',
      'app/**/*.md',
      'components/**/*.md',
      'content/**/*.md',
      'tests/**/*.md',
      'src/**/*.md',
      'lib/**/*.md',
      'db/**/*.md',
      'scripts/**/*.md',
      '.agents/skills/README.md',
    ],
    { cwd: root },
  ).sort();
  for (const file of gitIgnored(root, names))
    names.splice(names.indexOf(file), 1);
  for (const file of [RECORDS.index, RECORDS.ledger]) {
    if (!names.includes(file))
      throw new Error(`Missing documentation records file: ${file}`);
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
    result.retiredRegisterFiles,
    result.duplicateLedgerIds,
    result.malformedLedgerLines,
    result.unnamedVerifying,
    result.invalidScheduledChecks,
    result.invalidStatus,
    result.longStatus,
    result.missingLiveRows,
    result.missingRowTargets,
    result.brokenLive,
    result.recordLinks,
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
