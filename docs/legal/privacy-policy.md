# Privacy Policy — authored draft

> **STATUS: DRAFT — NOT PUBLISHED.** This is the working copy for [DEBT-414](../debt/debt-414-public-legal-pages-privacy-terms.md).
> Every factual claim below was derived from the codebase at `b159e058` (schema, Sentry config, dependency list, retention constants) rather than from a template, and is checkable — see *Provenance* at the end.
> Owner decision on record (2026-07-28): drafted in-house from primary sources rather than blocking on counsel, on the basis that the product is pre-revenue with no active users. **Have this reviewed by a lawyer before spending money on user acquisition** — that is the same trigger as LLC formation and the published mailing address.
> When published, this text moves into `app/(marketing)/privacy/privacy-content.ts` per the DEBT-414 implementation spec.

---

## Privacy Policy

**Last updated: [PUBLICATION DATE]**

### The short version

Addiction Boards is a board-exam question bank. To run it we need your email address and a record of the questions you have practised. We do not run analytics, we do not use advertising or tracking pixels, we do not record your screen, and **we do not sell or share your personal information — ever, for any price.** We never see your card number. If you delete your account, your data is deleted with it.

The rest of this page is the detail behind those sentences.

### Who we are

Addiction Boards (the "Service", at `addictionboards.com`) is operated by **John H. Jung, MD, MS**, a sole proprietor based in New York ("we", "us", "our").

Contact for any privacy question or request: **support@addictionboards.com**

### What we collect

We collect only what the Service needs to function. Categories are labelled to match the California Consumer Privacy Act's statutory categories so you can compare this policy against the law directly.

| What | Examples | CCPA category |
|---|---|---|
| **Account information** | Your email address; an internal account identifier; the identifier assigned by our authentication provider; account creation and update times | Identifiers; customer records |
| **Subscription information** | Your subscription status, plan, billing-period end date, whether a cancellation is scheduled, and the customer and subscription identifiers assigned by our payment processor | Identifiers; commercial information |
| **Practice activity** | Practice sessions you start (mode, question count, any topic or difficulty filters); which questions you were shown; the answers you selected; whether each answer was correct; questions you marked for review; time spent per question; your bookmarks; and performance statistics derived from that activity | Internet or other electronic network activity information |
| **Feedback you choose to send** | Whether you rated a question helpful or not helpful; the category you select when reporting a question; and any free-text comment you write | Internet or other electronic network activity information |
| **Technical and security data** | IP addresses recorded by rate-limiting on our public API and webhook endpoints; short-lived request records used to prevent duplicate operations; records of billing and account events received from our providers; error diagnostics | Identifiers |

**What we do not collect.** We do not collect your name, postal address, telephone number, date of birth, government identifiers, precise geolocation, biometric data, employment or education information, racial or ethnic origin, or any other category the CCPA treats as *sensitive personal information*. **We do not collect, request, or want any patient information, protected health information, or clinical records.** We are not a healthcare provider, we do not operate as a HIPAA business associate, and nothing in the Service is designed to hold patient data.

⚠️ **Please do not type personal or patient information into the feedback comment box.** It is a free-text field, and anything you write there is stored. Use it to tell us a question is wrong or unclear — nothing more.

**Payment card data: we never receive it.** Card numbers are collected directly by Stripe on their own systems. Our database stores only Stripe's identifiers and your subscription status. We could not disclose your card number if we tried; we do not have it.

### Where the information comes from

Directly from you (your email at sign-up, your answers, bookmarks, and feedback as you use the Service); automatically from your use of the Service (practice activity, technical and security data); and from our providers (our authentication provider confirms your account, and our payment processor tells us your subscription status through billing events).

### Why we use it

