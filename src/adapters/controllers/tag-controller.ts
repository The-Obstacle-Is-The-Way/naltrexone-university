'use server';

import { z } from 'zod';
import { createDepsResolver } from '@/lib/controller-helpers';
import type { Logger } from '@/src/adapters/shared/logger';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { TagRepository } from '@/src/application/ports/repositories';
import type { ActionResult } from './action-result';
import { handleError, ok } from './action-result';
import type { CheckEntitlementUseCase } from './require-entitled-user-id';
import { requireEntitledUserId } from './require-entitled-user-id';

const GetTagsInputSchema = z.object({}).strict();

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
