# SPEC-001: Foundation

**Status:** Ready for Implementation
**Dependencies:** None
**Implements ADRs:** 001, 003, 007, 008, 012

---

## Objective

Establish a stable, spec-aligned baseline with Clean Architecture layers, Clerk authentication, database schema, and CI pipeline. This slice is **infrastructure only**—no features, just the foundation that all other slices build upon.

---

## Ralph Wiggum Compliance

| Criterion | How This Spec Satisfies It |
|-----------|---------------------------|
| **Self-contained** | No external dependencies beyond SLICE-0; delivers complete working infrastructure |
| **Testable E2E** | `POST /api/health` returns `{ ok: true, db: true }` + Clerk sign-in renders |
| **Demoable** | Deployed preview URL works, health endpoint responds, protected route redirects |

---

## Design Patterns Applied

| Pattern | Application |
|---------|-------------|
| **Dependency Inversion (SOLID)** | Port interfaces in `src/application/ports/`, implementations in `src/adapters/` |
| **Factory Method (GoF)** | `lib/container.ts` creates use cases with injected dependencies |
| **Singleton (GoF)** | `lib/db.ts` exports single Drizzle client instance |
| **Adapter (GoF)** | `ClerkAuthGateway` adapts Clerk SDK to `AuthGateway` interface |
| **Strategy (GoF)** | `AuthGateway` interface allows swapping auth providers in tests |

---

## Clean Architecture Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS & DRIVERS                                  │
│  app/, lib/, db/ — Next.js, Drizzle, Clerk SDK                          │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    INTERFACE ADAPTERS                              │  │
│  │  src/adapters/gateways/clerk-auth-gateway.ts                      │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    USE CASES                                 │  │  │
│  │  │  (None in this slice - infrastructure only)                 │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐    │  │  │
│  │  │  │                    ENTITIES                          │    │  │  │
│  │  │  │  src/domain/entities/user.ts                        │    │  │  │
│  │  │  │  src/domain/value-objects/subscription-status.ts    │    │  │  │
│  │  │  └─────────────────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Test-First Specification

### Phase 1: Unit Tests (Write FIRST)

#### File: `src/domain/value-objects/subscription-status.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { isEntitledStatus, EntitledStatuses, type SubscriptionStatus } from './subscription-status';

describe('isEntitledStatus', () => {
  it('returns true for "active" status', () => {
    expect(isEntitledStatus('active')).toBe(true);
  });

  it('returns true for "trialing" status', () => {
    expect(isEntitledStatus('trialing')).toBe(true);
  });

  it('returns false for "canceled" status', () => {
    expect(isEntitledStatus('canceled')).toBe(false);
  });

  it('returns false for "past_due" status', () => {
    expect(isEntitledStatus('past_due')).toBe(false);
  });

  it('returns false for "unpaid" status', () => {
    expect(isEntitledStatus('unpaid')).toBe(false);
  });

  it('returns false for "paused" status', () => {
    expect(isEntitledStatus('paused')).toBe(false);
  });
});

describe('EntitledStatuses', () => {
  it('contains only active and trialing', () => {
    expect(EntitledStatuses).toEqual(['active', 'trialing']);
  });
});
```

#### File: `src/domain/entities/user.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createUser, type User } from './user';

