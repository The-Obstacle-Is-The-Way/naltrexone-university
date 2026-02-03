import type { createContainer } from '@/lib/container';

export type AppContainer = ReturnType<typeof createContainer>;

export type LoadContainerFn<TContainer> = () => Promise<TContainer>;

export async function loadAppContainer(): Promise<AppContainer> {
  const { createContainer } = await import('@/lib/container');
  return createContainer();
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
