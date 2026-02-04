import { z } from 'zod';
import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  StripeCustomerRepository,
  UserRepository,
} from '@/src/application/ports/repositories';

export type ClerkWebhookEvent = {
  type: string;
  data: unknown;
};

export type ClerkWebhookDeps = {
  userRepository: UserRepository;
  stripeCustomerRepository: StripeCustomerRepository;
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

export async function processClerkWebhook(
  deps: ClerkWebhookDeps,
  event: ClerkWebhookEvent,
): Promise<void> {
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

    const email = getPrimaryEmailOrNull(data);
    if (!email) {
      deps.logger.warn(
        { clerkUserId },
        'Clerk user.updated missing email; skipping user upsert',
      );
      return;
    }

    const observedAtMs =
      getNumberOrNull(data.updatedAt) ?? getNumberOrNull(data.updated_at);
    const observedAt = observedAtMs ? new Date(observedAtMs) : null;

    await deps.userRepository.upsertByClerkId(clerkUserId, email, {
      observedAt: observedAt ?? new Date(),
    });
    return;
  }

  if (event.type === 'user.deleted') {
    const parsed = clerkUserDeletedDataSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new ApplicationError(
        'INVALID_WEBHOOK_PAYLOAD',
        'Invalid Clerk user.deleted webhook payload',
      );
    }

    const clerkUserId = parsed.data.id;

    const user = await deps.userRepository.findByClerkId(clerkUserId);
    if (!user) return;

    const stripeCustomer = await deps.stripeCustomerRepository.findByUserId(
      user.id,
    );

    if (stripeCustomer) {
      await deps.cancelStripeCustomerSubscriptions(
        stripeCustomer.stripeCustomerId,
      );
    }

    await deps.userRepository.deleteByClerkId(clerkUserId);
    return;
  }
}