- **To provide the Service** — authenticate you, run practice sessions, save your answers and bookmarks, and show your progress and statistics.
- **To handle billing** — start and manage your subscription, apply your free trial, and give you access while your subscription is active.
- **To keep the Service working and secure** — diagnose errors, prevent abuse and duplicate charges, and enforce rate limits.
- **To improve the question bank** — read your question feedback and correct errors.
- **To communicate with you about the Service** — account, billing, and trial notices, sent on our behalf by our authentication and payment providers. We do not send marketing or promotional email. If that changes, this page will change first and any such email will carry an unsubscribe link.

We do not use your information for advertising, profiling, or automated decision-making that produces legal or similarly significant effects about you.

### Who we share it with

We share personal information only with service providers who process it on our behalf, under contract, for the purposes below. The 2026 CCPA regulations require us to state *which categories* each provider receives, so:

| Provider | What it does | Categories it receives |
|---|---|---|
| **Clerk** | Authentication and account management | Account information |
| **Stripe** | Payments, subscriptions, and billing (collects your card details directly) | Account information; subscription information; payment details you give Stripe directly |
| **Neon** | Database hosting — where the information described above is stored | All categories we store |
| **Vercel** | Application hosting and delivery; platform request logs | Technical and security data, including IP address |
| **Sentry** | Error monitoring and performance diagnostics | Technical and security data. Configured *not* to capture personal information, and session replay is disabled entirely. |
| **ImprovMX** | Email forwarding for `support@addictionboards.com` | Anything you choose to put in an email you send us |

We may also disclose information if legally required (valid legal process), or in connection with a sale or transfer of the business — in which case we will update this policy and the buyer remains bound by it.

### What we do not do

- **We do not sell your personal information**, and we do not share it for cross-context behavioural advertising. We never have. Because we do not, there is no "Do Not Sell or Share My Personal Information" mechanism to offer — but you may still exercise every other right below.
- **We run no analytics of any kind** — no Google Analytics, no product analytics, no heatmaps.
- **We use no advertising networks, tracking pixels, or third-party marketing cookies.**
- **We do not record your screen or session.** Session replay is switched off.
- **We do not use automated decision-making technology** to make decisions about you.

### Cookies

We set no cookies of our own. Our authentication provider sets cookies that are strictly necessary to keep you signed in and to protect your account. There are no advertising, analytics, or tracking cookies to consent to or opt out of. Blocking the authentication cookies will prevent you from signing in.

### How long we keep it

| Data | Retention |
|---|---|
| Account, subscription, practice activity, bookmarks, feedback | Until you delete your account (see below), after which it is deleted |
| IP addresses in rate-limit records | **Automatically deleted after 24 hours** |
| Duplicate-prevention request records | **Automatically deleted after 24 hours** |
| Billing and account event records | Retained as business records for accounting and dispute-resolution purposes |
| A record that an account was deleted | Retained indefinitely — this is only an identifier and a timestamp, kept so a deleted account is not accidentally recreated or re-processed |

### Your rights

We extend these rights to **every user, wherever you live** — not only to California residents. You have the right to:

- **Know and access** what personal information we hold about you, where it came from, why we use it, and who we share it with — including for periods going back to January 1, 2022.
- **Delete** your personal information.
- **Correct** inaccurate personal information.
- **Receive a copy** of your information in a portable format.
- **Not be discriminated against** for exercising any of these rights. We will not deny you service, charge you a different price, or give you a lesser experience because you asked.

Rights to opt out of sale or sharing, and to limit the use of sensitive personal information, do not apply here because we do neither.

### How to exercise your rights

**Email support@addictionboards.com.** That is the only step.

We operate exclusively online and deal with you directly, which under California's regulations means an email address is the required and sufficient channel — you do not have to find a form or call a phone number.

- We will **acknowledge your request within 10 business days** and **respond within 45 days**. If we genuinely need longer, we will tell you within that first 45 days and may take up to 45 more.
- **Verification:** we will ask you to send your request from the email address on your account, or otherwise confirm you control it. If we cannot verify you, we will say so rather than release someone's information to the wrong person.
- **Authorized agents:** an agent may submit a request for you with your written permission; we may still contact you to confirm.
- **Free of charge**, unless a request is manifestly unfounded or excessive, in which case we will explain before doing anything.

