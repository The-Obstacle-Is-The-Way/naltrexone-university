# Master Spec — Part 4: Testing, Security, Environment & Deployment

> **This is Part 4 of the master spec, split for readability.**
> Covers: Testing Strategy (§8), Security Checklist (§9), Environment Variables (§10), Stripe Setup (§11), Deployment Checklist (§12), Out of Scope (§13).
>
> | Part | File | Sections | Theme |
> |------|------|----------|-------|
> | 1 | `master_spec_part1.md` | §1–3 | Overview, Architecture, Database Schema |
> | 2 | `master_spec_part2.md` | §4 | API & Server Actions |
> | 3 | `master_spec_part3.md` | §5–7 | Content Pipeline, Directory Structure, Vertical Slices |
> | **4 (this)** | `master_spec_part4.md` | §8–13 | Testing, Security, Env Vars, Deployment |
>
> **Canonical source:** [`master_spec.md`](./master_spec.md) (complete, unabridged)

---

## 8. Testing Strategy

> **Authoritative Source:** This follows **ADR-003: Testing Strategy**. See [docs/adr/adr-003-testing-strategy.md](../adr/adr-003-testing-strategy.md) for full details.

### 8.1 Unit Tests (Vitest) — Domain + Use Cases

**Scope:** `src/domain/` and `src/application/`

**Philosophy:**

* Test **behavior**, not implementation
* **NO MOCKS** for domain tests — domain has zero dependencies
* Use **Fakes** (not mocks) for use case tests — fake implementations of repository interfaces
* 100% coverage target for domain services

**Naming + placement (mandatory):**

* `*.test.ts` colocated next to source (same folder as implementation)
* Example: `src/domain/services/grading.ts` → `src/domain/services/grading.test.ts`

**Example Domain Test (NO MOCKS):**

```typescript
// src/domain/services/grading.test.ts
import { gradeAnswer } from './grading';
import { createQuestion } from '../test-helpers/factories';

it('returns isCorrect=true when correct choice selected', () => {
  const question = createQuestion({
    choices: [
      { id: 'a', isCorrect: false },
      { id: 'b', isCorrect: true },
    ],
  });
  const result = gradeAnswer(question, 'b');
  expect(result.isCorrect).toBe(true);
});
```

**Example Use Case Test (with Fakes):**

```typescript
// src/application/use-cases/submit-answer.test.ts
import { SubmitAnswerUseCase } from './submit-answer';
import { FakeQuestionRepository, FakeAttemptRepository } from '../test-helpers/fakes';

it('records attempt when answer submitted', async () => {
  const questionRepo = new FakeQuestionRepository([question]);
  const attemptRepo = new FakeAttemptRepository();
  const useCase = new SubmitAnswerUseCase(questionRepo, attemptRepo);

  await useCase.execute({ userId: 'u1', questionId: 'q1', choiceId: 'c1' });

  expect(attemptRepo.savedAttempts).toHaveLength(1);
});
```

### 8.2 Integration Tests (Vitest + real Postgres)

**Scope:** `src/adapters/` — test real implementations against real DB

**Philosophy:**

* Test that adapters correctly implement interfaces
* Use **real database** (Postgres via Docker/CI service)
* Test repositories, gateways with actual external services (Stripe test mode)

**Naming:**

* `*.integration.test.ts` in `/tests/integration`

**Test DB:**

* GitHub Actions uses a Postgres service container and a `DATABASE_URL` pointing to it.

### 8.3 E2E Tests (Playwright)

**Critical paths:**

* signup/signin flow
* subscribe flow (Stripe test mode)
* practice session flow
* review flow
* bookmark flow

**Auth strategy (mandatory):**

* Use `@clerk/testing/playwright` global setup to generate stored auth state, then reuse it across tests. ([Clerk][7])

**Stripe test mode:**

* Use Stripe test card `4242 4242 4242 4242` with a future date (e.g., 12/34). ([Stripe Docs][6])

### 8.4 CI Pipeline (GitHub Actions)

> Next.js 16 removed `next lint`. Use **Biome** for linting and formatting. Locally we run `pnpm lint` (`biome check .`); in CI we run `pnpm lint:ci` (`biome ci .`). Biome is 10-100x faster than ESLint+Prettier and combines both tools into one. ([Biome][9])

