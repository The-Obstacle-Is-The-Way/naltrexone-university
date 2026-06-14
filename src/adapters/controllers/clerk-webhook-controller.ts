// WHY large-file: this adapter controller keeps Clerk webhook validation, idempotency, tombstone, and Stripe-cancellation coordination in one transactional boundary.
import { z } from 'zod';
import { STACK_TRACE_LIMIT } from '@/src/adapters/shared/error-logging-constants';
import { ApplicationError, isApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  ClerkEventRepository,
  DeletedClerkUserRepository,
  PendingStripeCancellationRepository,
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
  pendingStripeCancellations: PendingStripeCancellationRepository;
  userRepository: UserRepository;
  stripeCustomerRepository: StripeCustomerRepository;
};

export type ClerkWebhookDeps = {
  transaction: <T>(
    fn: (tx: ClerkWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
  cancelStripeCustomerSubscriptions: (
    stripeCustomerId: string,
  ) => Promise<void>;
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
  eventId: string;
  stripeCustomerId: string;
};

function toErrorData(error: unknown): string {
  if (isApplicationError(error)) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      fieldErrors: error.fieldErrors ?? undefined,
      stack: error.stack?.slice(0, STACK_TRACE_LIMIT),
    });
  }

  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, STACK_TRACE_LIMIT),
    });
  }

  const raw = String(error);
  return JSON.stringify({
    message: 'Unknown error',
    raw:
      raw.length > STACK_TRACE_LIMIT
        ? `${raw.slice(0, STACK_TRACE_LIMIT)}...`
        : raw,
  });
}

async function persistFailure(
  deps: ClerkWebhookDeps,
  event: ClerkWebhookEvent,
  error: unknown,
): Promise<void> {
  const errorData = toErrorData(error);

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
        error:
          persistError instanceof Error
            ? persistError.message
            : String(persistError),
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
    postCommitAction = await deps.transaction(
      async ({
        clerkEvents,
        deletedClerkUsers,
        pendingStripeCancellations,
        userRepository,
        stripeCustomerRepository,
      }): Promise<ClerkWebhookPostCommitAction | null> => {
        const claimed = await clerkEvents.claim(event.eventId, event.type);
        if (!claimed) {
          const snapshot = await clerkEvents.peek(event.eventId);
          if (
            snapshot &&
            snapshot.processedAt !== null &&
            snapshot.error === null
          ) {
            return null;
          }
        }

        const current = await clerkEvents.lock(event.eventId);
        if (current.processedAt !== null && current.error === null) {
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

          await userRepository.upsertByClerkId(clerkUserId, email, {
            observedAt: observedAt ?? new Date(),
          });

          // A delete can commit between the pre-check above and the upsert under
          // READ COMMITTED. Re-check tombstone state before committing the update.
          if (await deletedClerkUsers.exists(clerkUserId)) {
            await userRepository.deleteByClerkId(clerkUserId);
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

        const pendingCancellation =
          await pendingStripeCancellations.findByEventId(event.eventId);

        if (pendingCancellation) {
          return {
            eventId: event.eventId,
            stripeCustomerId: pendingCancellation.stripeCustomerId,
          };
        }

        await deletedClerkUsers.lock(clerkUserId);
        const user = await userRepository.lockByClerkId(clerkUserId);
        let stripeCustomerId: string | null = null;

        if (user) {
          const stripeCustomer = await stripeCustomerRepository.findByUserId(
            user.id,
          );
          stripeCustomerId = stripeCustomer?.stripeCustomerId ?? null;

          await userRepository.deleteByClerkId(clerkUserId);
        }

        await deletedClerkUsers.markDeleted(clerkUserId);

        if (!stripeCustomerId) {
          await clerkEvents.markProcessed(event.eventId);
          return null;
        }

        await pendingStripeCancellations.schedule(
          event.eventId,
          stripeCustomerId,
        );
        return { eventId: event.eventId, stripeCustomerId };
      },
    );
  } catch (error) {
    await persistFailure(deps, event, error);
    throw error;
  }

  if (!postCommitAction) {
    return;
  }

  try {
    await deps.cancelStripeCustomerSubscriptions(
      postCommitAction.stripeCustomerId,
    );

    await deps.transaction(
      async ({ clerkEvents, pendingStripeCancellations }) => {
        await pendingStripeCancellations.deleteByEventId(
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
