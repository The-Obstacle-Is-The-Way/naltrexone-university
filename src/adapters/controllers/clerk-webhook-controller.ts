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
};

function getStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
    const data = event.data as ClerkUserDataLike;
    const clerkUserId = getStringOrNull(data.id);
    if (!clerkUserId) return;

    const email = getPrimaryEmailOrNull(data);
    if (!email) return;

    await deps.userRepository.upsertByClerkId(clerkUserId, email);
    return;
  }

  if (event.type === 'user.deleted') {
    const data = event.data as { id?: unknown };
    const clerkUserId = getStringOrNull(data.id);
    if (!clerkUserId) return;

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
