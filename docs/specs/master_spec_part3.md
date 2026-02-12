# Master Spec — Part 3: Content Pipeline, Directory Structure & Vertical Slices

> **This is Part 3 of the master spec, split for readability.**
> Covers: Content Pipeline (§5), Directory Structure (§6), Vertical Slice Specifications (§7).
>
> | Part | File | Sections | Theme |
> |------|------|----------|-------|
> | 1 | `master_spec_part1.md` | §1–3 | Overview, Architecture, Database Schema |
> | 2 | `master_spec_part2.md` | §4 | API & Server Actions |
> | **3 (this)** | `master_spec_part3.md` | §5–7 | Content Pipeline, Directory Structure, Vertical Slices |
> | 4 | `master_spec_part4.md` | §8–13 | Testing, Security, Env Vars, Deployment |
>
> **Canonical source:** [`master_spec.md`](./master_spec.md) (complete, unabridged)

---

## 5. Content Pipeline

### 5.1 MDX Question File Format (Exact)

* File extension: `.mdx`
* Location: `/content/questions/**/*.mdx`
* Frontmatter: YAML
* Body must contain exactly two H2 headings in this order:

  1. `## Stem`
  2. `## Explanation`

Everything under `## Stem` until `## Explanation` is the stem markdown. Everything after `## Explanation` is explanation markdown.

### 5.2 Frontmatter Schema (Exact)

Fields:

* `slug`: string, kebab-case, unique
* `difficulty`: `"easy" | "medium" | "hard"`
* `status`: `"draft" | "published" | "archived"`
* `tags`: array of objects `{ slug, name, kind }`
* `choices`: array of objects `{ label, text, correct }`

Rules:

* `choices` must contain **2–5** entries
* exactly **1** choice must have `correct: true`
* labels must be unique and match `^[A-E]$`

### 5.3 Example MDX File (Exact)

```mdx
---
slug: "buprenorphine-induction-precipitated-withdrawal"
difficulty: "medium"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "buprenorphine"
    name: "Buprenorphine"
    kind: "treatment"
  - slug: "withdrawal"
    name: "Withdrawal"
    kind: "topic"
choices:
  - label: "A"
    text: "Start buprenorphine immediately at a high dose to outcompete full agonists."
    correct: false
  - label: "B"
    text: "Wait until moderate withdrawal symptoms are present before starting buprenorphine."
    correct: true
  - label: "C"
    text: "Use naltrexone first, then transition to buprenorphine within 1 hour."
    correct: false
  - label: "D"
    text: "Add a benzodiazepine and continue full agonist opioids until symptoms resolve."
    correct: false
---

## Stem

A 34-year-old patient with opioid use disorder using fentanyl daily requests buprenorphine. They last used fentanyl 6 hours ago and have mild rhinorrhea but no objective withdrawal. What is the best next step to reduce the risk of precipitated withdrawal?

## Explanation

Buprenorphine is a partial agonist with high receptor affinity. Starting too early can displace full agonists and precipitate withdrawal. Initiation is safest when the patient is in **moderate** withdrawal (e.g., higher COWS score), or via a micro-induction protocol (not covered in this question).
```

### 5.4 Zod Schemas (Exact)

```ts
// lib/content/schemas.ts
import { z } from 'zod';

export const ChoiceFrontmatterSchema = z.object({
  label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
  text: z.string().min(1),
  correct: z.boolean(),
}).strict();

export const TagFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  kind: z.enum(['domain', 'topic', 'substance', 'treatment', 'diagnosis']),
}).strict();

export const QuestionFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(TagFrontmatterSchema).max(50),
  choices: z.array(ChoiceFrontmatterSchema).min(2).max(5),
}).strict().superRefine((val, ctx) => {
  const correctCount = val.choices.filter((c) => c.correct).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choices must contain exactly 1 correct=true',
      path: ['choices'],
    });
  }
  const labelSet = new Set(val.choices.map((c) => c.label));
  if (labelSet.size !== val.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choice labels must be unique',
      path: ['choices'],
    });
  }

  const tagSlugSet = new Set(val.tags.map((t) => t.slug));
  if (tagSlugSet.size !== val.tags.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'tag slugs must be unique',
      path: ['tags'],
    });
  }
});

export const FullQuestionSchema = z.object({
  frontmatter: QuestionFrontmatterSchema,
  stemMd: z.string().min(1),
  explanationMd: z.string().min(1),
}).strict();
```

