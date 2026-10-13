import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type RecordPrefix = 'bug' | 'debt';

// The next ID is one past the highest used anywhere: open records and the
// ledger of closed ones, which lists every ID the deleted archive held. It is
// computed, not kept as a line in the index, because two branches bumping
// that line merge cleanly into a duplicate. Two branches can still take the
// same ID; the documentation guard then fails the second to merge, which
// renumbers.
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
  const folder = 'docs/records';
  const files = existsSync(path.join(root, folder))
    ? readdirSync(path.join(root, folder)).map((name) => `${folder}/${name}`)
    : [];
  const ledger = path.join(root, 'docs/records/closed.md');
  // Without the ledger this is not the repository root, and a guess would
  // reuse a closed ID.
  if (!existsSync(ledger))
    throw new Error(`Missing docs/records/closed.md under ${root}`);
  return nextRecordId(prefix, files, readFileSync(ledger, 'utf8'));
}

export function runNextRecordIdCommand(
  args: readonly string[],
  root: string,
  output: Pick<Console, 'log' | 'error'>,
): number {
  const prefix = args[0];
  if (prefix !== 'bug' && prefix !== 'debt') {
    output.error('Usage: tsx scripts/next-record-id.ts bug|debt');
    return 2;
  }
  try {
    output.log(repositoryNextRecordId(prefix, root));
    return 0;
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = runNextRecordIdCommand(
    process.argv.slice(2),
    process.cwd(),
    console,
  );
}
