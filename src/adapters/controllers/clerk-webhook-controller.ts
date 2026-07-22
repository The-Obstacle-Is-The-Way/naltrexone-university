// WHY large-file: this adapter controller coordinates Clerk webhook validation, idempotency, tombstones, and post-commit Stripe customer deletion across short transaction boundaries.
import { z } from 'zod';
import {
  applyClerkUserEmailOwnershipResolution,
  type ClerkUserIdentity,
  type ClerkUserLookup,
  clerkIdentityConflictLogContext,
  resolveClerkUserEmailOwnershipConflict,
  validateClerkUserEmailOwnershipConflict,
} from '@/src/adapters/gateways/clerk-user-provisioner';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import {
  ApplicationError,
  isUserEmailOwnershipConflictError,
  type UserEmailOwnershipConflictError,
} from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  ClerkEventRepository,
  DeletedClerkUserRepository,
  PendingStripeCustomerCleanupRepository,
  StripeCustomerRepository,
  UserRepository,
} from '@/src/application/ports/repositories';

export type ClerkWebhookEvent = {
  eventId: string;
  type: string;
  data: unknown;
};

export type ClerkWebhookTransaction = {
  clerkEvents: ClerkEventRepository;
  deletedClerkUsers: DeletedClerkUserRepository;
  pendingStripeCustomerCleanups: PendingStripeCustomerCleanupRepository;
  userRepository: UserRepository;
  stripeCustomerRepository: StripeCustomerRepository;
};

export type ClerkWebhookDeps = {
  transaction: <T>(
    fn: (tx: ClerkWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
  deleteStripeCustomer: (stripeCustomerId: string) => Promise<void>;
  getClerkUserById: ClerkUserLookup;
  logger: Logger;
};

type ClerkEmailAddressLike = {
  id?: unknown;
  emailAddress?: unknown;
  email_address?: unknown;
};

type ClerkUserDataLike = {
  id?: unknown;
  primaryEmailAddressId?: unknown;
  primary_email_address_id?: unknown;
  emailAddresses?: unknown;
  email_addresses?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

const clerkEmailAddressSchema = z
  .object({
    id: z.string(),
    emailAddress: z.string().optional(),
    email_address: z.string().optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.emailAddress && !value.email_address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email address is required',
      });
    }
  });

const clerkUserUpdatedDataSchema = z
  .object({
    id: z.string(),
    primaryEmailAddressId: z.string().nullable().optional(),
    primary_email_address_id: z.string().nullable().optional(),
    emailAddresses: z.array(clerkEmailAddressSchema).optional(),
    email_addresses: z.array(clerkEmailAddressSchema).optional(),
    updatedAt: z.number().optional(),
    updated_at: z.number().optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.emailAddresses && !value.email_addresses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email addresses are required',
      });
    }

    if (
      typeof value.updatedAt !== 'number' &&
      typeof value.updated_at !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'updated_at is required',
      });
    }
  });

const clerkUserDeletedDataSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

function getStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function getPrimaryEmailOrNull(data: ClerkUserDataLike): string | null {
  const emailAddressesRaw = data.emailAddresses ?? data.email_addresses;
  const emailAddresses = Array.isArray(emailAddressesRaw)
    ? (emailAddressesRaw as ClerkEmailAddressLike[])
    : [];

  if (emailAddresses.length === 0) return null;

  const primaryId =
    getStringOrNull(data.primaryEmailAddressId) ??
    getStringOrNull(data.primary_email_address_id);

  if (primaryId) {
    const primary = emailAddresses.find(
      (e) => getStringOrNull(e.id) === primaryId,
    );
    const email =
      getStringOrNull(primary?.emailAddress) ??
      getStringOrNull(primary?.email_address);
    if (email) return email;
  }

  const first = emailAddresses[0];
  return (
    getStringOrNull(first?.emailAddress) ??
    getStringOrNull(first?.email_address)
  );
}

type ClerkWebhookPostCommitAction = {
  kind: 'delete-stripe-customer';
  eventId: string;
  stripeCustomerId: string;
};

type ClerkWebhookIdentityResolutionRequest = {
  kind: 'resolve-email-ownership';
  identity: ClerkUserIdentity;
  conflict: UserEmailOwnershipConflictError;
};

type ClerkWebhookTransactionOutcome =
  | ClerkWebhookPostCommitAction
  | ClerkWebhookIdentityResolutionRequest
  | null;