### 5.5 Seed Script (Required)

* Entry point: `/scripts/seed.ts`
* Command: `pnpm db:seed`
* Libraries:

  * `fast-glob` (glob files)
  * `gray-matter` (parse frontmatter)
  * Node `crypto` (sha256)
  * Drizzle for DB writes

#### Content hash for change detection (Exact)

* Compute `fileHash = sha256(canonicalJsonString(fullQuestion))`
* Compute `dbHash = sha256(canonicalJsonString(dbRepresentation))`

  * dbRepresentation includes:

    * question.slug, stem_md, explanation_md, difficulty, status
    * choices: label, text_md, is_correct, sort_order
    * tags: slug, name, kind (sorted by slug)
* If hashes match: skip update (no writes)

#### Seed Script Pseudocode (Exact)

```ts
// scripts/seed.ts (pseudocode)
load env (DATABASE_URL)

connect drizzle db

files = glob("/content/questions/**/*.mdx")

for each file in files:
  raw = readFile(file)
  { data, content } = grayMatter(raw)

  frontmatter = QuestionFrontmatterSchema.parse(data)

  // split content into Stem + Explanation
  // REQUIRE exact headings in this order
  stemMd = extractBetween(content, "## Stem", "## Explanation")
  explanationMd = extractAfter(content, "## Explanation")

  full = FullQuestionSchema.parse({ frontmatter, stemMd, explanationMd })

  fileHash = sha256(canonicalJson(full))

  // find existing question by slug
  existingQuestion = select questions where slug = frontmatter.slug

  if exists:
    existingChoices = select choices where question_id = existingQuestion.id order by sort_order asc
    existingTags = select tags join question_tags where question_id = existingQuestion.id order by tags.slug asc

    dbRep = buildCanonicalDbRep(existingQuestion, existingChoices, existingTags)
    dbHash = sha256(canonicalJson(dbRep))

    if dbHash == fileHash:
      continue

    transaction:
      update questions set stem_md, explanation_md, difficulty, status, updated_at=now where id=...
      delete from choices where question_id=...
      insert choices (question_id, label, text_md, is_correct, sort_order)
      delete from question_tags where question_id=...
      for each tag in frontmatter.tags:
        upsert tags by slug; if slug exists but name/kind mismatch => throw (hard error)
      insert question_tags (question_id, tag_id)
  else:
    transaction:
      insert into questions (...)
      insert choices
      upsert tags and insert question_tags

print summary: inserted/updated/skipped counts
exit 0
```

Canonical JSON rules (Exact):

* keys sorted alphabetically
* arrays sorted:

  * tags by `slug`
  * choices by `label`
* newline normalization: `\r\n` → `\n`
* trim trailing whitespace on each line

---

## 6. Directory Structure

> **Authoritative Source:** This structure follows **ADR-012: Directory Structure** which implements Robert C. Martin's Clean Architecture. See [docs/adr/adr-012-directory-structure.md](../adr/adr-012-directory-structure.md) for complete rationale.

