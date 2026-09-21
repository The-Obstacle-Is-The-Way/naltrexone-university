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
        function visit(node: MarkdownNode, inTable = false): void {
          const table = inTable || node.type === 'table';
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
              start,
              end,
            });
          }
          for (const child of node.children ?? []) visit(child, table);
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
  if (/^(?:active|open|in progress|draft|partial|blocked)\b/i.test(status))
    return false;
  return /\b(?:resolved|archived|implemented|closed|complete)\b/i.test(status);
}

export function auditDocumentation(
  files: ReadonlyMap<string, string>,
  exists: (file: string) => boolean,
): DocumentationAudit {
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
    [...files].map(([file, contents]) => [
      file,
      documentationLinks(file, contents),
    ]),
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
    const rows = (links.get(`${liveDirectory}/index.md`) ?? []).filter(
      (link) => link.inTable,
    );
    const registered = new Set(rows.map((link) => link.target));
    for (const record of live) {
      if (archived.includes(record.replace('docs/', 'docs/_archive/')))
        result.duplicates.push(record);
      if (hasClosedStatus(files.get(record) ?? ''))
        result.closedLive.push(record);
      if (!registered.has(record)) result.missingLiveRows.push(record);
    }
    for (const row of rows) {
      if (!exists(row.target))
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
  for (const fileLinks of links.values()) {
    for (const link of fileLinks) {
      if (exists(link.target)) continue;
      const list = link.file.startsWith('docs/_archive/')
        ? result.brokenArchive
        : result.brokenLive;
      list.push(link);
    }
  }
  return result;
}

export function readDocumentation(root: string): DocumentationAudit {
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
  const files = new Map(
    names.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
  );
  return auditDocumentation(files, (file) =>
    existsSync(path.resolve(root, file)),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = readDocumentation(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = [
    result.duplicates,
    result.closedLive,
    result.missingLiveRows,
    result.missingRowTargets,
    result.brokenLive,
  ].some((issues) => issues.length > 0)
    ? 1
    : 0;
}
