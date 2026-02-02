import type { createContainer } from '@/lib/container';

type Container = ReturnType<typeof createContainer>;

export function createDepsResolver<TDeps>(
  resolveFromContainer: (container: Container) => TDeps,
) {
  return async function getDeps(deps?: TDeps): Promise<TDeps> {
    if (deps) return deps;

    const { createContainer } = await import('@/lib/container');
    return resolveFromContainer(createContainer());
  };
}