### Clean Architecture Layer Mapping

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS & DRIVERS (Outermost)                     │
│  app/, components/, lib/, db/ — Next.js, React, Drizzle, External SDKs  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    INTERFACE ADAPTERS                             │  │
│  │  src/adapters/ — Repositories, Gateways, Controllers              │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    USE CASES                                │  │  │
│  │  │  src/application/ — Use Case classes, Port interfaces       │  │  │
│  │  │                                                             │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐    │  │  │
│  │  │  │                    ENTITIES (Core)                  │    │  │  │
│  │  │  │  src/domain/ — Entities, Value Objects, Services    │    │  │  │
│  │  │  │  ZERO external dependencies                         │    │  │  │
│  │  │  └─────────────────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**The Dependency Rule:** Dependencies point inward ONLY. Inner layers know nothing about outer layers.

### Directory Tree (Boundary-Level)

This master spec documents the directory structure at the directory-boundary level to avoid drift as files are refactored. For file-level indexes, prefer:

* `docs/specs/index.md`
* `docs/adr/index.md`
* `docs/practice-engine/index.md`

```text
/
├── app/                              # Frameworks layer (Next.js App Router)
│   ├── (marketing)/                  # Marketing pages
│   ├── (app)/app/                    # Entitled app shell + core routes
│   │   ├── dashboard/
│   │   ├── practice/
│   │   │   ├── [sessionId]/          # Session runner (tutor/exam)
│   │   │   └── quick/                # Quick Practice (ad-hoc question flow)
│   │   ├── history/                  # History (Sessions + Questions tabs — SPEC-021)
│   │   ├── questions/
│   │   │   └── [slug]/               # Question detail page (attempt + review mode — SPEC-023)
│   │   ├── bookmarks/
│   │   ├── billing/
│   │   └── shared/                   # Shared components (SessionBreakdownList, etc.)
│   └── api/                          # Route handlers (webhooks, health, cron)
│
├── src/                              # Clean Architecture layers
│   ├── domain/                       # Entities, value objects, services (pure)
│   ├── application/                  # Use cases + ports (interfaces)
│   │   ├── ports/                    # Port-per-module + barrels (ports/index.ts, ports/repositories.ts)
│   │   ├── use-cases/
│   │   ├── errors/
│   │   └── test-helpers/
│   │       └── fakes/                # Canonical fakes for unit/controller tests
│   └── adapters/                     # Controllers, repositories, gateways
│       ├── controllers/              # Server actions + controller helpers
│       ├── repositories/             # Drizzle implementations + mappers
│       ├── gateways/                 # Clerk/Stripe + rate limiter implementations
│       └── shared/                   # Adapter-only helpers (idempotency, rate limits, DB types)
│
├── components/                       # Frameworks layer (React components)
├── lib/                              # Frameworks layer (Infrastructure)
├── db/                               # Frameworks layer (Database)
├── content/                          # Static content (MDX questions)
├── scripts/
└── tests/                            # Integration + E2E tests
```

### Import Rules (Enforced by Architecture)

```typescript
// ✅ ALLOWED: Inner layers importing from inner layers
// src/application/use-cases/submit-answer.ts
import { gradeAnswer } from '@/src/domain/services/grading';

// ✅ ALLOWED: Adapters importing from application/domain
// src/adapters/controllers/question-controller.ts
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';

// ✅ ALLOWED: Frameworks importing from adapters
// app/(app)/app/practice/page.tsx
import { submitAnswer } from '@/src/adapters/controllers/question-controller';

// ❌ FORBIDDEN: Domain importing from outer layers
// src/domain/services/grading.ts
import { db } from '@/lib/db';  // ERROR! Domain cannot import frameworks
```

### Key Architectural Points

1. **Server Actions are Controllers** — They live in `src/adapters/controllers/`, NOT in `app/_actions/`
2. **Composition Root** — All dependency wiring in `lib/container.ts`
3. **Domain has ZERO imports** — No framework code, no database, no external services
4. **Unit tests colocated** — `*.test.ts` next to source in domain/application
5. **Integration/E2E centralized** — In `/tests/` directory

---

## 7. Vertical Slice Specifications

### SLICE-0: Foundation

**Slice ID:** SLICE-0

**User Story:**
As a user, I can load the site, sign up/sign in, and access the deployed app so that the platform is ready for paid features and content.

