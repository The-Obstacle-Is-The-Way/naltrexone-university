'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import type { CheckEntitlementUseCase } from '@/src/adapters/controllers/require-entitled-user-id';
import { requireEntitledUserId } from '@/src/adapters/controllers/require-entitled-user-id';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  GetUserStatsInput,
  UserStatsOutput,
} from '@/src/application/use-cases';
import { createAction } from './create-action';

const GetUserStatsInputSchema = z.object({}).strict();

export type { UserStatsOutput } from '@/src/application/use-cases';

export type StatsControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getUserStatsUseCase: {
    execute: (input: GetUserStatsInput) => Promise<UserStatsOutput>;
  };
};

type StatsControllerContainer = {
  createStatsControllerDeps: () => StatsControllerDeps;
};

const getDeps = createDepsResolver<
  StatsControllerDeps,
  StatsControllerContainer
>((container) => container.createStatsControllerDeps(), loadAppContainer);

export const getUserStats = createAction({
  schema: GetUserStatsInputSchema,
  getDeps,
  execute: async (_input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getUserStatsUseCase.execute({ userId });
  },
});