**Workflow file:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 60

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: addiction_boards_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres -d addiction_boards_test"
          --health-interval=5s
          --health-timeout=5s
          --health-retries=10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/addiction_boards_test

      # App base URL used by redirects / Playwright baseURL
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000

      # Skip Clerk when secrets aren't available (fork PRs or secrets not configured).
      # Clerk requires real keys even during prerender; dummy values fail validation.
      NEXT_PUBLIC_SKIP_CLERK: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY == '' && 'true' || 'false' }}

      # Clerk (dev instance keys for CI E2E)
      # Fall back to dummy values so fork PRs can still run non-E2E jobs.
      CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY || 'sk_test_dummy' }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_dummy' }}

      # Stripe (test mode keys for CI)
      # Fall back to dummy values so fork PRs can still run non-E2E jobs.
      STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY || 'sk_test_dummy' }}
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy' }}
      STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET || 'whsec_dummy' }}
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: ${{ secrets.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY || 'price_dummy_monthly' }}
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: ${{ secrets.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL || 'price_dummy_annual' }}

      # Clerk E2E user creds (username/password auth enabled)
      E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
      E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.9.0
          run_install: false

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint and Format Check (Biome)
        run: pnpm lint:ci

      - name: Migrate DB
        run: pnpm db:migrate

      - name: Seed DB (placeholder content)
        run: pnpm db:seed

      - name: Unit tests
        run: pnpm test --run

      - name: Integration tests
        run: pnpm test:integration

      - name: Build
        run: pnpm build

      - name: Install Playwright browsers
        if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)
        run: pnpm exec playwright install --with-deps

      - name: E2E smoke
        if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)
        run: pnpm test:e2e

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v6
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 30
          if-no-files-found: ignore

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: [test]
    runs-on: ubuntu-24.04
    steps:
      - name: Trigger Vercel Production Deployment
        run: echo "Production deploy is handled by Vercel Git integration on main."
