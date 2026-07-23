'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import type { CheckEntitlementUseCase } from '@/src/adapters/controllers/require-entitled-user-id';
import { requireEntitledUserId } from '@/src/adapters/controllers/require-entitled-user-id';
import {
  projectSafeSpanAttributes,
  SERVER_SPAN_FAMILIES,
} from '@/src/adapters/shared/server-tracing';
import { isApplicationError } from '@/src/application/errors';
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
  execute: async (_input, d, meta) => {
    const userId = await requireEntitledUserId(d, meta);
    const family = SERVER_SPAN_FAMILIES.getUserStats;
    return Sentry.startSpan(
      {
        name: family.name,
        op: family.op,
        attributes: projectSafeSpanAttributes({
          'app.action': family.action,
        }),
      },
      async (span) => {
        try {
          const output = await d.getUserStatsUseCase.execute({ userId });
          span.setAttributes(
            projectSafeSpanAttributes({
              'app.count': output.totalAnswered,
            }),
          );
          return output;
        } catch (error) {
          if (isApplicationError(error)) {
            span.setAttributes(
              projectSafeSpanAttributes({
                'app.error_code': error.code,
              }),
            );
          }
          throw error;
        }
      },
    );
  },
});
