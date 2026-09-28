import type {
  BillingPortalConfigurationCreateParams,
  StripeBillingPortalConfiguration,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import type { PortalProfile } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

// DEBT-414 F05: the portal's features are set here, not in the Dashboard's
// default configuration. Changing any feature requires a new version, so
// the adapter creates a new configuration instead of reusing one whose
// features differ.
export const PORTAL_CONFIGURATION_VERSION = '2026-09-28';

const PROFILE_METADATA_KEY = 'app_portal_profile';
const VERSION_METADATA_KEY = 'app_portal_version';
const LIST_PAGE_SIZE = 100;

export function portalConfigurationParams(
  profile: PortalProfile,
): BillingPortalConfigurationCreateParams {
  return {
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ['name', 'email', 'address', 'phone'],
      },
      invoice_history: { enabled: true },
      // A trial's first card comes only through the add-card flow, which
      // records consent to be charged.
      payment_method_update: { enabled: profile === 'paid' },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'switched_service', 'unused', 'other'],
        },
      },
      // Plan changes would change an existing subscriber's price, which
      // DEBT-414 keeps frozen.
      subscription_update: { enabled: false },
    },
    metadata: {
      [PROFILE_METADATA_KEY]: profile,
      [VERSION_METADATA_KEY]: PORTAL_CONFIGURATION_VERSION,
    },
  };
}

function isProfileConfiguration(
  configuration: StripeBillingPortalConfiguration,
  profile: PortalProfile,
): boolean {
  return (
    configuration.metadata?.[PROFILE_METADATA_KEY] === profile &&
    configuration.metadata?.[VERSION_METADATA_KEY] ===
      PORTAL_CONFIGURATION_VERSION
  );
}

// Finds the active configuration for the profile and version, or creates it.
// Concurrent first requests share one idempotency key; if two were created
// anyway, the oldest is chosen every time.
export async function resolvePortalConfigurationId({
  stripe,
  profile,
  logger,
}: {
  stripe: StripeClient;
  profile: PortalProfile;
  logger: Logger;
}): Promise<string> {
  const { configurations } = stripe.billingPortal;
  const matches: StripeBillingPortalConfiguration[] = [];
  let startingAfter: string | undefined;
  do {
    const cursor = startingAfter;
    const page = await callStripeWithRetry({
      operation: 'billingPortal.configurations.list',
      fn: () =>
        configurations.list({
          active: true,
          limit: LIST_PAGE_SIZE,
          ...(cursor ? { starting_after: cursor } : {}),
        }),
      logger,
    });
    matches.push(
      ...page.data.filter((configuration) =>
        isProfileConfiguration(configuration, profile),
      ),
    );
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  const [oldest] = matches.sort((a, b) => a.created - b.created);
  if (oldest) return oldest.id;

  const created = await callStripeWithRetry({
    operation: 'billingPortal.configurations.create',
    fn: () =>
      configurations.create(portalConfigurationParams(profile), {
        idempotencyKey: `portal_configuration:${profile}:${PORTAL_CONFIGURATION_VERSION}`,
      }),
    logger,
  });
  return created.id;
}
