import 'server-only';
import { db } from './db';
import { env } from './env';
import { logger } from './logger';
import { stripe } from './stripe';

/**
 * Composition root primitives.
 *
 * As we build out `src/application/**` and `src/adapters/**`, this file will grow
 * factory functions that wire ports -> concrete implementations.
 */
export function createContainerPrimitives() {
  return {
    db,
    env,
    logger,
    stripe,
  } as const;
}
