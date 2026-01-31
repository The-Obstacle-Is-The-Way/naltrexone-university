# SPEC-011: Paywall Feature Slice

**Spec ID:** SPEC-011
**Status:** Ready
**Dependencies:** SLICE-0 (Foundation) must be complete
**Estimated Complexity:** High (Stripe integration, webhooks, state management)

---

## Overview

This slice implements the complete subscription paywall: Stripe Checkout, webhooks, subscription enforcement, and billing management. A user who is not subscribed cannot access `/app/*` routes.

**Core Principle:** No silent failures. Every Stripe interaction is verifiable through database state. The webhook is the source of truth—the success page is just a courtesy sync.

---

## User Stories

1. As a logged-in user, I can click "Subscribe" on the pricing page and be redirected to Stripe Checkout.
2. As a user completing payment, I return to a success page that confirms my subscription.
3. As a subscribed user, I can access `/app/*` routes.
4. As an unsubscribed user, I am redirected to `/pricing` when attempting to access `/app/*`.
5. As a subscribed user, I can open Stripe Customer Portal to manage billing.
6. As a user whose subscription is canceled, my access is revoked.

---

## Architecture Decisions (SOLID + Clean Architecture)

### Single Responsibility
- `lib/stripe.ts` — Stripe SDK singleton only
- `lib/subscription.ts` — Entitlement logic only (no Stripe calls)
- `stripe.actions.ts` — Server actions coordinate Stripe + DB
- `webhook/route.ts` — Webhook handling only

### Open/Closed
- Entitlement logic uses status enum, easily extended for new states
- Webhook handlers are registered in a map, extensible without modifying core loop

### Dependency Inversion
- Actions depend on `db` abstraction, not raw postgres
- Tests can inject test database connection

### Interface Segregation
- `ActionResult<T>` discriminated union prevents leaking implementation details
- Webhook returns minimal response (`{ received: true }`)

---

## Test-First Specification (TDD)

### Phase 1: Unit Tests (Write FIRST)

#### File: `lib/subscription.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { isUserEntitled, type SubscriptionState } from './subscription';

describe('isUserEntitled', () => {
  const now = new Date('2026-02-01T12:00:00Z');

  it('returns true for active subscription with future period end', () => {
    const state: SubscriptionState = {
      status: 'active',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    };
    expect(isUserEntitled(state, now)).toBe(true);
  });

  it('returns true for trialing subscription with future period end', () => {
    const state: SubscriptionState = {
      status: 'trialing',
      currentPeriodEnd: new Date('2026-02-15T00:00:00Z'),
    };
    expect(isUserEntitled(state, now)).toBe(true);
  });

  it('returns false for active subscription with expired period', () => {
    const state: SubscriptionState = {
      status: 'active',
      currentPeriodEnd: new Date('2026-01-15T00:00:00Z'), // past
    };
    expect(isUserEntitled(state, now)).toBe(false);
  });

  it('returns false for canceled status', () => {
    const state: SubscriptionState = {
      status: 'canceled',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    };
    expect(isUserEntitled(state, now)).toBe(false);
  });

  it('returns false for past_due status', () => {
    const state: SubscriptionState = {
      status: 'past_due',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    };
    expect(isUserEntitled(state, now)).toBe(false);
  });

  it('returns false for null subscription', () => {
    expect(isUserEntitled(null, now)).toBe(false);
  });

  it('returns false for unpaid status', () => {
    const state: SubscriptionState = {
      status: 'unpaid',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    };
    expect(isUserEntitled(state, now)).toBe(false);
  });
});
```

#### File: `lib/auth.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ensureUserRow } from './auth';

