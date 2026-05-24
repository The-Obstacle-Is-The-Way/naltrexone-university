import type { ZodType } from 'zod';
import type { LoadContainerFn } from '@/lib/controller-helpers';
import type { Logger } from '@/src/application/ports/logger';
import type { ActionResult } from './action-result';
import { handleError, ok } from './action-result';

export type ActionOptions<TContainer> = {
  loadContainer?: LoadContainerFn<TContainer>;
  logger?: Logger;
};

export type DepsResolutionSource =
  | 'injected'
  | 'default_container'
  | 'custom_container';

export type ActionExecutionMeta = {
  depsSource: DepsResolutionSource;
};

export type GetDepsFn<TDeps, TContainer> = (
  deps?: TDeps,
  options?: ActionOptions<TContainer>,
) => Promise<TDeps>;

export function createAction<
  TInput,
  TOutput,
  TDeps,
  TContainer = unknown,
>(config: {
  schema: ZodType<TInput, unknown>;
  getDeps: GetDepsFn<TDeps, TContainer>;
  execute: (
    input: TInput,
    deps: TDeps,
    meta: ActionExecutionMeta,
  ) => Promise<TOutput>;
}): (
  input: unknown,
  deps?: TDeps,
  options?: ActionOptions<TContainer>,
) => Promise<ActionResult<TOutput>> {
  return async (input, deps, options) => {
    const parsed = config.schema.safeParse(input);
    if (!parsed.success) {
      return handleError(
        parsed.error,
        options?.logger ? { logger: options.logger } : undefined,
      );
    }

    try {
      const d = await config.getDeps(deps, options);
      const depsSource: DepsResolutionSource = deps
        ? 'injected'
        : options?.loadContainer
          ? 'custom_container'
          : 'default_container';
      const output = await config.execute(parsed.data, d, {
        depsSource,
      });
      return ok(output);
    } catch (error) {
      return handleError(
        error,
        options?.logger ? { logger: options.logger } : undefined,
      );
    }
  };
}
