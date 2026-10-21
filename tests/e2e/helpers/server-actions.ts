import { readFileSync } from 'node:fs';

/**
 * Next.js salts each server action's ID per build, and the build that
 * `pnpm start` serves names it here, so an ID in a CI log stays traceable.
 */
const SERVER_ACTION_MANIFEST_PATH =
  '.next/server/server-reference-manifest.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Diagnostics only, and read before startSession's own error handling: a
 * missing or malformed manifest yields no names, so a failure names the raw
 * action ID instead of breaking the session start.
 */
export function readServerActionNames(
  manifestPath = SERVER_ACTION_MANIFEST_PATH,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    // No build, or an unreadable manifest: name nothing.
    return names;
  }
  const node = isRecord(manifest) ? manifest.node : undefined;
  if (!isRecord(node)) return names;
  for (const [id, entry] of Object.entries(node)) {
    const name = isRecord(entry) ? entry.exportedName : undefined;
    if (typeof name === 'string' && name.length > 0) names.set(id, name);
  }
  return names;
}
