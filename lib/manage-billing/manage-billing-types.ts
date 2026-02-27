import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { Logger } from '@/src/application/ports/logger';

export type RedirectFn = (url: string) => never;

export type CreatePortalSessionFn = (
  input: Record<string, never>,
) => Promise<ActionResult<{ url: string }>>;

export type ManageBillingLogger = Pick<Logger, 'error'>;

export type ManageBillingRedirects = {
  failure: string;
  unauthenticated?: string;
};