**Acceptance Criteria (Given/When/Then):**

* Given I visit `/`, when the page loads, then I see a marketing homepage with links to Pricing and Sign In.
* Given I visit `/sign-up`, when I create an account, then I am authenticated via Clerk and redirected to `/pricing`.
* Given the app is deployed to Vercel, when I open the production URL, then the health endpoint returns 200.

**Test Cases (file names + descriptions):**

* `tests/integration/db.integration.test.ts`: applies migrations against test Postgres and verifies tables exist.
* `tests/e2e/core-app-pages.spec.ts`: signs in via Clerk, ensures subscription, and verifies core app page navigation (Dashboard/Billing/Bookmarks/History), including legacy redirect behavior.

**Implementation Checklist (ordered):**

1. Create Next.js 16+ app with App Router and TypeScript strict mode.
   Next.js 16 requires Node.js 20.9+ and TypeScript 5.1+. ([Next.js][3])
2. **Use pnpm as the package manager.** pnpm provides better dependency isolation (prevents phantom dependencies), uses 70% less disk space than npm, and is 3x faster. Remove any `package-lock.json` and use only `pnpm-lock.yaml`.
3. Install Tailwind CSS v4 and configure PostCSS using `@tailwindcss/postcss`; add `@import "tailwindcss";` to `app/globals.css`. ([Tailwind CSS][4])
4. Install shadcn/ui and generate required base components (Button, Card, Badge, Dialog, Tabs, DropdownMenu, Separator).
5. **Install Biome for linting and formatting.** Biome is 10-100x faster than ESLint+Prettier and provides both linting and formatting in a single tool with one config file (`biome.json`). Next.js 16 removed `next lint`, so Biome is the modern replacement. ([Biome][9])
6. Install Drizzle ORM + drizzle-kit and configure migrations output to `/db/migrations`.
7. Add Neon Postgres connection via `DATABASE_URL`.
8. Add Clerk integration:

   * Add `<ClerkProvider>` in `app/layout.tsx`
   * Add Clerk routes for sign-in/up
   * Add Clerk middleware/proxy file (Next.js 16 uses `proxy.ts` naming per Clerk docs). ([Clerk][5])
9. Add `/api/health` route handler.
10. Add GitHub Actions CI (typecheck, lint, tests).
11. Connect repo to Vercel (preview deployments on PR; production on main).

**Files to Create/Modify:**

* `proxy.ts` (Clerk middleware/proxy)
* `app/layout.tsx`, `app/globals.css`
* `app/(marketing)/*` basic pages
* `app/api/health/route.ts`
* `db/schema.ts`
* `drizzle.config.ts`
* `lib/env.ts`, `lib/db.ts`, `lib/container.ts`
* `src/domain/` — Entity types, value objects, domain services
* `src/application/ports/` — Repository and gateway interfaces
* `src/adapters/gateways/clerk-auth-gateway.ts` — AuthGateway implementation
* `biome.json` (Biome linting + formatting config)
* `.github/workflows/ci.yml`
* `playwright.config.ts`, `vitest.config.ts`

**Database Migrations needed:**

* `0000_init.sql`:

  * `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  * create enums
  * create all tables + indexes from Section 3

**Environment Variables needed:**

* `DATABASE_URL`
* `CLERK_SECRET_KEY`
* `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
* `NEXT_PUBLIC_APP_URL`

**Definition of Done:**

* `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:e2e` all pass locally
* CI passes on PR
* Vercel preview deploy works
* `/api/health` returns `{ ok: true, db: true, ... }`

---

### SLICE-1: Paywall

**Slice ID:** SLICE-1

**User Story:**
As a user, I can subscribe and manage billing so that I can access the question bank.

**Acceptance Criteria:**