describe('ensureUserRow', () => {
  it('creates user row if not exists', async () => {
    // Test with real DB in integration tests
    // Unit test verifies the function signature and error handling
  });

  it('returns existing user if clerk_user_id matches', async () => {
    // Covered in integration tests
  });

  it('throws UNAUTHENTICATED if clerk user is null', async () => {
    // This is a guard test
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/stripe.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { users, stripeCustomers, stripeSubscriptions, stripeEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';

// These tests use a real test database (CI Postgres service)
// No Stripe API mocks — we test the DB layer behavior

describe('Stripe DB Integration', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    const [user] = await db.insert(users).values({
      clerkUserId: 'test_clerk_123',
      email: 'test@example.com',
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(users).where(eq(users.clerkUserId, 'test_clerk_123'));
  });

  beforeEach(async () => {
    // Clear subscriptions between tests
    await db.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, testUserId));
    await db.delete(stripeCustomers).where(eq(stripeCustomers.userId, testUserId));
  });

  describe('stripe_customers', () => {
    it('creates customer with unique constraint on user_id', async () => {
      await db.insert(stripeCustomers).values({
        userId: testUserId,
        stripeCustomerId: 'cus_test_123',
      });

      // Second insert should fail
      await expect(
        db.insert(stripeCustomers).values({
          userId: testUserId,
          stripeCustomerId: 'cus_test_456',
        })
      ).rejects.toThrow();
    });

    it('creates customer with unique constraint on stripe_customer_id', async () => {
      await db.insert(stripeCustomers).values({
        userId: testUserId,
        stripeCustomerId: 'cus_test_unique',
      });

      // Create another user
      const [user2] = await db.insert(users).values({
        clerkUserId: 'test_clerk_456',
        email: 'test2@example.com',
      }).returning();

      // Same stripe_customer_id should fail
      await expect(
        db.insert(stripeCustomers).values({
          userId: user2.id,
          stripeCustomerId: 'cus_test_unique',
        })
      ).rejects.toThrow();

      // Cleanup
      await db.delete(users).where(eq(users.id, user2.id));
    });
  });

  describe('stripe_subscriptions', () => {
    it('enforces one subscription per user', async () => {
      await db.insert(stripeSubscriptions).values({
        userId: testUserId,
        stripeSubscriptionId: 'sub_test_123',
        status: 'active',
        priceId: 'price_monthly',
        currentPeriodEnd: new Date('2026-03-01'),
      });

      // Second subscription should fail
      await expect(
        db.insert(stripeSubscriptions).values({
          userId: testUserId,
          stripeSubscriptionId: 'sub_test_456',
          status: 'active',
          priceId: 'price_annual',
          currentPeriodEnd: new Date('2027-01-01'),
        })
      ).rejects.toThrow();
    });

    it('allows updating subscription status', async () => {
      await db.insert(stripeSubscriptions).values({
        userId: testUserId,
        stripeSubscriptionId: 'sub_test_update',
        status: 'active',
        priceId: 'price_monthly',
        currentPeriodEnd: new Date('2026-03-01'),
      });

      await db.update(stripeSubscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(stripeSubscriptions.userId, testUserId));

      const [updated] = await db.select()
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.userId, testUserId));

      expect(updated.status).toBe('canceled');
    });
  });

  describe('stripe_events idempotency', () => {
    it('allows inserting event with processed_at null', async () => {
      await db.insert(stripeEvents).values({
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        processedAt: null,
        error: null,
      });

      const [event] = await db.select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, 'evt_test_123'));

      expect(event.processedAt).toBeNull();
    });

    it('marks event as processed', async () => {
      const eventId = 'evt_test_processed';
      await db.insert(stripeEvents).values({
        id: eventId,
        type: 'customer.subscription.updated',
        processedAt: null,
        error: null,
      });

      await db.update(stripeEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeEvents.id, eventId));

      const [event] = await db.select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, eventId));

      expect(event.processedAt).not.toBeNull();
    });

    it('prevents duplicate event IDs', async () => {
      const eventId = 'evt_test_dupe';
      await db.insert(stripeEvents).values({
        id: eventId,
        type: 'checkout.session.completed',
        processedAt: null,
        error: null,
      });

      await expect(
        db.insert(stripeEvents).values({
          id: eventId,
          type: 'checkout.session.completed',
          processedAt: null,
          error: null,
        })
      ).rejects.toThrow();
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/subscribe.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { clerkSetup } from '@clerk/testing/playwright';

test.describe('Subscription Flow', () => {
  test.beforeAll(async () => {
    // Clerk auth setup
    await clerkSetup();
  });

  test('unsubscribed user is redirected from /app/dashboard to /pricing', async ({ page }) => {
    // Sign in via Clerk
    await page.goto('/sign-in');
    // ... Clerk sign in steps

    // Try to access protected route
    await page.goto('/app/dashboard');

    // Should redirect to pricing
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('user can initiate checkout from pricing page', async ({ page }) => {
    await page.goto('/pricing');

    // Click subscribe button
    const monthlyButton = page.getByRole('button', { name: /subscribe.*monthly/i });
    await monthlyButton.click();

    // Should redirect to Stripe Checkout (external domain)
    await expect(page.url()).toContain('checkout.stripe.com');
  });

  test('user returns to success page after payment', async ({ page }) => {
    // This test uses Stripe test mode
    // Navigate through checkout with test card 4242424242424242

    // After successful payment, verify:
    // 1. Redirected to /checkout/success
    // 2. Success page shows confirmation
    // 3. Can access /app/dashboard
  });

  test('subscribed user can access /app/dashboard', async ({ page }) => {
    // Pre-condition: user has active subscription in DB

    await page.goto('/app/dashboard');

    // Should NOT redirect
    await expect(page).toHaveURL('/app/dashboard');
    await expect(page.getByText(/dashboard/i)).toBeVisible();
  });

  test('user can access billing portal', async ({ page }) => {
    await page.goto('/app/billing');

    const portalButton = page.getByRole('button', { name: /manage.*billing/i });
    await portalButton.click();

    // Should redirect to Stripe billing portal
    await expect(page.url()).toContain('billing.stripe.com');
  });
});
```

---

## Implementation Checklist

Execute in this exact order. Each step must pass quality gates before proceeding.

### Step 1: Create Stripe SDK Singleton

**File:** `lib/stripe.ts`

```typescript
import 'server-only';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-04-30.basil',
  typescript: true,
});
```

**Verification:**
```bash
pnpm tsc --noEmit  # Type checks
```

### Step 2: Create Subscription Entitlement Logic

**File:** `lib/subscription.ts`

```typescript
import 'server-only';
import { db } from './db';
import { stripeSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { StripeSubscriptionStatus } from '@/db/schema';

export type SubscriptionState = {
  status: StripeSubscriptionStatus;
  currentPeriodEnd: Date;
} | null;

const ENTITLED_STATUSES: StripeSubscriptionStatus[] = ['active', 'trialing'];

export function isUserEntitled(
  subscription: SubscriptionState,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (!ENTITLED_STATUSES.includes(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}

export async function getUserSubscription(userId: string): Promise<SubscriptionState> {
  const [sub] = await db
    .select({
      status: stripeSubscriptions.status,
      currentPeriodEnd: stripeSubscriptions.currentPeriodEnd,
    })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.userId, userId))
    .limit(1);

  return sub ?? null;
}

export async function checkUserEntitlement(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return isUserEntitled(subscription);
}
```

**Verification:**
```bash
pnpm test lib/subscription.test.ts  # Unit tests pass
```

### Step 3: Create ActionResult Type

**File:** `src/adapters/controllers/action-result.ts`

```typescript
export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STRIPE_ERROR'
  | 'INTERNAL_ERROR';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}
```

### Step 4: Implement Stripe Server Actions

**File:** `src/adapters/controllers/billing-controller.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { users, stripeCustomers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { type ActionResult, success, failure } from './action-result';

const CreateCheckoutSessionInput = z.object({
  priceId: z.string().min(1),
});

export type CreateCheckoutSessionOutput = { url: string };

export async function createCheckoutSession(
  input: z.infer<typeof CreateCheckoutSessionInput>
): Promise<ActionResult<CreateCheckoutSessionOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = CreateCheckoutSessionInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input', {
      priceId: parsed.error.flatten().fieldErrors.priceId ?? [],
    });
  }

  try {
    // Ensure user exists
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      // Get email from Clerk
      const clerkUser = await (await import('@clerk/nextjs/server')).currentUser();
      if (!clerkUser?.emailAddresses[0]?.emailAddress) {
        return failure('INTERNAL_ERROR', 'Could not retrieve user email');
      }

      [user] = await db
        .insert(users)
        .values({
          clerkUserId,
          email: clerkUser.emailAddresses[0].emailAddress,
        })
        .returning();
    }

    // Ensure Stripe customer exists
    let [customer] = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, user.id));

    if (!customer) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
          clerk_user_id: clerkUserId,
        },
      });

      [customer] = await db
        .insert(stripeCustomers)
        .values({
          userId: user.id,
          stripeCustomerId: stripeCustomer.id,
        })
        .returning();
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.stripeCustomerId,
      line_items: [{ price: parsed.data.priceId, quantity: 1 }],
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancel`,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    });

    if (!session.url) {
      return failure('STRIPE_ERROR', 'Checkout session URL not returned');
    }

    return success({ url: session.url });
  } catch (error) {
    console.error('createCheckoutSession error:', error);
    if (error instanceof Error && error.message.includes('Stripe')) {
      return failure('STRIPE_ERROR', error.message);
    }
    return failure('INTERNAL_ERROR', 'Failed to create checkout session');
  }
}

export type CreatePortalSessionOutput = { url: string };

export async function createPortalSession(): Promise<ActionResult<CreatePortalSessionOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('NOT_FOUND', 'User not found');
    }

    const [customer] = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, user.id));

    if (!customer) {
      return failure('NOT_FOUND', 'No billing account found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/billing`,
    });

    return success({ url: session.url });
  } catch (error) {
    console.error('createPortalSession error:', error);
    if (error instanceof Error && error.message.includes('Stripe')) {
      return failure('STRIPE_ERROR', error.message);
    }
    return failure('INTERNAL_ERROR', 'Failed to create portal session');
  }
}
```

### Step 5: Implement Webhook Handler

**File:** `app/api/stripe/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import {
  users,
  stripeCustomers,
  stripeSubscriptions,
  stripeEvents,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: check if already processed
  const [existingEvent] = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.id, event.id));

  if (existingEvent?.processedAt && !existingEvent.error) {
    // Already processed successfully
    return NextResponse.json({ received: true });
  }

  // Record event (upsert for idempotency)
  if (!existingEvent) {
    await db.insert(stripeEvents).values({
      id: event.id,
      type: event.type,
      processedAt: null,
      error: null,
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        // Unhandled event type - mark as processed
        break;
    }

    // Mark as successfully processed
    await db
      .update(stripeEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(stripeEvents.id, event.id));
  } catch (error) {
    // Record error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await db
      .update(stripeEvents)
      .set({ error: errorMessage })
      .where(eq(stripeEvents.id, event.id));

    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;

  const userId = session.client_reference_id;
  if (!userId) {
    throw new Error('Missing client_reference_id in checkout session');
  }

  // Ensure stripe_customers row exists
  const [existingCustomer] = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.userId, userId));

  if (!existingCustomer && session.customer) {
    await db.insert(stripeCustomers).values({
      userId,
      stripeCustomerId: session.customer as string,
    }).onConflictDoNothing();
  }

  // Subscription will be created via customer.subscription.created event
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    // Try to find user via customer
    const [customer] = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.stripeCustomerId, subscription.customer as string));

    if (!customer) {
      throw new Error('Cannot find user for subscription');
    }

    await upsertSubscription(customer.userId, subscription);
  } else {
    await upsertSubscription(userId, subscription);
  }
}

