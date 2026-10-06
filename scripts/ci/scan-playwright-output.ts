// BUG-328: CI uploads Playwright's failure output only after this scan passes
// it. The upload may publish only what the scan has read in full: regular,
// UTF-8 text files of the types Playwright writes there. Anything else (a zip,
// an HTML report, an image, a symbolic link) is refused rather than decoded,
// because a scanner that tries to decode every format eventually misses one.
// It prints counts and file paths only, never a matched value.
import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type ClerkCredentialCounts,
  countClerkCredentials,
} from '@/tests/shared/clerk-credential-shapes';

const TEXT_TYPES = new Set(['.json', '.log', '.md', '.txt']);

// actions/upload-artifact leaves out hidden files and directories unless
// include-hidden-files is set, and our uploads exclude every trace.zip.
function uploaded(relative: string): boolean {
  return (
    !relative.split(path.sep).some((part) => part.startsWith('.')) &&
    path.basename(relative) !== 'trace.zip'
  );
}

type Entry = { file: string; refusal?: string; text?: string };

function read(root: string, file: string, isRegularFile: boolean): Entry {
  if (!isRegularFile) return { file, refusal: 'not a regular file' };
  if (!TEXT_TYPES.has(path.extname(file).toLowerCase())) {
    return { file, refusal: 'not a text type the scan reads' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      readFileSync(path.join(root, file)),
    );
    if (text.includes('\u0000')) return { file, refusal: 'not UTF-8 text' };
    return { file, text };
  } catch {
    return { file, refusal: 'not UTF-8 text' };
  }
}

function entries(root: string, dir: string): Entry[] {
  let found: Dirent[];
  try {
    found = readdirSync(path.join(root, dir), {
      recursive: true,
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return found
    .filter((entry) => !entry.isDirectory())
    .map((entry) => ({
      entry,
      file: path.relative(root, path.join(entry.parentPath, entry.name)),
    }))
    .filter(({ file }) => uploaded(path.relative(dir, file)))
    .map(({ entry, file }) => read(root, file, entry.isFile()))
    .sort((a, b) => a.file.localeCompare(b.file));
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
  const scanned = dirs.flatMap((dir) => entries(root, dir));
  if (scanned.length === 0) {
    output.log('no Playwright output to scan');
    return 0;
  }
  const total: ClerkCredentialCounts = {
    parameter: 0,
    devBrowserToken: 0,
    jsonWebToken: 0,
  };
  for (const { file, refusal, text } of scanned) {
    if (refusal) output.error(`refused ${file}: ${refusal}`);
    if (text === undefined) continue;
    const counts = countClerkCredentials(text);
    for (const name of Object.keys(total) as (keyof ClerkCredentialCounts)[])
      total[name] += counts[name];
  }
  const counts = Object.entries(total)
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
  const summary = `Playwright output: ${scanned.length} files; ${counts}`;
  const failed =
    scanned.some((entry) => entry.refusal) ||
    Object.values(total).some((count) => count > 0);
  (failed ? output.error : output.log)(summary);
  return failed ? 1 : 0;
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath)
  process.exitCode = runFromCommandLine(process.argv.slice(2));