* Given I am logged in, when I click "Subscribe Monthly/Annual" on `/pricing`, then I'm redirected to Stripe Checkout.
* Given I complete payment, when I return to `/checkout/success`, then my subscription is active in the DB and I can access `/app/dashboard`.
* Given I am subscribed, when I open `/app/billing`, then I can open Stripe Customer Portal.
* Given my subscription is canceled/deleted, when webhooks arrive, then my entitlement is removed and `/app/*` redirects to `/pricing`.

**Test Cases:**

* `tests/integration/actions.stripe.integration.test.ts`: verify Stripe checkout session creation (Stripe mocked).
* `tests/e2e/subscribe.spec.ts`: end-to-end checkout in Stripe test mode using test card 4242. ([Stripe Docs][6])

**Implementation Checklist:**

1. Create Stripe products/prices (Section 11).
2. Add Stripe SDK initialization in `lib/stripe.ts`.
3. Implement server actions: `createCheckoutSession`, `createPortalSession`.
4. Implement webhook handler `/api/stripe/webhook` with signature verification and idempotency.
5. Implement `/checkout/success` page:

   * reads `session_id`
   * fetches Checkout Session from Stripe
   * syncs subscription/customer into DB (same logic as webhook; idempotent)
   * redirects to `/app/dashboard`
6. Implement subscription enforcement in `app/(app)/app/layout.tsx` server component:

   * if not entitled: redirect to `/pricing`
7. Build `/app/billing` page showing status + portal link.

**Files to Create/Modify:**

* `app/api/stripe/webhook/route.ts`
* `src/adapters/controllers/billing-controller.ts` — createCheckoutSession, createPortalSession
* `src/adapters/gateways/stripe-payment-gateway.ts` — PaymentGateway implementation
* `src/adapters/repositories/drizzle-subscription-repository.ts`
* `src/application/use-cases/create-checkout-session.ts`
* `src/application/use-cases/create-portal-session.ts`
* `src/application/use-cases/check-entitlement.ts`
* `src/domain/services/entitlement.ts` — isEntitled() pure function
* `app/(marketing)/checkout/success/page.tsx`
* `app/(app)/app/layout.tsx` (subscription gate)
* `app/(app)/app/billing/page.tsx`
* `lib/stripe.ts`, `lib/container.ts` (updated)

**Database Migrations needed:** None (already created in SLICE-0).

**Environment Variables needed:**

