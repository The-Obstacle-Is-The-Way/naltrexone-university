import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SKIP_CLERK: z.enum(['true', 'false']).optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      'Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    throw new Error('Invalid environment variables');
  }

  if (
    process.env.VERCEL_ENV === 'production' &&
    parsed.data.NEXT_PUBLIC_SKIP_CLERK === 'true'
  ) {
    throw new Error(
      'NEXT_PUBLIC_SKIP_CLERK must not be true in production (VERCEL_ENV=production)',
    );
  }

  return parsed.data;
}

export const env = validateEnv();
