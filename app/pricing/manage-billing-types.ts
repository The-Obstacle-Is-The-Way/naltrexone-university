import type { ActionResult } from '@/src/adapters/controllers/action-result';

export type RedirectFn = (url: string) => never;

export type CreatePortalSessionFn = (
  input: Record<string, never>,
) => Promise<ActionResult<{ url: string }>>;