**Deleting your account** removes your account record and everything attached to it — your practice sessions, answers, bookmarks, feedback, and subscription records — because those records are linked to your account at the database level and are removed with it. Records we are required to keep for accounting purposes, and the deletion record described above, remain.

### Security

Your connection to the Service is encrypted in transit, and data is stored with our database provider's encryption at rest. Access to production systems is limited to the operator. Authentication is handled by a specialist provider rather than by us, and card data never reaches our systems at all.

No system is perfectly secure, and we will not claim otherwise. If a breach affects your personal information, we will notify you as required by applicable law.

### Where your information is processed

The Service is intended for users in the United States, and your information is processed in the United States. We do not direct the Service to the European Economic Area or the United Kingdom.

### Children

The Service is intended for medical professionals and trainees and is not directed at anyone under 18. We do not knowingly collect information from anyone under 18. If you believe a minor has given us information, email us and we will delete it.

### This is an educational product, not medical advice

Nothing in the Service is medical advice, and it is not a substitute for clinical judgement. See our [Terms of Service](/terms) for the full disclaimer.

### Changes to this policy

If we change this policy we will update the date at the top and, for material changes, notify you by email or in the app before the change takes effect. Our practices are described as they actually are; if we start doing something new — analytics, marketing email, a new provider — this page changes first.

### Contact

**support@addictionboards.com**

John H. Jung, MD, MS — sole proprietor, New York, United States

---

## Provenance — how each claim was verified

Kept so a future reviewer can re-check the policy against the code instead of trusting it. Re-verify these when the schema or dependencies change.

| Claim | Verified against |
|---|---|
| Only email is directly identifying; no name/phone/address/DOB | `db/schema.ts` — `users` table has `clerkUserId`, `email`, timestamps only |
| No card data stored | `db/schema.ts` — `stripe_customers` / `stripe_subscriptions` hold identifiers, status, `priceId`, period end only |
| Practice activity contents | `practice_sessions`, `practice_session_question_states`, `attempts`, `bookmarks` |
| Free-text feedback ≤ 2000 chars | `question_feedback.comment` + `question_feedback_comment_len_chk` |
| IP addresses collected | `rate_limits.key`, e.g. `health:${ip}` in `app/api/health/handler.ts`, `webhook:stripe:${ip}` in `app/api/stripe/webhook/handler.ts` |
| IP retention = 24h | `RATE_LIMIT_WINDOW_RETENTION_TARGET_MS = 1_440 * ONE_MINUTE_MS` in `src/adapters/gateways/drizzle-rate-limiter.ts` |
| Duplicate-prevention retention = 24h | `DEFAULT_TTL_MS = DAY_MS` in `src/adapters/shared/with-idempotency.ts` |
| Account deletion cascades | `onDelete: 'cascade'` on every `users.id` foreign key in `db/schema.ts` |
| Deletion record retained | `deleted_clerk_users` table |
| No analytics | `package.json` — no analytics, product-analytics, or tag-manager dependency |
| No session replay; no PII in Sentry | `sentry.client.config.ts` — `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`; `sendDefaultPii` set nowhere in the repo (defaults to false) |
| No first-party cookies | No `cookies()` / `document.cookie` writes in application code; only the auth provider sets cookies |
| Subprocessor list | Clerk, Stripe, Neon, Vercel, Sentry from `package.json` + deployment; ImprovMX added 2026-07-27 when `support@addictionboards.com` went live |

**Legal sources:** CCPA/CPRA (Cal. Civ. Code § 1798.100 *et seq.*) and the CPPA regulations effective 2026-01-01 — in particular the online-only/email-only request channel, the per-category service-provider disclosure, the 10-business-day acknowledgement and 45-day response, and the Right-to-Know look-back to 2022.
