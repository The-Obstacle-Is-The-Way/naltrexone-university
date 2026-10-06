import { cache } from 'react';
import type { createContainer } from '@/lib/container';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

export type AppContainer = ReturnType<typeof createContainer>;

export type LoadContainerFn<TContainer> = () => Promise<TContainer>;

const loadDefaultAppContainer = cache(async (): Promise<AppContainer> => {
  const [
    { createContainer },
    { db },
    { createRequestCachedQuestionRepository, createRequestCachedTagRepository },
    { DrizzleQuestionRepository, DrizzleTagRepository },
  ] = await Promise.all([
    import('@/lib/container'),
    import('@/lib/db'),
    import('@/lib/cached-reads'),
    import('@/src/adapters/repositories'),
  ]);
  const questionRepository = createRequestCachedQuestionRepository(
    new DrizzleQuestionRepository(db),
  );
  const tagRepository = createRequestCachedTagRepository(
    new DrizzleTagRepository(db),
  );

  return createContainer({
    repositories: {
      createQuestionRepository: (dbOverride: DrizzleDb = db) =>
        dbOverride === db
          ? questionRepository
          : new DrizzleQuestionRepository(dbOverride),
      createTagRepository: (dbOverride: DrizzleDb = db) =>
        dbOverride === db
          ? tagRepository
          : new DrizzleTagRepository(dbOverride),
    },
  });
});

export async function loadAppContainer(): Promise<AppContainer> {
  return loadDefaultAppContainer();
}

export function createDepsResolver<TDeps, TContainer>(
  resolveFromContainer: (container: TContainer) => TDeps,
  loadContainer: LoadContainerFn<TContainer>,
) {
  return async function getDeps(
    deps?: TDeps,
    options?: { loadContainer?: LoadContainerFn<TContainer> },
  ): Promise<TDeps> {
    if (deps) return deps;

    const container = await (options?.loadContainer ?? loadContainer)();
    return resolveFromContainer(container);
  };
}
