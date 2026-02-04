'use server';

import { z } from 'zod';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type { TagRepository } from '@/src/application/ports/repositories';
import { createAction } from './create-action';
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
  logger: Logger;
};

type TagControllerContainer = {
  createTagControllerDeps: () => TagControllerDeps;
};

const getDeps = createDepsResolver<TagControllerDeps, TagControllerContainer>(
  (container) => container.createTagControllerDeps(),
  loadAppContainer,
);

export const getTags = createAction({
  schema: GetTagsInputSchema,
  getDeps,
  execute: async (_input, d) => {
    await requireEntitledUserId(d);

    const tags = await d.tagRepository.listAll();
    return {
      rows: tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name,
        kind: tag.kind,
      })),
    };
  },
});