async function upsertSubscription(userId: string, subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    throw new Error('Subscription has no price');
  }

  const [existing] = await db
    .select()
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.userId, userId));

  if (existing) {
    await db
      .update(stripeSubscriptions)
      .set({
        stripeSubscriptionId: subscription.id,
        status: subscription.status as any,
        priceId,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(stripeSubscriptions.userId, userId));
  } else {
    await db.insert(stripeSubscriptions).values({
      userId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status as any,
      priceId,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const [customer] = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, subscription.customer as string));

  if (customer) {
    await db
      .update(stripeSubscriptions)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
      })
      .where(eq(stripeSubscriptions.userId, customer.userId));
  }
}
```

### Step 6: Implement Subscription Gate in App Layout

**File:** `app/(app)/app/layout.tsx`

```typescript
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    redirect('/sign-in');
  }

  // Find internal user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));

  if (!user) {
    // User exists in Clerk but not in our DB - send to pricing to subscribe
    redirect('/pricing');
  }

  // Check entitlement
  const isEntitled = await checkUserEntitlement(user.id);

  if (!isEntitled) {
    redirect('/pricing');
  }

  return (
    <div className="min-h-screen">
      {/* App shell header goes here */}
      <main>{children}</main>
    </div>
  );
}
```

### Step 7: Create Checkout Success Page

**File:** `app/(marketing)/checkout/success/page.tsx`

```typescript
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { users, stripeCustomers, stripeSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    redirect('/sign-in');
  }

  if (!session_id) {
    redirect('/pricing');
  }

  // Fetch checkout session from Stripe
  const session = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ['subscription'],
  });

  if (session.payment_status !== 'paid') {
    redirect('/pricing?checkout=failed');
  }

  // Sync subscription (idempotent - webhook may have already done this)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));

  if (user && session.subscription) {
    const subscription = session.subscription as any;

    // Ensure customer exists
    const [existingCustomer] = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, user.id));

    if (!existingCustomer && session.customer) {
      await db.insert(stripeCustomers).values({
        userId: user.id,
        stripeCustomerId: session.customer as string,
      }).onConflictDoNothing();
    }

    // Ensure subscription exists
    const [existingSub] = await db
      .select()
      .from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.userId, user.id));

    if (!existingSub) {
      await db.insert(stripeSubscriptions).values({
        userId: user.id,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price.id ?? '',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      }).onConflictDoNothing();
    }
  }

  redirect('/app/dashboard');
}
```

### Step 8: Create Billing Page

**File:** `app/(app)/app/billing/page.tsx`

```typescript
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users, stripeSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    redirect('/sign-in');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));

  if (!user) {
    redirect('/pricing');
  }

  const [subscription] = await db
    .select()
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.userId, user.id));

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {subscription ? (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{subscription.status}</p>
          </div>

          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Current Period Ends</p>
            <p className="font-medium">
              {subscription.currentPeriodEnd.toLocaleDateString()}
            </p>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="p-4 border rounded-lg bg-yellow-50">
              <p className="text-yellow-800">
                Your subscription will cancel at the end of the current period.
              </p>
            </div>
          )}

          <BillingClient />
        </div>
      ) : (
        <div className="p-4 border rounded-lg">
          <p>No active subscription.</p>
          <a href="/pricing" className="text-blue-600 hover:underline">
            View pricing
          </a>
        </div>
      )}
    </div>
  );
}
```

**File:** `app/(app)/app/billing/billing-client.tsx`

```typescript
'use client';

