import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import {
  assertForwardMainCommit,
  type ContentSource,
  type ReleaseDispositions,
  readContentCommit,
} from './content-source';
import { activateRelease, lockReleasePointer } from './release-activation';
import { stageReleaseFromFiles } from './release-builder';
import {
  parseReleaseManifest,
  SOURCE_MANIFEST_FORMAT,
} from './release-manifest';

type Db = PostgresJsDatabase<typeof schema>;
async function admitSource(tx: Db, source: ContentSource): Promise<void> {
  const [pointer] = await tx
    .select({ commit: schema.contentReleasePointer.sourceCommit })
    .from(schema.contentReleasePointer);
  if (!pointer) throw new Error('The content release pointer is missing');
  await assertForwardMainCommit(
    source.repository,
    source.commit,
    pointer.commit,
  );
}
async function advanceSource(tx: Db, commit: string): Promise<void> {
  await tx.update(schema.contentReleasePointer).set({ sourceCommit: commit });
}

// These wrappers are the ordinary command entry points. Bootstrap adopts the
// live bank through its existing path; holds reapply only an active release.
export async function stageReleaseFromCommit(
  db: Db,
  source: ContentSource,
  options: {
    remove?: readonly string[];
    revert?: readonly string[];
  } & ReleaseDispositions = {},
) {
  const files = await readContentCommit(source, options);
  return db.transaction(async (tx) => {
    await lockReleasePointer(tx);
    await admitSource(tx, source);
    const staged = await stageReleaseFromFiles(tx, files, {
      ...options,
      corpusCommit: source.commit,
    });
    await advanceSource(tx, source.commit);
    return staged;
  });
}

export async function activateReleaseFromSource(
  db: Db,
  input: Parameters<typeof activateRelease>[1] & {
    repository?: string | undefined;
  },
) {
  return db.transaction(async (tx) => {
    await lockReleasePointer(tx);
    const [earlier] = await tx
      .select({ id: schema.contentReleaseActivations.id })
      .from(schema.contentReleaseActivations)
      .where(eq(schema.contentReleaseActivations.releaseId, input.releaseId))
      .limit(1);
    let source: ContentSource | undefined;
    if (earlier === undefined) {
      const [release] = await tx
        .select({ manifest: schema.contentReleases.manifest })
        .from(schema.contentReleases)
        .where(eq(schema.contentReleases.id, input.releaseId));
      if (!release) throw new Error('Release does not exist');
      const manifest = parseReleaseManifest(release.manifest);
      if (manifest.format !== SOURCE_MANIFEST_FORMAT)
        throw new Error(
          'An unactivated release needs a source commit; stage it from main',
        );
      if (!input.repository)
        throw new Error('--repo is required to verify a new release source');
      source = { repository: input.repository, commit: manifest.corpusCommit };
      await admitSource(tx, source);
    }
    const summary = await activateRelease(tx, input);
    if (source) await advanceSource(tx, source.commit);
    return summary;
  });
}
