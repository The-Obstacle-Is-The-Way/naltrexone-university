// BUG-328: Playwright's HTML report embeds its data as a zip inside
// index.html, and that data carried Clerk development tokens a plain-text scan
// could not see. CI runs this on the directories it uploads, before the
// upload, and fails the job on any token shape, printing counts only. It reads
// every file the upload publishes, opening zips and embedded reports, and
// fails closed on data it cannot read, so a format change cannot make it blind.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

// What the CI uploads exclude.
const NOT_UPLOADED = (relative: string) =>
  relative.split(path.sep).includes('.auth') ||
  path.basename(relative) === 'trace.zip';
const REPORT_MARKER = 'id="playwrightReportBase64"';
const EMBEDDED =
  /id="playwrightReportBase64">data:application\/zip;base64,([A-Za-z0-9+/=]+)/;
const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY = 0x02014b50;
const SIZES_FOLLOW_DATA = 0x08;
const SHAPES = {
  clerkDbJwt: /__clerk_db_jwt=/g,
  devBrowserToken: /dvb_[A-Za-z0-9]/g,
  clerkTestingToken: /__clerk_testing_token=/g,
} as const;

type Found = Record<keyof typeof SHAPES, number>;

export type Scan = { entries: number; found: Found };

function unreadable(label: string): Error {
  return new Error(`Playwright output: ${label} cannot be read by the scan`);
}

// Walks the zip's local file headers, inflating deflated entries. It must
// reach the central directory or the end, so no entry goes unread.
function zipEntries(zip: Buffer, label: string): string[] {
  const texts: string[] = [];
  let offset = 0;
  while (
    offset + 30 <= zip.length &&
    zip.readUInt32LE(offset) === LOCAL_FILE_HEADER
  ) {
    if (zip.readUInt16LE(offset + 6) & SIZES_FOLLOW_DATA)
      throw unreadable(label);
    const method = zip.readUInt16LE(offset + 8);
    const size = zip.readUInt32LE(offset + 18);
    const start =
      offset +
      30 +
      zip.readUInt16LE(offset + 26) +
      zip.readUInt16LE(offset + 28);
    const data = zip.subarray(start, start + size);
    texts.push((method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    offset = start + size;
  }
  const atEnd =
    offset === zip.length ||
    (offset + 4 <= zip.length &&
      zip.readUInt32LE(offset) === CENTRAL_DIRECTORY);
  if (!atEnd || texts.length === 0) throw unreadable(label);
  return texts;
}

function scanTexts(texts: string[], entries: number): Scan {
  const text = texts.join('\n');
  const found = Object.fromEntries(
    Object.entries(SHAPES).map(([name, shape]) => [
      name,
      (text.match(shape) ?? []).length,
    ]),
  ) as Found;
  return { entries, found };
}

export function scanPlaywrightReport(html: string): Scan {
  const embedded = EMBEDDED.exec(html);
  if (!embedded?.[1]) {
    throw new Error(
      'Playwright output: embedded report data not found; the scan cannot see the report',
    );
  }
  const entries = zipEntries(
    Buffer.from(embedded[1], 'base64'),
    'the embedded report data',
  );
  return scanTexts([html.replace(embedded[0], ''), ...entries], entries.length);
}

function scanFile(root: string, relative: string): Scan {
  const content = readFileSync(path.join(root, relative));
  if (content.includes(REPORT_MARKER))
    return scanPlaywrightReport(content.toString('utf8'));
  if (relative.endsWith('.zip')) {
    const entries = zipEntries(content, relative);
    return scanTexts(entries, entries.length);
  }
  return scanTexts([content.toString('utf8')], 0);
}

function uploadedFiles(root: string, dirs: string[]): string[] {
  return dirs
    .filter((dir) => existsSync(path.join(root, dir)))
    .flatMap((dir) =>
      readdirSync(path.join(root, dir), {
        recursive: true,
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path.relative(root, path.join(entry.parentPath, entry.name)),
        ),
    )
    .filter((relative) => !NOT_UPLOADED(relative))
    .sort();
}

export function runFromCommandLine(
  dirs: string[],
  root = process.cwd(),
  output: Pick<Console, 'log' | 'error'> = console,
): number {
  if (dirs.length === 0) {
    output.error('usage: scan-playwright-output.ts <directory>...');
    return 2;
  }
  const files = uploadedFiles(root, dirs);
  if (files.length === 0) {
    output.log('no Playwright output to scan');
    return 0;
  }
  const total: Scan = {
    entries: 0,
    found: { clerkDbJwt: 0, devBrowserToken: 0, clerkTestingToken: 0 },
  };
  for (const file of files) {
    const scan = scanFile(root, file);
    total.entries += scan.entries;
    for (const name of Object.keys(scan.found) as (keyof Found)[])
      total.found[name] += scan.found[name];
  }
  const counts = Object.entries(total.found)
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
  const line = `Playwright output: ${files.length} files, ${total.entries} zip entries; ${counts}`;
  if (Object.values(total.found).some((count) => count > 0)) {
    output.error(`${line}. Refusing to upload output that carries tokens.`);
    return 1;
  }
  output.log(line);
  return 0;
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath)
  process.exitCode = runFromCommandLine(process.argv.slice(2));
