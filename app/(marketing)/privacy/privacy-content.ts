import type { LegalDocumentContent } from '@/components/legal/legal-document';

export const privacyContent = {
  title: 'Privacy Policy',
  effectiveDate: 'August 5, 2026',
  bodyMarkdown: `### The short version

Addiction Boards is a board-exam question bank. We use account, subscription, practice, feedback, and technical information to provide and secure the Service. We do not sell personal information or share it for cross-context behavioural advertising. We do not use advertising trackers or session replay. Full payment-card numbers are entered on Stripe-hosted pages and are not stored in the Addiction Boards application database.

Deleting an account removes the user record and the application records attached to it. Limited provider-event, deletion, security, support, payment, and legally required records can remain for the periods described below.

### Who we are

Addiction Boards (the "Service", at \`addictionboards.com\`) is operated by **John H. Jung, MD, MS**, a sole proprietor based in New York ("we", "us", "our").

Contact for any privacy question or request: **support@addictionboards.com**

### Information we collect

| Category | Examples |
|---|---|
| **Account information** | Email address; internal account identifier; authentication-provider identifier; account creation and update times |
| **Subscription and payment information** | Subscription status and plan; billing-period end; cancellation status; Stripe customer, subscription, checkout, payment-method, and event identifiers. Full payment-card numbers are collected and hosted by Stripe on its own systems and are never stored by the application; the application may receive limited Stripe payment metadata (such as payment-method identifiers) needed to administer your subscription |
| **Practice activity** | Practice mode and filters; questions shown; answers and correctness; marked-for-review state; time per question; bookmarks; and performance statistics derived from that activity |
| **Feedback you choose to send** | Helpfulness rating; report category; and any free-text comment you write |
| **Technical, security, and diagnostic information** | IP address and rate-limit keys; request and provider-event identifiers; route or page context; browser, device, and request information available to hosting or error-monitoring providers; error messages and stack traces; duplicate-operation records |
| **Support correspondence** | The address, message, and other information you include when emailing \`support@addictionboards.com\` |

The application database's \`users\` table stores an email address and internal and Clerk identifiers, but that table is not the full data inventory. Other application tables store Stripe identifiers, activity, feedback, security records, and provider-event identifiers. Clerk, Stripe, Vercel, Sentry, Neon, ImprovMX, Google Workspace, and Resend can process additional information in providing their services.

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

The following direct providers support the Service:

| Provider | Purpose | Information it may process |
|---|---|---|
| **Clerk** | Authentication and account management | Account, authentication, session, device, and security information |
| **Stripe** | Payments, subscriptions, billing, and hosted checkout/portal pages | Account, subscription, transaction, billing, payment-method, device, and fraud-prevention information |
| **Neon** | Database hosting | Information stored in the application database |
| **Vercel** | Application hosting, delivery, and platform request logs | Request, IP, route, user-agent, device, deployment, and diagnostic information |
| **Sentry** | Error monitoring and sampled server performance diagnostics | Errors, stack traces, page or route context, request context, browser/device information, and the narrow application attributes attached to sampled traces; submitted data can incidentally contain identifiers or content |
| **ImprovMX** | Forwarding mail sent to \`support@addictionboards.com\` | Sender and recipient addresses, message contents, and attachments |
| **Google Workspace (Google LLC)** | Receiving and storing mail forwarded by ImprovMX | Sender and recipient addresses, message contents, and attachments |
| **Resend** | Sending transactional account, billing, renewal, and subscription notices (**not yet active** — the Service does not currently send messages through Resend; this row describes the integration's intended use before it begins) | Recipient address, message contents, delivery status, and provider event identifiers |

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

We use service providers, access controls, transport security, logging, and other safeguards intended to protect personal information. Those controls are intended to limit access to the operator and authorized provider personnel with an operational need; the current provider and administrator access lists remain an owner verification item. No safeguard eliminates all risk.

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

John H. Jung, MD, MS — sole proprietor, New York, United States`,
} satisfies LegalDocumentContent;
