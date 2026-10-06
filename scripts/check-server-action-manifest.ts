// BUG-324: a client chooses every argument of a server action it calls, so
// every action takes only its input. Next writes each action's declared
// arguments into the first byte of its ID, so this reads the built manifest
// and fails the build when an action declares more. It runs after next build
// (package.json), which covers CI, the local gate and every Vercel deploy.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST = '.next/server/server-reference-manifest.json';
const ID = /^[0-9a-f]{42}$/;
// next/dist/shared/lib/server-reference-info.js: bit 7 marks 'use cache',
// bits 6 to 1 mark the first six arguments as used, bit 0 marks a rest
// parameter. An action that takes only its input sets at most bit 6. A client
// can call a 'use cache' function by its ID too, so the rule covers both.
const BEYOND_FIRST_ARGUMENT = 0x3f;

type ManifestEntry = { exportedName?: unknown; filename?: unknown };

function entries(manifest: unknown): [string, ManifestEntry][] {
  if (typeof manifest !== 'object' || manifest === null) return [];
  return ['node', 'edge'].flatMap((runtime) => {
    const actions = (manifest as Record<string, unknown>)[runtime];
    return typeof actions === 'object' && actions !== null
      ? Object.entries(actions as Record<string, ManifestEntry>)
      : [];
  });
}

export function serverActionManifestIssues(manifest: unknown): string[] {
  const found = entries(manifest);
  if (found.length === 0)
    return [
      'the manifest lists no server actions; check that Next has not changed its format',
    ];
  return found.flatMap(([id, { exportedName, filename }]) => {
    const name = `${String(filename)} ${String(exportedName)}`;
    if (!ID.test(id)) return [`${name} has an unreadable action ID`];
    const infoByte = Number.parseInt(id.slice(0, 2), 16);
    if (!(infoByte & BEYOND_FIRST_ARGUMENT)) return [];
    return [
      `${name} declares more than its input (info byte ${id.slice(0, 2)})`,
    ];
  });
}

export function runFromCommandLine(
  root = process.cwd(),
  output: Pick<Console, 'log' | 'error'> = console,
): number {
  const file = path.join(root, MANIFEST);
  if (!existsSync(file)) {
    output.error(`no ${MANIFEST}: run next build first`);
    return 1;
  }
  const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const issues = serverActionManifestIssues(manifest);
  for (const issue of issues) output.error(issue);
  if (issues.length === 0)
    output.log(
      `server actions: ${entries(manifest).length}, all take only their input`,
    );
  return issues.length === 0 ? 0 : 1;
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) process.exitCode = runFromCommandLine();
