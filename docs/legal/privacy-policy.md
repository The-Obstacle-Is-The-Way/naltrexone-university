# Privacy Policy — authored draft

> **STATUS: DRAFT — NOT PUBLISHED.** This is the working copy for [DEBT-414](../debt/debt-414-public-legal-pages-privacy-terms.md).
> It was independently re-audited against the repository on 2026-07-29. The audit corrected unsupported absolute claims about retention, deletion, analytics, Sentry, payment information, cookies, security, and United States-only processing. See *Provenance and adversarial verification* below.
> Owner decision on record: draft in house while the product is pre-revenue with no active users, and obtain focused legal review before paid user acquisition.
> When the complete legal package is ready to publish, the public-policy portion of this file moves into `app/(marketing)/privacy/privacy-content.ts` per the DEBT-414 implementation spec. The provenance appendix remains an internal repository record.

---

## Privacy Policy

**Last updated: [PUBLICATION DATE]**

### The short version

Addiction Boards is a board-exam question bank. We use account, subscription, practice, feedback, and technical information to provide and secure the Service. We do not sell personal information or share it for cross-context behavioural advertising. We do not use advertising trackers or session replay. Full payment-card numbers are entered on Stripe-hosted pages and are not stored in the Addiction Boards application database.

Deleting an account removes the user record and the application records attached to it. Limited provider-event, deletion, security, support, payment, and legally required records can remain for the periods described below.

### Who we are

Addiction Boards (the "Service", at `addictionboards.com`) is operated by **John H. Jung, MD, MS**, a sole proprietor based in New York ("we", "us", "our").

Contact for any privacy question or request: **support@addictionboards.com**

### Information we collect

| Category | Examples |
|---|---|
| **Account information** | Email address; internal account identifier; authentication-provider identifier; account creation and update times |
| **Subscription and payment information** | Subscription status and plan; billing-period end; cancellation status; Stripe customer, subscription, checkout, and event identifiers. Payment-card and billing details are collected and held by Stripe on its own systems; the application itself does not receive or store them |
| **Practice activity** | Practice mode and filters; questions shown; answers and correctness; marked-for-review state; time per question; bookmarks; and performance statistics derived from that activity |
| **Feedback you choose to send** | Helpfulness rating; report category; and any free-text comment you write |
| **Technical, security, and diagnostic information** | IP address and rate-limit keys; request and provider-event identifiers; route or page context; browser, device, and request information available to hosting or error-monitoring providers; error messages and stack traces; duplicate-operation records |
| **Support correspondence** | The address, message, and other information you include when emailing `support@addictionboards.com` |

The application database's `users` table stores an email address and internal and Clerk identifiers, but that table is not the full data inventory. Other application tables store Stripe identifiers, activity, feedback, security records, and provider-event identifiers. Clerk, Stripe, Vercel, Sentry, Neon, ImprovMX, and the destination mailbox service identified before publication can process additional information in providing their services.

**Please do not enter personal or patient information in a question-feedback comment.** The field is free text and stores what you submit. The Service is not designed to receive patient information, protected health information, or clinical records.

**Payment information.** Stripe collects payment-card and billing information on Stripe-hosted pages. Addiction Boards does not store full card numbers in its application database. We and Stripe may retain payment, billing, and transaction information needed to administer subscriptions, prevent fraud, resolve disputes, and meet legal obligations.

### Where information comes from

Information comes directly from you; automatically from your use of the Service and requests to it; and from providers that authenticate accounts, host and monitor the Service, process payments, deliver provider events, host the database, and forward support email.

### Why we use information

- **Provide the Service** — authenticate you, run practice sessions, save answers and bookmarks, and show progress and statistics.
- **Administer subscriptions** — start and manage subscriptions and trials, process payment status, and control access.
- **Secure and operate the Service** — enforce rate limits, prevent duplicate operations, diagnose errors, respond to incidents, and maintain provider-event records.
- **Improve the question bank** — review question feedback and correct errors.
- **Communicate about the Service** — send account, security, billing, trial, renewal, and support messages through our providers.
- **Comply with law and protect rights** — keep records or disclose information when reasonably necessary for a legal obligation, dispute, or enforcement matter.

