import { readFileSync } from 'node:fs';

/**
 * Next.js salts each server action's ID per build, and the build that
 * `pnpm start` serves names it here, so an ID in a CI log stays traceable.
 */
const SERVER_ACTION_MANIFEST_PATH =
  '.next/server/server-reference-manifest.json';

type ServerActionManifest = {
  node?: Record<string, { exportedName?: string }>;
};

export function readServerActionNames(
  manifestPath = SERVER_ACTION_MANIFEST_PATH,
): ReadonlyMap<string, string> {
  let text: string;
  try {
    text = readFileSync(manifestPath, 'utf8');
  } catch {
    // Diagnostics only: without a build, a failure names the raw action ID.
    return new Map();
  }
  const manifest = JSON.parse(text) as ServerActionManifest;
  const names = new Map<string, string>();
  for (const [id, entry] of Object.entries(manifest.node ?? {}))
    if (entry.exportedName) names.set(id, entry.exportedName);
  return names;
}