async function claimUnprocessedClerkEvent(
  clerkEvents: ClerkEventRepository,
  event: ClerkWebhookEvent,
): Promise<boolean> {
  const claimed = await clerkEvents.claim(event.eventId, event.type);
  if (!claimed) {
    const snapshot = await clerkEvents.peek(event.eventId);
    if (snapshot && snapshot.processedAt !== null && snapshot.error === null) {
      return false;
    }
  }

  const current = await clerkEvents.lock(event.eventId);
  return current.processedAt === null || current.error !== null;
}

async function persistFailure(
  deps: ClerkWebhookDeps,
  event: ClerkWebhookEvent,
  error: unknown,
): Promise<void> {
  const errorData = JSON.stringify(projectSafeErrorDiagnostics(error));

  try {
    await deps.transaction(async ({ clerkEvents }) => {
      await clerkEvents.claim(event.eventId, event.type);
      const current = await clerkEvents.lock(event.eventId);

      if (current.processedAt !== null && current.error === null) {
        return;
      }

      await clerkEvents.markFailed(event.eventId, errorData);
    });
  } catch (persistError) {
    deps.logger.error(
      {
        eventId: event.eventId,
        error: projectSafeErrorDiagnostics(persistError),
      },
      'Failed to persist Clerk webhook failure state',
    );
  }
}

