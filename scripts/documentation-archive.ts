import { existsSync, globSync, readFileSync } from 'node:fs';
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
  counts: { register: string; live: number; archived: number }[];
};

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
  return result;
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
  report: (result: DocumentationAudit) => void,
): number {
  const result = readDocumentation(root);
  report(result);
  return [
    result.duplicates,
    result.closedLive,
    result.missingLiveRows,
    result.missingRowTargets,
    result.brokenLive,
  ].some((issues) => issues.length > 0)
    ? 1
    : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = runDocumentationCommand(process.cwd(), (result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