We do not use personal information for targeted advertising or to make automated decisions that produce legal or similarly significant effects about a user. Practice scoring and progress calculations evaluate question-bank performance; they do not decide eligibility for employment, education, housing, credit, healthcare, insurance, or another legally significant opportunity.

### Providers and disclosures

The repository establishes the following direct providers. The destination
mailbox service that receives mail forwarded by ImprovMX must be identified and
added before publication:

| Provider | Purpose | Information it may process |
|---|---|---|
| **Clerk** | Authentication and account management | Account, authentication, session, device, and security information |
| **Stripe** | Payments, subscriptions, billing, and hosted checkout/portal pages | Account, subscription, transaction, billing, payment-method, device, and fraud-prevention information |
| **Neon** | Database hosting | Information stored in the application database |
| **Vercel** | Application hosting, delivery, and platform request logs | Request, IP, route, user-agent, device, deployment, and diagnostic information |
| **Sentry** | Error monitoring and sampled server performance diagnostics | Errors, stack traces, page or route context, request context, browser/device information, and the narrow application attributes attached to sampled traces; submitted data can incidentally contain identifiers or content |
| **ImprovMX** | Forwarding mail sent to `support@addictionboards.com` | Sender and recipient addresses, message contents, and attachments |
| **Destination mailbox service — [OWNER TO IDENTIFY]** | Receiving and storing mail forwarded by ImprovMX | Sender and recipient addresses, message contents, and attachments |

Sentry session replay is disabled. Server tracing is sampled at 5%; client tracing is disabled. Those settings reduce collection but do not establish that an error event can never contain personal information.

The audited application build contains no Vercel Web Analytics component or analytics script. The repository does not establish the deployed project's current Web Analytics dashboard setting or that Web Analytics events are being transmitted; that setting remains an owner verification item. If an analytics script is activated, this policy and the notice at the collection point must be updated before relying on the feature.

We may also disclose information when reasonably required by valid legal process, to protect the Service or its users, or as part of a business transfer subject to applicable notice and legal requirements.

### Sale, advertising, analytics, and tracking

- We do not sell personal information.
- We do not share personal information for cross-context behavioural advertising and do not use advertising networks or advertising pixels.
- The audited application build has no product-analytics or tag-manager integration. Hosting, security, payment, and error-monitoring providers still process the technical and diagnostic information described above.
- Session replay is disabled.
- We do not use automated decision-making technology for legally or similarly significant decisions.

### Cookies and similar storage

The audited application code contains no first-party cookie-write call. Clerk uses cookies and related storage needed for authentication, session security, and account protection. Stripe and other providers may use cookies or similar technologies on their hosted pages according to their own notices. The application also uses browser storage for limited interface preferences. Blocking authentication storage can prevent sign-in.

### Retention

| Information | Current retention practice |
|---|---|
| User-linked application records — account, subscription mapping, practice activity, bookmarks, feedback, and idempotency records | Kept while the account exists unless deleted sooner. Deleting the local user record cascades to these user-linked rows. |
| Rate-limit records, including IP-derived keys | Cleanup targets records older than 24 hours, but cleanup is request-triggered, batch-limited, and fail-open. Twenty-four hours is not a guaranteed maximum physical row age. |
| Duplicate-operation records | A record normally expires for reuse after 24 hours. Physical cleanup is best effort, batch-limited, and triggered by later operations, so an expired row may remain longer. |
| Successfully processed Stripe event records | Targeted for deletion after 90 days by successful-webhook cleanup. Unresolved records remain until successful replay or operator resolution. |
| Clerk event records | Handled event records currently have no automatic terminal deletion policy. |
| Deleted-account record | A Clerk account identifier and deletion timestamp are retained without a current terminal deletion period to prevent unsafe recreation or reprocessing. |
| Pending Stripe-customer cleanup record | Retained until the external customer-cleanup obligation succeeds. |
| Support email and provider-held information | Retained under the relevant provider settings and policies, and as needed to respond, secure the Service, resolve disputes, or comply with law. The repository does not prove a single maximum period. |

### Your choices and requests

We will accept access, correction, deletion, and portable-copy requests from any user, subject to identity verification and lawful retention exceptions. You may also ask for information about sources, purposes, and provider disclosures, or appeal a decision on a privacy request.