* `STRIPE_SECRET_KEY`
* `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
* `STRIPE_WEBHOOK_SECRET`
* `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
* `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

**Definition of Done:**

* Webhook events update `stripe_customers` + `stripe_subscriptions`
* Unsubscribed users cannot access `/app/*`
* Subscribed users can access `/app/*`
* Customer Portal opens and returns to `/app/billing`

---

### SLICE-2: Core Question Loop

**Slice ID:** SLICE-2

**User Story:**
As a subscribed user, I can answer questions and see explanations so that I can learn and track performance.

**Acceptance Criteria:**

* Given I am subscribed, when I start practice and open a question, then I see a question stem and choices rendered as sanitized markdown.
* When I select an answer and submit, then I see correct/incorrect feedback and explanation (tutor mode).
* When I submit, then an `attempts` row is created.

> **Route note:** `/app/practice` is the practice landing page. Question answering happens in the session runner (`/app/practice/[sessionId]`). Ad-hoc practice lives at `/app/practice/quick` (SPEC-019 Phase 2).

**Test Cases:**

* `src/domain/services/grading.test.ts` (colocated): gradeAnswer() pure function tests
* `src/application/use-cases/submit-answer.test.ts` (colocated): use case with fake repositories
* `tests/integration/controllers.integration.test.ts`: submitAnswer inserts attempts and grades correctly.
* `tests/e2e/practice.spec.ts`: UI flow for answering one question.

**Implementation Checklist:**

1. Create `components/markdown/Markdown.tsx` with react-markdown + remark-gfm + rehype-sanitize.
2. Add seed script with 10 placeholder questions.
3. Build domain services: `src/domain/services/grading.ts` — gradeAnswer() pure function
4. Build use cases: `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`
5. Build repositories: `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
6. Build controllers: `src/adapters/controllers/question-controller.ts` — 'use server' exports
7. Build the question loop UI (stem + choices + submit + feedback) as reusable components (consumed by Practice Sessions and Quick Practice):

   * fetch next question via controller
   * select choice
   * submit and show explanation
8. Add bookmark toggle button on question view (calls toggleBookmark controller).

**Files to Create/Modify:**

* `scripts/seed.ts`
* `content/questions/general/*.mdx` (10 placeholder files)
* `components/markdown/Markdown.tsx`
* `components/question/*`
* `src/domain/entities/question.ts`, `choice.ts`, `attempt.ts`
* `src/domain/services/grading.ts` — gradeAnswer() pure function
* `src/application/ports/*.ts` (re-exported via `src/application/ports/repositories.ts`) — QuestionRepository, AttemptRepository interfaces
* `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`, `toggle-bookmark.ts`
* `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
* `src/adapters/controllers/question-controller.ts`, `bookmark-controller.ts`
* `lib/container.ts` (add new factories)
* `app/(app)/app/practice/page.tsx` (landing page; Quick Practice lives at `app/(app)/app/practice/quick/page.tsx` in SPEC-019 Phase 2)

**Migrations:** none

**Env vars:** none beyond prior slices

**Definition of Done:**

* Seed runs idempotently
* Markdown renders safely (no raw HTML injection)
* Attempts are recorded per submission

---

### SLICE-3: Practice Sessions

**Slice ID:** SLICE-3

**User Story:**
As a subscribed user, I can run a timed practice session with filters and get a summary so that I can simulate studying blocks.

**Acceptance Criteria:**

* Given I choose count/mode/tags, when I click Start, then a practice session is created.
* When I proceed through questions, the app shows progress (e.g., 3/20).
* In exam mode, I can mark/unmark questions for review.
* In exam mode, "End session" opens a review stage showing answered/unanswered/marked counts with jump-to-question.
* When I submit from review stage, I see score and total duration.
* In exam mode, explanations are hidden until the session ends.
* During active answering in exam mode, per-question UI status is neutral (`answered`/`unanswered`/`current`/`marked`) and MUST NOT reveal correctness before review/summary.
* Users can navigate to any question during active answering (back/jump), not only forward. (SPEC-020 Phase 2)
* Session summary shows per-question breakdown alongside aggregate totals. (SPEC-020 Phase 2)

**Test Cases:**

* `src/application/use-cases/get-next-question.test.ts`: session question order + completion semantics (including `fromIndex` and persisted session state).
* `tests/e2e/practice.spec.ts`: start session -> answer -> end -> summary.

**Implementation Checklist:**

1. Implement `startPracticeSession` and persist `questionIds` + `questionStates` in `params_json`.
2. Implement session runner route `/app/practice/[sessionId]`.
3. Implement review-stage actions: `getPracticeSessionReview`, `setPracticeSessionQuestionMark`.
4. Implement `endPracticeSession` finalization using latest per-question session state.
5. Enforce exam-mode explanation gating.

**Files to Create/Modify:**

* `src/domain/entities/practice-session.ts`
* `src/domain/services/session.ts` — computeSessionProgress(), shouldShowExplanation()
* `src/domain/services/shuffle.ts` — shuffleWithSeed() for deterministic question selection
* `src/application/use-cases/start-practice-session.ts`, `end-practice-session.ts`
* `src/adapters/repositories/drizzle-practice-session-repository.ts`
* `src/adapters/controllers/practice-controller.ts`, `tag-controller.ts` — 'use server' exports
* `app/(app)/app/practice/[sessionId]/page.tsx`
* `components/question/*` (progress display + exam/tutor behaviors)
* `lib/container.ts` (add session factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Sessions create and complete reliably
* Exam review stage + mark-for-review flow is correct and persisted
* Exam vs tutor behavior is correct and tested

---

### SLICE-4: Review and Bookmarks

**Slice ID:** SLICE-4

**User Story:**
As a subscribed user, I can review missed questions and bookmarked questions so that I can focus on weak areas.

**Acceptance Criteria:**

* History Questions tab shows attempted questions with filters for correct/incorrect and session source.
* Bookmark toggle persists; bookmarks page lists bookmarked questions.
* From History or bookmarks list, I can open a question to reattempt or review a previous attempt.

**Test Cases:**

* `src/application/use-cases/get-attempted-questions.test.ts`: attempted questions query logic (result + source filters, ordering).
* `tests/integration/controllers.integration.test.ts`: attempted questions controller integration, including missing-question behavior.
* `tests/e2e/history.spec.ts` and `tests/e2e/bookmarks.spec.ts`.

**Implementation Checklist:**

1. Implement `getAttemptedQuestions(limit, offset, result?, source?)`.
2. Build `/app/history` with Sessions and Questions tabs (SPEC-021).
3. Build `/app/bookmarks`.
4. Add question detail view: open question from list and submit answer or review previous attempt.

**Files to Create/Modify:**

* `src/application/use-cases/get-attempted-questions.ts`, `get-bookmarks.ts`
* `src/adapters/repositories/drizzle-bookmark-repository.ts`
* `src/adapters/controllers/review-controller.ts`, `bookmark-controller.ts`, `question-view-controller.ts` — 'use server' exports
* `app/(app)/app/history/page.tsx` — History page with Sessions/Questions tabs
* `app/(app)/app/bookmarks/page.tsx`
* `app/(app)/app/questions/[slug]/page.tsx` — question detail page (attempt + review mode)
* `components/question/*`
* `lib/container.ts` (add review/bookmark factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Missed and bookmarks lists are correct and stable
* Reattempt creates new attempts

---

### SLICE-5: Dashboard

**Slice ID:** SLICE-5

**User Story:**
As a subscribed user, I can see my stats and recent activity so that I can track progress.

**Acceptance Criteria:**

* Dashboard shows total answered, overall accuracy, last 7 days accuracy, current streak.
* Shows recent activity list.
* Recent activity groups attempts by session when session context exists. (SPEC-020 Phase 3)

**Test Cases:**

* `src/domain/services/statistics.test.ts` (colocated): computeAccuracy(), computeStreak() pure function tests
* `src/application/use-cases/get-user-stats.test.ts` (colocated): use case with fake repositories
* `tests/e2e/practice.spec.ts`: answering questions updates dashboard stats.

**Implementation Checklist:**

1. Build domain services: `src/domain/services/statistics.ts` — computeAccuracy(), computeStreak(), filterAttemptsInWindow()
2. Build use case: `src/application/use-cases/get-user-stats.ts`
3. Build controller: `src/adapters/controllers/stats-controller.ts` — 'use server' getUserStats export
4. Build `/app/dashboard` page with stat cards and recent list.

**Files to Create/Modify:**

* `src/domain/services/statistics.ts` — pure functions for accuracy/streak
* `src/application/use-cases/get-user-stats.ts`
* `src/adapters/controllers/stats-controller.ts` — 'use server' exports
* `app/(app)/app/dashboard/page.tsx`
* `lib/container.ts` (add stats factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Stats match DB ground truth
* Dashboard loads fast and renders server-side

---

[3]: https://nextjs.org/blog/next-16 "Next.js 16 | Next.js"
[4]: https://tailwindcss.com/docs/guides/nextjs "Install Tailwind CSS with Next.js - Tailwind CSS"
[5]: https://clerk.com/docs/nextjs/getting-started/quickstart "Next.js Quickstart (App Router) - Next.js | Clerk Docs"
[6]: https://docs.stripe.com/testing?utm_source=chatgpt.com "Test card numbers"
[9]: https://biomejs.dev/ "Biome - One toolchain for your web project"
