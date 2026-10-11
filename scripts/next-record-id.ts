import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type RecordPrefix = 'bug' | 'debt';

// The next ID is one past the highest used anywhere: open records, the ledger
// of closed ones, and the archive until it is deleted. It is computed, not kept
// as a line in the index, because two branches bumping that line merge cleanly
// into a duplicate. Two branches can still take the same ID; the
// documentation guard then fails the second to merge, which renumbers.
export function nextRecordId(
  prefix: RecordPrefix,
  files: Iterable<string>,
  ledger: string,
): string {
  let highest = 0;
  const own = new RegExp(`^${prefix}-(\\d+)`, 'i');
  for (const file of files) {
    highest = Math.max(
      highest,
      Number(path.posix.basename(file).match(own)?.[1] ?? 0),
    );
  }
  for (const entry of ledger.matchAll(
    new RegExp(`^- ${prefix}-(\\d+)`, 'gim'),
  )) {
    highest = Math.max(highest, Number(entry[1]));
  }
  return `${prefix.toUpperCase()}-${String(highest + 1).padStart(3, '0')}`;
}

export function repositoryNextRecordId(
  prefix: RecordPrefix,
  root = process.cwd(),
): string {
  const folders = [
    'docs/records',
    prefix === 'bug' ? 'docs/_archive/bugs' : 'docs/_archive/debt',
  ];
  const files = folders.flatMap((folder) =>
    existsSync(path.join(root, folder))
      ? readdirSync(path.join(root, folder)).map((name) => `${folder}/${name}`)
      : [],
  );
  const ledger = path.join(root, 'docs/records/closed.md');
  // Without the ledger this is not the repository root, and a guess would
  // reuse a closed ID.
  if (!existsSync(ledger))
    throw new Error(`Missing docs/records/closed.md under ${root}`);
  return nextRecordId(prefix, files, readFileSync(ledger, 'utf8'));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const prefix = process.argv[2];
  if (prefix !== 'bug' && prefix !== 'debt') {
    console.error('Usage: tsx scripts/next-record-id.ts bug|debt');
    process.exitCode = 2;
  } else {
    console.log(repositoryNextRecordId(prefix));
  }
}
