import { stringify } from 'yaml';
import type { LockfileText } from './lockfile-union';

// Dependency name -> the value pnpm writes for it in a snapshot entry.
export type SnapshotDependencies = Record<string, string>;

// Builds a pnpm 9 lockfile: one root importer, a packages entry for every
// snapshot entry, and the snapshot entries themselves.
export function lockfile(
  label: string,
  spec: {
    importer?: Record<string, string>;
    snapshots: Record<string, SnapshotDependencies>;
  },
): LockfileText {
  const packages = Object.fromEntries(
    Object.keys(spec.snapshots).map((key) => [
      key.replace(/\(.*$/, ''),
      { resolution: { integrity: 'sha512-fixture' } },
    ]),
  );
  const snapshots = Object.fromEntries(
    Object.entries(spec.snapshots).map(([key, dependencies]) => [
      key,
      Object.keys(dependencies).length > 0 ? { dependencies } : {},
    ]),
  );
  const dependencies = Object.fromEntries(
    Object.entries(spec.importer ?? {}).map(([name, version]) => [
      name,
      { specifier: version.replace(/\(.*$/, ''), version },
    ]),
  );
  return {
    label,
    text: stringify({
      lockfileVersion: '9.0',
      importers: { '.': { dependencies } },
      packages,
      snapshots,
    }),
  };
}