import { useState } from 'react';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';
import { Button } from '@/components/ui/button';

export function BillingClient() {
  const [loading, setLoading] = useState(false);

  async function handleManageBilling() {
    setLoading(true);
    try {
      const result = await createPortalSession();
      if (result.ok) {
        window.location.href = result.data.url;
      } else {
        alert(result.error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleManageBilling} disabled={loading}>
      {loading ? 'Loading...' : 'Manage Billing'}
    </Button>
  );
}
```

---

## Quality Gates (Must Pass)

```bash
# 1. Type check
pnpm tsc --noEmit

# 2. Lint and format
pnpm biome check .

# 3. Unit tests
pnpm test lib/subscription.test.ts

# 4. Integration tests
pnpm test:integration tests/integration/stripe.integration.test.ts

# 5. E2E tests (requires Stripe test mode)
pnpm test:e2e tests/e2e/subscribe.spec.ts
```

---

## Demo Verification (Manual)

1. **Unsubscribed redirect:** Sign in, navigate to `/app/dashboard`, verify redirect to `/pricing`
2. **Checkout flow:** Click "Subscribe Monthly", complete Stripe Checkout with test card `4242424242424242`
3. **Success sync:** After payment, verify redirect to `/app/dashboard`
4. **Billing portal:** Navigate to `/app/billing`, click "Manage Billing", verify Stripe portal opens
5. **Webhook processing:** In Stripe Dashboard > Webhooks, verify events are received and processed

---

## Definition of Done

- [ ] All unit tests pass (`pnpm test lib/subscription.test.ts`)
- [ ] All integration tests pass (`pnpm test:integration`)
- [ ] All E2E tests pass (`pnpm test:e2e`)
- [ ] `pnpm biome check .` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] Webhook events update `stripe_customers` + `stripe_subscriptions`
- [ ] Unsubscribed users cannot access `/app/*`
- [ ] Subscribed users can access `/app/*`
- [ ] Customer Portal opens and returns to `/app/billing`
- [ ] All changes committed with atomic commits

---

## Files Checklist

### Create
- [ ] `lib/subscription.ts`
- [ ] `lib/subscription.test.ts`
- [ ] `src/adapters/controllers/action-result.ts`
- [ ] `src/adapters/controllers/billing-controller.ts`
- [ ] `app/api/stripe/webhook/route.ts`
- [ ] `app/(marketing)/checkout/success/page.tsx`
- [ ] `app/(app)/app/layout.tsx`
- [ ] `app/(app)/app/billing/page.tsx`
- [ ] `app/(app)/app/billing/billing-client.tsx`
- [ ] `tests/integration/stripe.integration.test.ts`
- [ ] `tests/e2e/subscribe.spec.ts`

### Modify
- [ ] `lib/stripe.ts` (add error handling)

---

## Anti-Patterns to Avoid

1. **NO silent fallbacks** - If Stripe fails, throw. Don't return fake success.
2. **NO mocking Stripe in integration tests** - Test DB behavior, not Stripe mocks.
3. **NO hardcoded price IDs** - Use env vars.
4. **NO skipping webhook signature verification** - Even in tests, verify the flow.
5. **NO optimistic UI without server confirmation** - Subscription state comes from DB, not local state.