describe('User entity', () => {
  it('creates user with required fields', () => {
    const user = createUser({
      id: 'uuid-123',
      clerkUserId: 'clerk_abc',
      email: 'test@example.com',
    });

    expect(user.id).toBe('uuid-123');
    expect(user.clerkUserId).toBe('clerk_abc');
    expect(user.email).toBe('test@example.com');
  });

  it('validates email format', () => {
    expect(() => createUser({
      id: 'uuid-123',
      clerkUserId: 'clerk_abc',
      email: 'invalid-email',
    })).toThrow();
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/db.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { users, stripeSubscriptions, questions, choices, attempts } from '@/db/schema';
import { sql } from 'drizzle-orm';

describe('Database Integration', () => {
  beforeAll(async () => {
    // Verify connection
    await db.execute(sql`SELECT 1`);
  });

  describe('schema tables exist', () => {
    it('users table exists with correct columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users'
      `);

      const columns = result.rows.map((r: any) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('clerk_user_id');
      expect(columns).toContain('email');
      expect(columns).toContain('created_at');
    });

    it('stripe_subscriptions table exists', async () => {
      const result = await db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'stripe_subscriptions'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('questions table exists', async () => {
      const result = await db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'questions'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('attempts table exists', async () => {
      const result = await db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'attempts'
      `);
      expect(result.rows.length).toBe(1);
    });
  });

  describe('enums exist', () => {
    it('question_difficulty enum exists', async () => {
      const result = await db.execute(sql`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = 'question_difficulty'::regtype
      `);
      const values = result.rows.map((r: any) => r.enumlabel);
      expect(values).toContain('easy');
      expect(values).toContain('medium');
      expect(values).toContain('hard');
    });

    it('practice_mode enum exists', async () => {
      const result = await db.execute(sql`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = 'practice_mode'::regtype
      `);
      const values = result.rows.map((r: any) => r.enumlabel);
      expect(values).toContain('tutor');
      expect(values).toContain('exam');
    });
  });

  describe('pgcrypto extension', () => {
    it('gen_random_uuid() works', async () => {
      const result = await db.execute(sql`SELECT gen_random_uuid() as uuid`);
      expect(result.rows[0].uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('health endpoint returns success', async ({ request }) => {
    const response = await request.post('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(body.timestamp).toBeDefined();
  });

  test('sign-in page renders', async ({ page }) => {
    await page.goto('/sign-in');

    // Clerk sign-in component should be visible
    await expect(page.locator('.cl-rootBox')).toBeVisible({ timeout: 10000 });
  });

  test('sign-up page renders', async ({ page }) => {
    await page.goto('/sign-up');

    await expect(page.locator('.cl-rootBox')).toBeVisible({ timeout: 10000 });
  });

  test('unauthenticated user redirected from protected routes', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Should redirect to sign-in
    await expect(page).toHaveURL(/sign-in/);
  });

  test('homepage has sign-in link', async ({ page }) => {
    await page.goto('/');

    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toBeVisible();
  });
});
```

---

## Implementation Checklist

Execute in exact order. Each step must pass quality gates.

### Step 1: Domain Layer — Value Objects

**File:** `src/domain/value-objects/subscription-status.ts`

```typescript
/**
 * Stripe subscription statuses
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export const EntitledStatuses: readonly SubscriptionStatus[] = ['active', 'trialing'] as const;

export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return EntitledStatuses.includes(status);
}
```

**File:** `src/domain/value-objects/index.ts`

```typescript
export * from './subscription-status';
```

### Step 2: Domain Layer — Entities

**File:** `src/domain/entities/user.ts`

```typescript
export type User = {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateUserInput = {
  id: string;
  clerkUserId: string;
  email: string;
};

export function createUser(input: CreateUserInput): User {
  if (!EMAIL_REGEX.test(input.email)) {
    throw new Error(`Invalid email format: ${input.email}`);
  }

  return {
    id: input.id,
    clerkUserId: input.clerkUserId,
    email: input.email,
  };
}
```

**File:** `src/domain/entities/index.ts`

```typescript
export * from './user';
```

**File:** `src/domain/index.ts`

```typescript
export * from './entities';
export * from './value-objects';
```

### Step 3: Application Layer — Ports

**File:** `src/application/ports/gateways.ts`

```typescript
import type { User } from '@/src/domain/entities/user';

/**
 * Authentication gateway interface
 * Implemented by ClerkAuthGateway in adapters layer
 */
export interface AuthGateway {
  /**
   * Get current authenticated user or null
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Get current user or throw if not authenticated
   * @throws ApplicationError with code UNAUTHENTICATED
   */
  requireUser(): Promise<User>;

  /**
   * Get Clerk user ID from current session
   */
  getClerkUserId(): Promise<string | null>;
}
```

**File:** `src/application/ports/repositories.ts`

```typescript
import type { User } from '@/src/domain/entities/user';

/**
 * User repository interface
 * Implemented by DrizzleUserRepository in adapters layer
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByClerkId(clerkUserId: string): Promise<User | null>;
  upsertByClerkId(clerkUserId: string, email: string): Promise<User>;
}
```

**File:** `src/application/ports/index.ts`

```typescript
export * from './gateways';
export * from './repositories';
```

**File:** `src/application/index.ts`

```typescript
export * from './ports';
```

### Step 4: Adapters Layer — Gateways

**File:** `src/adapters/gateways/clerk-auth-gateway.ts`

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { User } from '@/src/domain/entities/user';
import { getUserRepository } from '@/lib/container';

/**
 * Clerk implementation of AuthGateway
 * Adapts Clerk SDK to our domain interface
 */
export class ClerkAuthGateway implements AuthGateway {
  async getClerkUserId(): Promise<string | null> {
    const { userId } = await auth();
    return userId;
  }

  async getCurrentUser(): Promise<User | null> {
    const clerkUserId = await this.getClerkUserId();
    if (!clerkUserId) return null;

    const userRepo = getUserRepository();
    return userRepo.findByClerkId(clerkUserId);
  }

  async requireUser(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('UNAUTHENTICATED: User not found');
    }
    return user;
  }
}
```

**File:** `src/adapters/gateways/index.ts`

```typescript
export * from './clerk-auth-gateway';
```

**File:** `src/adapters/index.ts`

```typescript
export * from './gateways';
```

### Step 5: Frameworks Layer — Container (Composition Root)

**File:** `lib/container.ts`

```typescript
import 'server-only';
import { ClerkAuthGateway } from '@/src/adapters/gateways/clerk-auth-gateway';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { UserRepository } from '@/src/application/ports/repositories';

// Singleton instances
let authGateway: AuthGateway | null = null;
let userRepository: UserRepository | null = null;

/**
 * Get AuthGateway singleton
 */
export function getAuthGateway(): AuthGateway {
  if (!authGateway) {
    authGateway = new ClerkAuthGateway();
  }
  return authGateway;
}

/**
 * Get UserRepository singleton
 * Implementation injected after adapters layer is created
 */
export function getUserRepository(): UserRepository {
  if (!userRepository) {
    // Lazy import to avoid circular dependencies
    const { DrizzleUserRepository } = require('@/src/adapters/repositories/drizzle-user-repository');
    userRepository = new DrizzleUserRepository();
  }
  return userRepository;
}

/**
 * Reset singletons (for testing)
 */
export function resetContainer(): void {
  authGateway = null;
  userRepository = null;
}
```

### Step 6: Frameworks Layer — Environment Validation

**File:** `lib/env.ts`

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();
```

### Step 7: Frameworks Layer — Database Client

**File:** `lib/db.ts`

```typescript
import 'server-only';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '@/db/schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
```

### Step 8: API Health Route

**File:** `app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST() {
  try {
    // Verify database connectivity
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      ok: true,
      db: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Database connection failed' },
      { status: 500 }
    );
  }
}
```

### Step 9: Clerk Middleware

**File:** `proxy.ts`

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/stripe/webhook',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### Step 10: GitHub Actions CI

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: naltrexone_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s
          --health-timeout=5s
          --health-retries=10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/naltrexone_test
      CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm tsc --noEmit
        name: Type check

      - run: pnpm biome check .
        name: Lint

      - run: pnpm db:migrate
        name: Migrate DB

      - run: pnpm test
        name: Unit tests

      - run: pnpm test:integration
        name: Integration tests

      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - run: pnpm exec playwright install --with-deps
        name: Install Playwright

      - run: pnpm test:e2e
        name: E2E tests
```

---

## Quality Gates

```bash
# All must pass before proceeding
pnpm tsc --noEmit
pnpm biome check .
pnpm test src/domain/
pnpm test:integration tests/integration/db.integration.test.ts
pnpm test:e2e tests/e2e/auth.spec.ts
```

---

## Definition of Done

- [ ] Domain layer created with zero external imports
- [ ] Application ports define gateway and repository interfaces
- [ ] ClerkAuthGateway implements AuthGateway interface
- [ ] Container wires dependencies via factory functions
- [ ] Environment variables validated with Zod
- [ ] Health endpoint returns `{ ok: true, db: true }`
- [ ] Clerk middleware protects `/app/*` routes
- [ ] CI pipeline passes all checks
- [ ] Vercel preview deployment works

---

## Files Checklist

### Create
- [ ] `src/domain/value-objects/subscription-status.ts`
- [ ] `src/domain/value-objects/subscription-status.test.ts`
- [ ] `src/domain/value-objects/index.ts`
- [ ] `src/domain/entities/user.ts`
- [ ] `src/domain/entities/user.test.ts`
- [ ] `src/domain/entities/index.ts`
- [ ] `src/domain/index.ts`
- [ ] `src/application/ports/gateways.ts`
- [ ] `src/application/ports/repositories.ts`
- [ ] `src/application/ports/index.ts`
- [ ] `src/application/index.ts`
- [ ] `src/adapters/gateways/clerk-auth-gateway.ts`
- [ ] `src/adapters/gateways/index.ts`
- [ ] `src/adapters/index.ts`
- [ ] `lib/container.ts`
- [ ] `lib/env.ts`
- [ ] `lib/db.ts`
- [ ] `app/api/health/route.ts`
- [ ] `proxy.ts`
- [ ] `.github/workflows/ci.yml`
- [ ] `tests/integration/db.integration.test.ts`
- [ ] `tests/e2e/auth.spec.ts`

### Modify
- [ ] `app/layout.tsx` (add ClerkProvider)
- [ ] `tsconfig.json` (add path aliases)
- [ ] `package.json` (add scripts)