Email **support@addictionboards.com**. We may ask you to send the request from the address associated with the account or otherwise verify control. An authorized agent may submit a request with appropriate proof of authority.

We aim to acknowledge a request within 10 business days and respond within 45 calendar days. A shorter period applies if required by law; when legally permitted and reasonably necessary, we may extend a response period after giving notice. We will not discriminate against a user for making a privacy request.

Account deletion removes the local user row and user-linked application rows through database cascades. It does not necessarily remove the limited event, deletion, pending-cleanup, support, payment, security, or legally required records described in the retention table, or copies independently held by providers. We will direct or complete provider deletion where required and applicable.

### Security and breach notice

We use service providers, access controls, transport security, logging, and other safeguards intended to protect personal information. Those controls are intended to limit access to the operator and authorized provider personnel with an operational need; the current provider and administrator access lists must be verified before publication. No safeguard eliminates all risk.

If a breach triggers a legal notice duty, we will provide the notices and regulator reports required by applicable law. This public statement does not replace the separate written security and incident-response program required for operations.

### Location

The Service is offered to users in the United States. Providers may process information in the United States or other locations described in their terms and privacy notices.

### Children

The Service is intended for adult medical professionals and trainees and is not directed to children under 13. We do not knowingly seek personal information from children under 13. If we obtain actual knowledge that a child under 13 supplied personal information, contact us so we can take the action required by law.

### Educational product

The Service provides board-exam preparation content. It is not medical or healthcare advice and is not designed for diagnosis, treatment, or patient-care decisions. The Terms of Service govern subscriptions and use of the Service.

### Changes

We will update the date above when this policy changes and provide any additional notice or consent required by applicable law. We will review the policy when data practices, providers, pricing, or legal requirements materially change.

### Contact

**support@addictionboards.com**

John H. Jung, MD, MS — sole proprietor, New York, United States

---

## Provenance and adversarial verification

This appendix is an internal audit record, not public policy copy. It independently re-derives every claim in the original provenance table instead of trusting that table.