export async function processClerkWebhook(
  deps: ClerkWebhookDeps,
  event: ClerkWebhookEvent,
): Promise<void> {
  if (event.type !== 'user.updated' && event.type !== 'user.deleted') {
    return;
  }

  let postCommitAction: ClerkWebhookPostCommitAction | null = null;

  try {
    const transactionOutcome = await deps.transaction(
      async ({
        clerkEvents,
        deletedClerkUsers,
        pendingStripeCustomerCleanups,
        userRepository,
        stripeCustomerRepository,
      }): Promise<ClerkWebhookTransactionOutcome> => {
        if (!(await claimUnprocessedClerkEvent(clerkEvents, event))) {
          return null;
        }

        if (event.type === 'user.updated') {
          const parsed = clerkUserUpdatedDataSchema.safeParse(event.data);
          if (!parsed.success) {
            throw new ApplicationError(
              'INVALID_WEBHOOK_PAYLOAD',
              'Invalid Clerk user.updated webhook payload',
            );
          }

          const data = parsed.data as ClerkUserDataLike;
          const clerkUserId = getStringOrNull(data.id);
          if (!clerkUserId) {
            throw new ApplicationError(
              'INVALID_WEBHOOK_PAYLOAD',
              'Clerk user.updated webhook payload is missing user id',
            );
          }

          await deletedClerkUsers.lock(clerkUserId);

          if (await deletedClerkUsers.exists(clerkUserId)) {
            await clerkEvents.markProcessed(event.eventId);
            return null;
          }

          const email = getPrimaryEmailOrNull(data);
          if (!email) {
            deps.logger.warn(
              { clerkUserId },
              'Clerk user.updated missing email; skipping user upsert',
            );
            await clerkEvents.markProcessed(event.eventId);
            return null;
          }

          const observedAtMs =
            getNumberOrNull(data.updatedAt) ?? getNumberOrNull(data.updated_at);
          const observedAt =
            observedAtMs === null ? null : new Date(observedAtMs);

          const identity = {
            clerkUserId,
            email,
            observedAt: observedAt ?? new Date(),
          } satisfies ClerkUserIdentity;

          try {
            const upsertedUser = await userRepository.upsertByClerkId(
              clerkUserId,
              email,
              {
                observedAt: identity.observedAt,
              },
            );

            // A delete can commit between the pre-check and upsert under READ
            // COMMITTED. On the re-check, deletion is the fourth subscription
            // writer: take the canonical advisory(user) lock before its
            // FK-fixed inverse cascade.
            if (await deletedClerkUsers.exists(clerkUserId)) {
              await userRepository.acquireSubscriptionWriteLock(
                upsertedUser.id,
              );
              await userRepository.deleteByClerkId(clerkUserId);
            }
          } catch (error) {
            if (!isUserEmailOwnershipConflictError(error)) throw error;

            await validateClerkUserEmailOwnershipConflict(
              { userRepository, logger: deps.logger },
              identity,
              error,
            );
            return {
              kind: 'resolve-email-ownership',
              identity,
              conflict: error,
            };
          }

          await clerkEvents.markProcessed(event.eventId);
          return null;
        }

        const parsed = clerkUserDeletedDataSchema.safeParse(event.data);
        if (!parsed.success) {
          throw new ApplicationError(
            'INVALID_WEBHOOK_PAYLOAD',
            'Invalid Clerk user.deleted webhook payload',
          );
        }

        const clerkUserId = parsed.data.id;
        if (!clerkUserId) {
          throw new ApplicationError(
            'INVALID_WEBHOOK_PAYLOAD',
            'Clerk user.deleted webhook payload is missing user id',
          );
        }

        const pendingCleanup =
          await pendingStripeCustomerCleanups.findByEventId(event.eventId);

        if (pendingCleanup) {
          return {
            kind: 'delete-stripe-customer',
            eventId: event.eventId,
            stripeCustomerId: pendingCleanup.stripeCustomerId,
          };
        }

        await deletedClerkUsers.lock(clerkUserId);
        // User deletion is the fourth subscription writer. Its FK cascade
        // order is fixed (stripe_customers -> stripe_subscriptions), and the
        // other writers' INSERTs take FK share locks on the users row while
        // holding the advisory — so the advisory must come BEFORE any
        // users-row lock here or the two lock classes form an AB-BA cycle.
        // Resolve the local id without locking, then lock in canonical order.
        const preliminaryUser = await userRepository.findByClerkId(clerkUserId);
        let stripeCustomerId: string | null = null;

        if (preliminaryUser) {
          await userRepository.acquireSubscriptionWriteLock(preliminaryUser.id);
          const user = await userRepository.lockByClerkId(clerkUserId);
          if (user) {
            if (user.id !== preliminaryUser.id) {
              // The row was recreated between the two reads; also serialize
              // on the id whose cascade is about to fire.
              await userRepository.acquireSubscriptionWriteLock(user.id);
            }
            // Read the customer mapping only while holding the advisory:
            // mapping writers serialize on it, so the captured id cannot be
            // repointed to a different Stripe customer before the cascade.
            const stripeCustomer = await stripeCustomerRepository.findByUserId(
              user.id,
            );
            stripeCustomerId = stripeCustomer?.stripeCustomerId ?? null;
            await userRepository.deleteByClerkId(clerkUserId);
          }
        }

        await deletedClerkUsers.markDeleted(clerkUserId);

        if (!stripeCustomerId) {
          await clerkEvents.markProcessed(event.eventId);
          return null;
        }

        await pendingStripeCustomerCleanups.schedule(
          event.eventId,
          stripeCustomerId,
        );
        return {
          kind: 'delete-stripe-customer',
          eventId: event.eventId,
          stripeCustomerId,
        };
      },
    );

    if (transactionOutcome?.kind === 'resolve-email-ownership') {
      const resolution = await resolveClerkUserEmailOwnershipConflict(
        {
          getClerkUserById: deps.getClerkUserById,
          logger: deps.logger,
        },
        transactionOutcome.identity,
        transactionOutcome.conflict,
      );

      await deps.transaction(
        async ({ clerkEvents, deletedClerkUsers, userRepository }) => {
          if (!(await claimUnprocessedClerkEvent(clerkEvents, event))) {
            deps.logger.info(
              clerkIdentityConflictLogContext(
                resolution.existingClerkUserId,
                transactionOutcome.identity.clerkUserId,
                'identity_resolution_superseded_by_processed_event',
              ),
              'Skipped Clerk user email ownership resolution',
            );
            return;
          }

          await deletedClerkUsers.lock(transactionOutcome.identity.clerkUserId);
          if (
            await deletedClerkUsers.exists(
              transactionOutcome.identity.clerkUserId,
            )
          ) {
            deps.logger.info(
              clerkIdentityConflictLogContext(
                resolution.existingClerkUserId,
                transactionOutcome.identity.clerkUserId,
                'identity_resolution_blocked_by_deletion_tombstone',
              ),
              'Skipped Clerk user email ownership resolution',
            );
            await clerkEvents.markProcessed(event.eventId);
            return;
          }

          await applyClerkUserEmailOwnershipResolution(
            { userRepository, logger: deps.logger },
            transactionOutcome.identity,
            transactionOutcome.conflict,
            resolution,
          );

          await clerkEvents.markProcessed(event.eventId);
        },
      );
      return;
    }

    postCommitAction = transactionOutcome;
  } catch (error) {
    await persistFailure(deps, event, error);
    throw error;
  }

  if (!postCommitAction) {
    return;
  }

  try {
    await deps.deleteStripeCustomer(postCommitAction.stripeCustomerId);

    await deps.transaction(
      async ({ clerkEvents, pendingStripeCustomerCleanups }) => {
        await pendingStripeCustomerCleanups.deleteByEventId(
          postCommitAction.eventId,
        );
        await clerkEvents.markProcessed(postCommitAction.eventId);
      },
    );
  } catch (error) {
    await persistFailure(deps, event, error);
    throw error;
  }
}
