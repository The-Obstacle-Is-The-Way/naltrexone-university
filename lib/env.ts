import 'server-only';
import { z } from 'zod';

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

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      'Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    throw new Error('Invalid environment variables');
  }

  const skipClerk = parsed.data.NEXT_PUBLIC_SKIP_CLERK === 'true';
  const isVercelProductionDeploy = process.env.VERCEL_ENV === 'production';
  if (!skipClerk) {
    const missingClerkKeys: Record<string, string[]> = {};
    if (!parsed.data.CLERK_SECRET_KEY) {
      missingClerkKeys.CLERK_SECRET_KEY = ['Required'];
    }
    if (!parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      missingClerkKeys.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ['Required'];
    }
    if (isVercelProductionDeploy && !parsed.data.CLERK_WEBHOOK_SIGNING_SECRET) {
      missingClerkKeys.CLERK_WEBHOOK_SIGNING_SECRET = ['Required'];
    }

    if (Object.keys(missingClerkKeys).length > 0) {
      console.error('Invalid environment variables:', missingClerkKeys);
      throw new Error('Invalid environment variables');
    }
  }

  if (isVercelProductionDeploy && skipClerk) {
    throw new Error(
      'NEXT_PUBLIC_SKIP_CLERK must not be true in production (VERCEL_ENV=production)',
    );
  }

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
