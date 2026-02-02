'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
import type { Logger } from '@/src/adapters/shared/logger';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { TagRepository } from '@/src/application/ports/repositories';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import type { ActionResult } from './action-result';
import { err, handleError, ok } from './action-result';

const GetTagsInputSchema = z.object({}).strict();

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type TagRow = {
  id: string;
  slug: string;
  name: string;
  kind: 'domain' | 'topic' | 'substance' | 'treatment' | 'diagnosis';
};

export type GetTagsOutput = {
  rows: TagRow[];
};

export type TagControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  tagRepository: TagRepository;
  logger?: Logger;
};

const getDeps = createDepsResolver((container) =>
  container.createTagControllerDeps(),
);

async function requireEntitledUserId(
  deps: TagControllerDeps,
): Promise<string | ActionResult<never>> {
  const user = await deps.authGateway.requireUser();
  const entitlement = await deps.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  if (!entitlement.isEntitled) {
    return err('UNSUBSCRIBED', 'Subscription required');
  }

  return user.id;
}

export async function getTags(
  input: unknown,
  deps?: TagControllerDeps,
): Promise<ActionResult<GetTagsOutput>> {
  const parsed = GetTagsInputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps);
    const userIdOrError = await requireEntitledUserId(d);
    if (typeof userIdOrError !== 'string') return userIdOrError;

    const tags = await d.tagRepository.listAll();
    return ok({
      rows: tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name,
        kind: tag.kind,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
