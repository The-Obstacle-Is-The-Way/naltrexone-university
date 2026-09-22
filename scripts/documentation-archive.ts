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
  inTable: boolean;
  rowId?: string;
  start: number;
  end: number;
};

export type DocumentationAudit = {
  duplicates: string[];
  closedLive: string[];
  missingLiveRows: string[];
  missingRowTargets: string[];
  brokenLive: DocumentationLink[];
  brokenArchive: DocumentationLink[];
  repairableArchive: ArchiveLinkRepair[];
  counts: { register: string; live: number; archived: number }[];
};

type ArchiveLinkRepair = DocumentationLink & {
  replacementTarget: string;
  replacementUrl: string;
  kind: 'depth' | 'later-archive';
};

export function archiveLinkRepairs(
  links: DocumentationLink[],
  exists: (file: string) => boolean,
): ArchiveLinkRepair[] {
  return links.flatMap((link) => {
    if (!link.file.startsWith('docs/_archive/')) return [];
    const originalFile = link.file.replace('docs/_archive/', 'docs/');
    const originalTarget = path.posix.normalize(
      path.posix.join(
        path.posix.dirname(originalFile),
        decodeURIComponent(link.url.split(/[?#]/)[0] ?? ''),
      ),
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
  const links: DocumentationLink[] = [];
  // Use the installed first-party application Markdown seam, including GFM
  // tables. Code examples are not links; definitions cover reference links.
  Markdown({
    children: contents,
    remarkPlugins: [
      remarkGfm,
      () => (tree: MarkdownNode) => {
        function visit(
          node: MarkdownNode,
          inTable = false,
          rowId?: string,
        ): void {
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
            const destination = decodeURIComponent(
              node.url.split(/[?#]/)[0] ?? '',
            );
            links.push({
              file,
              line: node.position?.start.line ?? 1,
              url: node.url,
              target: path.posix.normalize(
                path.posix.join(path.posix.dirname(file), destination),
              ),
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
  return links;
}

function hasClosedStatus(contents: string): boolean {
  const status = contents
    .match(/^\s*(?:>\s*)?\*\*Status:\*\*\s*(.+)$/m)?.[1]
    ?.replaceAll('**', '')
    .trim();
  if (!status) return false;
  // Current status precedes its historical explanation. In particular, an
  // Active record may correctly explain which earlier slices are resolved.
  return /^(?:resolved|archived|implemented|closed|complete)\b/i.test(status);
}

export function auditRecordLifecycle(
  files: ReadonlyMap<string, string>,
  exists: (file: string) => boolean,
): DocumentationAudit {
  const targetExists = (file: string) =>
    file !== '..' && !file.startsWith('../') && exists(file);
  const result: DocumentationAudit = {
    duplicates: [],
    closedLive: [],
    missingLiveRows: [],
    missingRowTargets: [],
    brokenLive: [],
    brokenArchive: [],
    repairableArchive: [],
    counts: [],
  };
  const links = new Map(
    Object.keys(REGISTERS).map((register) => {
      const file = `docs/${register}/index.md`;
      return [file, documentationLinks(file, files.get(file) ?? '')];
    }),
  );

  for (const [register, pattern] of Object.entries(REGISTERS)) {
    const liveDirectory = `docs/${register}`;
    const archiveDirectory = `docs/_archive/${register}`;
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
    const rows = (links.get(`${liveDirectory}/index.md`) ?? []).filter(
      (link) => link.inTable,
    );
    // A related link in another record's notes is not this record's own row.
    const registered = new Set(
      rows
        .filter((link) => link.rowId === recordId(link.target))
        .map((link) => link.target),
    );
    for (const record of live) {
      if (archivedIds.has(recordId(record))) result.duplicates.push(record);
      if (hasClosedStatus(files.get(record) ?? ''))
        result.closedLive.push(record);
      if (!registered.has(record)) result.missingLiveRows.push(record);
    }
    for (const row of rows) {
      if (!targetExists(row.target))
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
  return result;
}

export function brokenDocumentationLinks(
  file: string,
  contents: string,
  exists: (file: string) => boolean,
): DocumentationLink[] {
  return documentationLinks(file, contents).filter(
    (link) =>
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
    result.missingLiveRows,
    result.missingRowTargets,
    result.brokenLive,
    result.repairableArchive,
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
