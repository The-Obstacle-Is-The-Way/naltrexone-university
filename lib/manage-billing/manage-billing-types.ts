import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { Logger } from '@/src/application/ports/logger';

export type RedirectFn = (url: string) => never;

export type CreatePortalSessionInput = {
  idempotencyKey?: string;
};

export type CreatePortalSessionFn = (
  input: CreatePortalSessionInput,
) => Promise<ActionResult<{ url: string }>>;

export type ManageBillingLogger = Pick<Logger, 'error'>;

export type ManageBillingRedirects = {
  failure: string;
  unauthenticated?: string;
};