```

**Deployment behavior in CI (exact):**

* Vercel Git integration performs preview deploys on PR and production deploy on merge to main.
* The `deploy` job is a no-op sentinel ensuring main only deploys if tests pass.

---

## 9. Security Checklist (Mandatory)

* All **URL paths** under `/app/*`:

  * require Clerk authentication (server-enforced)
  * require active subscription (server-enforced in `/app/(app)/app/layout.tsx`)
* Clerk route protection is implemented via `proxy.ts` using `clerkMiddleware()` and route matching. ([Clerk][8])
* Stripe webhook:

  * signature verification using `constructEvent` is mandatory
  * handler runs in Node runtime
  * idempotent processing using `stripe_events`
* All user input:

  * validated with Zod before any DB/Stripe call
* Markdown rendering:

  * uses `react-markdown` + `remark-gfm`
  * sanitized via `rehype-sanitize` with explicit schema allowing tables/code/links only
* No raw SQL in application code:

  * only Drizzle query builder is allowed
  * migration SQL files are allowed for schema setup
* HTTPS enforced:

  * Vercel default HTTPS is required
* Environment variables:

  * never exposed to client unless prefixed with `NEXT_PUBLIC_`
  * validated at runtime via Zod in `lib/env.ts`

---

## 10. Environment Variables

> Variables marked ✅ MUST be present in that environment.
>
> Notes:
>
> - **CI** fork PRs (no secrets) may use dummy values for third-party keys. In that mode, set `NEXT_PUBLIC_SKIP_CLERK=true` so `next build` can prerender without real Clerk keys.
>   - `NEXT_PUBLIC_SKIP_CLERK=true` is blocked on Vercel production deploys (`VERCEL_ENV=production`) by `lib/env.ts`.
> - **E2E test credentials** are required only when running Playwright E2E (CI or local). Never set them in production.

| Variable                            | Description                                                                                                                 | Required in Dev | Required in CI | Required in Preview | Required in Prod |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------: | -------------: | ------------------: | ---------------: |
| DATABASE_URL                        | Neon Postgres connection string                                                                                             |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_SECRET_KEY                    | Clerk secret key (server)                                                                                                   |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   | Clerk publishable key (client)                                                                                              |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_WEBHOOK_SIGNING_SECRET        | Clerk webhook signing secret (Svix). Required to verify incoming Clerk webhooks.                                            |               — |            — |                   — |                ✅ |
| STRIPE_SECRET_KEY                   | Stripe secret key (server)                                                                                                  |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  | Stripe publishable key (client)                                                                                             |               ✅ |            ✅ |                   ✅ |                ✅ |
| STRIPE_WEBHOOK_SECRET               | Stripe webhook signing secret                                                                                               |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_APP_URL                 | Canonical base URL (e.g., [http://localhost:3000](http://localhost:3000), [https://yourdomain.com](https://yourdomain.com)) |               ✅ |            ✅ |                   ✅ |                ✅ |
| CRON_SECRET                         | Shared bearer secret for `/api/cron/reconcile-stripe-subscriptions`. Runtime validation currently enforces this on Vercel production deploys (`VERCEL_ENV=production`). |               — |            — |                   — |                ✅ |
| NEXT_PUBLIC_SKIP_CLERK              | Set to `true` to skip `ClerkProvider` during prerender/build (CI fork PRs without real keys). Forbidden on prod deploys (`VERCEL_ENV=production`). |               — |            — |                   — |                — |
| NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY | Stripe Price ID for $29/mo                                                                                                  |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL  | Stripe Price ID for $199/yr                                                                                                 |               ✅ |            ✅ |                   ✅ |                ✅ |
| E2E_CLERK_USER_USERNAME             | Clerk test user username for Playwright                                                                                     |               — |            ✅ |                   — |                — |
| E2E_CLERK_USER_PASSWORD             | Clerk test user password for Playwright                                                                                     |               — |            ✅ |                   — |                — |

---

## 11. Stripe Setup

### 11.1 Products / Prices (Exact)

Create in Stripe Dashboard (Test mode first, then Live mode):

1. Product: **Addiction Boards Pro Monthly**

   * Price: **$29.00**
   * Currency: USD
   * Billing: Recurring, every month
   * Copy the created Price ID into `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`

2. Product: **Addiction Boards Pro Annual**

   * Price: **$199.00**
   * Currency: USD
   * Billing: Recurring, every year
   * Copy the created Price ID into `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

### 11.2 Webhook Events (Exact)

Configure webhook endpoint:

* URL: `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
* Events (must match section 4.4.2):

  * `checkout.session.completed`
  * `checkout.session.expired`
  * `invoice.payment_failed`
  * `invoice.payment_succeeded`
  * `invoice.payment_action_required`
  * `customer.subscription.created`
  * `customer.subscription.updated`
  * `customer.subscription.deleted`
  * `customer.subscription.paused`
  * `customer.subscription.resumed`
  * `customer.subscription.trial_will_end`
  * `customer.subscription.pending_update_applied`
  * `customer.subscription.pending_update_expired`

### 11.3 Customer Portal Configuration (Exact)

Enable Stripe Customer Portal and configure:

* Allow customer to:

  * update payment method
  * view invoice history
  * cancel subscription
  * switch between Monthly and Annual plans (both directions)
* Set return URL: `${NEXT_PUBLIC_APP_URL}/app/billing`

---

## 12. Deployment Checklist (Ordered)

1. Create GitHub repo.
2. Initialize Next.js 16+ project with TypeScript strict and App Router.
3. Add Tailwind v4 + shadcn/ui base components. ([Tailwind CSS][4])
4. Create Neon Postgres via Vercel Marketplace and set `DATABASE_URL`.
5. Add Drizzle schema and run `pnpm db:migrate` to create tables (includes pgcrypto). ([Drizzle ORM][2])
6. Create Clerk application (dev + prod instances as needed):

   * Set env vars in Vercel (preview + prod)
   * Add `proxy.ts` with `clerkMiddleware()` route matching. ([Clerk][5])
7. Create Stripe products/prices in test mode; set env vars.
8. Implement Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
9. Implement pricing + checkout + success sync.
10. Implement subscription gate for `/app/*`.
11. Add seed script + placeholder questions; run `pnpm db:seed` in preview/prod once.
12. Add GitHub Actions workflow and ensure green on PR.
13. Connect repo to Vercel:

    * enable preview deploys
    * set production domain
14. Switch Stripe + Clerk to live mode keys for production.
15. Go-live verification:

    * `/api/health` returns 200
    * Sign up new user works
    * Subscription purchase works
    * Webhook delivers and subscription grants access
    * Customer portal works and returns to billing page
    * Practice flow works and attempts are recorded

---

## 13. Out of Scope for MVP (Explicit)

* **Admin UI for question authoring** — content is authored in MDX and seeded via script; admin UI adds large surface area and auth roles.
* **Spaced repetition algorithm** — requires scheduling, per-tag modeling, and more complex data structures; MVP focuses on straightforward practice/review.
* **Time spent tracking / pacing analytics** — MVP persists `attempts.time_spent_seconds = 0` and does not attempt to measure per-question timing.
* **AI-generated questions** — quality/safety and editorial control are MVP priorities; AI generation introduces validation risk.
* **Native mobile app** — web app is sufficient for initial market; mobile adds parallel build/test/deploy complexity.
* **Offline mode** — requires caching and conflict resolution; not needed for initial board prep workflow.
* **Team/institutional accounts** — adds org billing, seat management, and permissions; MVP is individual subscriptions only.
* **Leaderboards/social features** — not aligned with exam prep privacy and adds moderation complexity.
* **Advanced analytics** — MVP tracks core stats only; advanced cohort/psychometrics can come later.
* **Multiple exam types beyond Addiction Psych/Med** — focus ensures content quality and coherent tagging/blueprint mapping.

---

[2]: https://orm.drizzle.team/docs/migrate/components?utm_source=chatgpt.com "undefined - Drizzle ORM"
[4]: https://tailwindcss.com/docs/guides/nextjs "Install Tailwind CSS with Next.js - Tailwind CSS"
[5]: https://clerk.com/docs/nextjs/getting-started/quickstart "Next.js Quickstart (App Router) - Next.js | Clerk Docs"
[6]: https://docs.stripe.com/testing?utm_source=chatgpt.com "Test card numbers"
[7]: https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows "Test authenticated flows - Playwright | Clerk Docs"
[8]: https://clerk.com/docs/reference/nextjs/clerk-middleware "clerkMiddleware() | Next.js - Next.js - Next.js | Clerk Docs"
[9]: https://biomejs.dev/ "Biome - One toolchain for your web project"