| Original claim | Result | Evidence and correction |
|---|---|---|
| Only email is directly identifying; no name, phone, address, or date of birth | **REFUTED as a whole.** Email is the only ordinary contact attribute in the local `users` row, but it is not the only identifier or possible identifying content in the full schema. | `db/schema.ts:135-143` stores `id`, `clerkUserId`, and `email`; `db/schema.ts:159` stores `stripeCustomerId`; `db/schema.ts:180-188` stores a Stripe subscription ID and billing state; `db/schema.ts:249-252` retains a Clerk user ID after deletion; `db/schema.ts:694` stores free-text feedback. Stripe Checkout also sets `billing_address_collection: 'auto'` at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:669-675`. |
| No card data stored | **CONFIRMED narrowly for full card numbers in the application database; UNVERIFIABLE as “we never see payment details.”** | The local payment tables at `db/schema.ts:151-207` contain Stripe identifiers and subscription state, not PAN/CVC fields. Stripe-hosted Checkout is created at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:669-710`. The repository cannot prove what limited billing or payment-method information is visible in Stripe's Dashboard. |
| Practice activity contents | **CONFIRMED.** | `db/schema.ts:424-436` stores session mode, parameters, and times; `db/schema.ts:573-599` stores selected choice, correctness, time spent, and answer time; `db/schema.ts:650-671` stores bookmarks. |
| Free-text feedback is limited to 2,000 characters | **CONFIRMED.** | `db/schema.ts:674-695` defines the feedback fields and `comment`; `db/schema.ts:738-740` enforces `char_length(comment) <= 2000`. |
| IP addresses are collected by rate limiting | **CONFIRMED, but not the only technical-identifier path.** | `lib/request-ip.ts:1-14` reads Vercel's forwarded IP header; `app/api/health/handler.ts:22-29` stores `health:${ip}`; `app/api/stripe/webhook/handler.ts:47-53` stores `webhook:stripe:${ip}`; and `app/api/webhooks/clerk/handler.ts:56-62` stores `webhook:clerk:${ip}`. Vercel request logging and Sentry request/error capture are additional technical-data paths not disproved by the database schema. |
| IP retention is 24 hours | **REFUTED as a deletion guarantee.** | `src/adapters/gateways/drizzle-rate-limiter.ts:15` defines a 24-hour target, but `src/adapters/gateways/drizzle-rate-limiter.ts:77-93` expressly says it “is not a hard maximum row age” because cleanup is request-triggered, batch-limited, and fail-open. |
| Duplicate-prevention retention is 24 hours | **REFUTED as a physical-deletion guarantee; CONFIRMED as the normal expiry period.** | `src/adapters/shared/with-idempotency.ts:12-16` defines the default TTL as one day. `src/adapters/shared/with-idempotency.ts:132-146` describes physical cleanup as best effort and allows prune failure. |
| Account deletion cascades | **REFUTED as “all data is deleted”; CONFIRMED for user-linked local rows.** | User references cascade at `db/schema.ts:156-159`, `177-180`, `296-299`, `428-430`, `577-579`, `654-656`, and `678-680`. Provider-event ledgers at `db/schema.ts:209-243` have no user foreign key, and the deletion tombstone at `db/schema.ts:245-257` intentionally survives. The controller deletes the local user and then creates the tombstone at `src/adapters/controllers/clerk-webhook-controller.ts:350-390`. |
| A deletion record is retained | **CONFIRMED.** | `db/schema.ts:245-257` stores `clerkUserId` and `deletedAt`; `src/adapters/controllers/clerk-webhook-controller.ts:380` calls `markDeleted`. No terminal retention constant was found. |
| No analytics | **UNVERIFIABLE from the cited dependency check.** | The production source and `package.json` contain no product-analytics integration, but absence of a dependency does not prove a deployment setting or provider behaviour. The current Vercel Web Analytics dashboard setting is not exposed by the audited CLI path and remains an owner check; no production analytics event was sent to test transmission. The public copy therefore states only what the repository and that verification limit support. |
| No session replay; no personal information in Sentry | **CONFIRMED for replay; REFUTED for the no-personal-information inference.** | `sentry.client.config.ts:9-15` sets both replay rates and client trace sampling to zero. `instrumentation.ts:19-26` enables 5% server tracing and exports `Sentry.captureRequestError`; `lib/report-client-error.ts:50-65` sends the supplied error to `Sentry.captureException`. No scrubber proves an event can never contain personal information. |
| No first-party cookies; only Clerk sets cookies | **CONFIRMED only for no application cookie-write call; otherwise UNVERIFIABLE.** | An exhaustive source search found no `cookies()`, `document.cookie`, or equivalent write in application code. Provider-hosted behaviour and dashboard settings are not established by that absence. |
| Direct-provider list is Clerk, Stripe, Neon, Vercel, Sentry, and ImprovMX | **REFUTED as a complete six-provider inventory.** Those six are established, but the security inventory also records a destination inbox that receives forwarded support mail; its provider is not identified in the repository. | Runtime dependencies and imports establish Clerk, Stripe, Neon, Vercel, and Sentry. DEBT-414 and live DNS establish ImprovMX as the MX forwarder. `docs/security/information-security-program.md:24-25` separately identifies ImprovMX and the destination mailbox service, so that mailbox service must be named before publication. No external support email was sent, so end-to-end forwarding and the asserted catch-all were not verified. Preview-only tooling and a direct provider's own downstream vendors are not direct additions, but a separately selected destination mailbox is not established to be ImprovMX's downstream vendor. |
| Processed Stripe events are retained 90 days; unresolved Stripe and handled Clerk events remain | **CONFIRMED as the implemented policy.** | `src/adapters/controllers/stripe-webhook-controller.ts:60-68` names all three policies and the 90-day constant. |
| United States-only processing | **UNVERIFIABLE.** | The repository proves the intended market, not every location used by each provider. The public copy no longer promises United States-only processing. |
| Encryption at rest and operator-only access | **UNVERIFIABLE as previously worded.** | Provider documentation may describe encryption, but repository source cannot prove current account configuration or exclude authorized provider personnel. The public copy now describes safeguards without those absolutes. |

### Identifier-path census

The audit searched the full production source for IP/header reads and identifier-bearing persistence, provider metadata, logging, and telemetry:

- **IP reads:** `lib/request-ip.ts:1-14` reads `x-vercel-forwarded-for` in production and permits `x-forwarded-for` / `x-real-ip` only outside production. The value becomes a database rate-limit key at `app/api/health/handler.ts:22-29`, `app/api/stripe/webhook/handler.ts:47-53`, and `app/api/webhooks/clerk/handler.ts:56-62`.
- **Application database identifiers:** internal user UUID, Clerk user ID, email, Stripe customer/subscription IDs, practice/session/attempt/question identifiers, provider-event IDs, idempotency keys, and the deleted-Clerk-user tombstone are represented in `db/schema.ts`.
- **Stripe metadata:** `src/adapters/gateways/stripe/stripe-customers.ts:25-42` sends email, internal user ID, and Clerk user ID to Stripe; `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:669-683` sends internal user ID as Checkout/subscription metadata.
- **Structured logs:** `lib/request-context.ts:14-22` emits request ID and, when present, internal user ID. Additional operational log call sites include user, Clerk, Stripe-customer, Stripe-session, subscription, event, action, and idempotency identifiers. `lib/logger.ts:25-47` removes authorization, cookie, Stripe-signature, and named secret fields, but its own comment at `lib/logger.ts:21-23` correctly says redaction is not a complete personal-information boundary.
- **Sentry:** `instrumentation.ts:19-26` captures sampled server traces and request errors; `lib/report-client-error.ts:50-65` captures supplied client exceptions. The repository has a narrow attribute projector for the named traced families but no global `beforeSend` proof that all error/request fields are personal-information-free.
- **Vercel:** as the hosting layer, Vercel necessarily receives request routing information and exposes platform request logs. This is separate from the application's three persisted IP-rate-limit keys.
- **Provider accounts and support:** Clerk account/session/device identifiers, Stripe billing/fraud identifiers, and support-mail sender/message data are provider-held identifier paths whose exact live account configuration and retention cannot be exhaustively derived from this repository.

No fourth application source call to `getClientIp` was found, and the source/dependency scan found no production integration beyond the six named providers. That scan cannot identify the separately recorded destination mailbox service or prove provider platform behaviour or dashboard settings, so it does not establish a complete provider count.

### Legal applicability recorded by this audit

- **CCPA/CPRA:** does **not currently apply** on the recorded facts. The business is pre-revenue, has no active users, does not sell or share personal information, and is below all current statutory thresholds. The revenue threshold is **$26,625,000** as adjusted effective January 1, 2025; the 100,000-consumer threshold concerns buying, selling, or sharing personal information, not merely processing it. Reassess before any threshold or data-practice change. The 2026 regulations also require a just-in-time Notice at Collection if the Act becomes applicable; this policy alone would not satisfy that separate placement duty.
- **State comprehensive privacy laws:** none currently applies on the recorded zero-user, pre-revenue, no-sale facts. Reassess each state's threshold and exemptions before material growth, sale/share, sensitive-data processing, or consumer-health-data processing. Thresholds and duties are not uniform; Connecticut's lower threshold effective July 1, 2026 is a named early trigger.
- **Automated decision-making rules:** the question-bank scoring described in the code is not used to make a significant decision about a consumer. Reassess before using personal information for employment, education admission, credit, housing, insurance, healthcare access, or another significant decision.
- **COPPA:** the general-audience, adult professional exam-prep service is not directed to children under 13, and the repository contains no evidence of actual knowledge of an under-13 user. COPPA becomes applicable on actual knowledge or if the Service is redesigned to be child-directed.
- **New York SHIELD Act:** applies to the handling of New York residents' private information, including online account credentials. The proportional small-business standard is not an exemption. A public privacy-policy sentence does not satisfy the separate reasonable-safeguards and incident-response obligations.

### Primary legal sources

- [California Civil Code § 1798.140 — current CCPA definitions and thresholds](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140) and [CPPA annual threshold adjustment](https://cppa.ca.gov/regulations/cpi_adjustment.html)
- [CPPA regulations effective January 1, 2026](https://cppa.ca.gov/regulations/ccpa_updates.html), including privacy-policy, Notice at Collection, request-method, response-time, look-back, sensitive-information, and automated-decisionmaking provisions
- [New York General Business Law § 899-bb — reasonable safeguards](https://www.nysenate.gov/legislation/laws/GBS/899-BB) and [§ 899-aa — breach notification](https://www.nysenate.gov/legislation/laws/GBS/899-AA)
- [COPPA, 15 U.S.C. § 6502](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title15-section6502)
