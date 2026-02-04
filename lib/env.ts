import 'server-only';
import { z } from 'zod';

type ClerkKeyEnvironment = 'test' | 'live';

function getClerkKeyEnvironment(key: string): ClerkKeyEnvironment | null {
  if (key.startsWith('pk_test_') || key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('pk_live_') || key.startsWith('sk_live_')) return 'live';
  return null;
}

function decodeBase64Utf8(raw: string): string | null {
  if (!raw) return null;
  try {
    const padded =
      raw.length % 4 === 0 ? raw : `${raw}${'='.repeat(4 - (raw.length % 4))}`;
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function getClerkInstanceSlug(key: string): string | null {
  const prefixes = ['pk_test_', 'pk_live_', 'sk_test_', 'sk_live_'] as const;
  const prefix = prefixes.find((p) => key.startsWith(p));
  if (!prefix) return null;

  const remainder = key.slice(prefix.length);
  const maybeBase64 = remainder.split('_')[0] ?? '';
  const decoded = decodeBase64Utf8(maybeBase64);
  if (!decoded) return null;

  const normalized = decoded.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) return null;
  return normalized;
}

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_SKIP_CLERK: z.enum(['true', 'false']).optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: z
    .string()
    .min(1)
    .regex(/^price_/, 'Must start with "price_"'),
  NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: z
    .string()
    .min(1)
    .regex(/^price_/, 'Must start with "price_"'),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = Omit<
  z.infer<typeof envSchema>,
  | 'CLERK_SECRET_KEY'
  | 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
  | 'CLERK_WEBHOOK_SIGNING_SECRET'
> & {
  CLERK_SECRET_KEY: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  CLERK_WEBHOOK_SIGNING_SECRET: string;
};

function logInvalidEnv(details: unknown) {
  // NOTE: This module validates env at import-time, before DI/container wiring.
  // Use console.error intentionally here and only log safe metadata (field names
  // + validation errors), never secret values.
  console.error('Invalid environment variables:', details);
}

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    logInvalidEnv(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  const skipClerk = parsed.data.NEXT_PUBLIC_SKIP_CLERK === 'true';
  // NOTE: Next.js sets NODE_ENV=production during `next build`, which we still
  // need to support in CI without real Clerk keys. Treat "production runtime"
  // as:
  // - Vercel production deploys (VERCEL_ENV=production), OR
  // - NODE_ENV=production when not running the build script.
  const isProductionRuntime =
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' &&
      process.env.npm_lifecycle_event !== 'build');
  if (!skipClerk) {
    const missingClerkKeys: Record<string, string[]> = {};
    if (!parsed.data.CLERK_SECRET_KEY) {
      missingClerkKeys.CLERK_SECRET_KEY = ['Required'];
    }
    if (!parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      missingClerkKeys.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ['Required'];
    }
    if (isProductionRuntime && !parsed.data.CLERK_WEBHOOK_SIGNING_SECRET) {
      missingClerkKeys.CLERK_WEBHOOK_SIGNING_SECRET = ['Required'];
    }

    if (Object.keys(missingClerkKeys).length > 0) {
      logInvalidEnv(missingClerkKeys);
      throw new Error('Invalid environment variables');
    }

    const clerkSecretKey = parsed.data.CLERK_SECRET_KEY;
    const clerkPublishableKey = parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    if (clerkSecretKey && clerkPublishableKey) {
      const clerkKeyErrors: Record<string, string[]> = {};

      const publishableEnv = getClerkKeyEnvironment(clerkPublishableKey);
      const secretEnv = getClerkKeyEnvironment(clerkSecretKey);
      if (publishableEnv && secretEnv && publishableEnv !== secretEnv) {
        clerkKeyErrors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = [
          `Must match CLERK_SECRET_KEY environment (${secretEnv})`,
        ];
        clerkKeyErrors.CLERK_SECRET_KEY = [
          `Must match NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment (${publishableEnv})`,
        ];
      }

      const publishableSlug = getClerkInstanceSlug(clerkPublishableKey);
      const secretSlug = getClerkInstanceSlug(clerkSecretKey);
      if (publishableSlug && secretSlug && publishableSlug !== secretSlug) {
        clerkKeyErrors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = [
          ...(clerkKeyErrors.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? []),
          `Appears to be for a different Clerk instance than CLERK_SECRET_KEY (${publishableSlug} != ${secretSlug})`,
        ];
        clerkKeyErrors.CLERK_SECRET_KEY = [
          ...(clerkKeyErrors.CLERK_SECRET_KEY ?? []),
          `Appears to be for a different Clerk instance than NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (${secretSlug} != ${publishableSlug})`,
        ];
      }

      if (Object.keys(clerkKeyErrors).length > 0) {
        logInvalidEnv(clerkKeyErrors);
        throw new Error('Invalid environment variables');
      }
    }
  }

  if (isProductionRuntime && skipClerk) {
    throw new Error('NEXT_PUBLIC_SKIP_CLERK must not be true in production');
  }

  // When Clerk is skipped (local/CI builds), allow missing Clerk keys by
  // providing dummy values. Production deploys forbid SKIP_CLERK above.
  return {
    ...parsed.data,
    CLERK_SECRET_KEY: parsed.data.CLERK_SECRET_KEY ?? 'sk_test_dummy',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_dummy',
    CLERK_WEBHOOK_SIGNING_SECRET:
      parsed.data.CLERK_WEBHOOK_SIGNING_SECRET ?? 'whsec_dummy',
  };
}

export const env = validateEnv();
