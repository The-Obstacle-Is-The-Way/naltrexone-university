# Addiction Boards Information Security Program

> **STATUS: DRAFT FOR OWNER VERIFICATION AND ADOPTION — 2026-07-29.** This document converts the New York SHIELD Act safeguard categories into an operational program for the current sole proprietorship. It must not be marked adopted until every `OPEN` item is checked against the live provider accounts. It is not legal advice.

## 1. Scope and coordinator

This program covers computerized personal and private information owned, licensed, or maintained by Addiction Boards, including information processed through Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX, the destination mailbox service identified before adoption, operator devices, and local development environments.

**Security-program coordinator:** John H. Jung, MD, MS, sole proprietor.

The coordinator owns the risk review, provider review, access review, incident response, testing cadence, disposal decisions, and annual/event-driven update.

## 2. Data and system inventory

The current inventory is:

| System/provider | Purpose | Information |
|---|---|---|
| Application/Postgres on Neon | Product and subscription state | Email; internal, Clerk, and Stripe identifiers; subscription state; practice activity; feedback; security/idempotency records; provider-event ledgers; deletion tombstones |
| Clerk | Authentication | Account, credential, session, device, and security information |
| Stripe | Hosted payment and billing | Customer/subscription identifiers; billing and payment-method information; fraud and transaction information |
| Vercel | Hosting and delivery | Requests, IP/user-agent/route metadata, deployments, runtime logs |
| Sentry | Errors and sampled server performance | Exceptions, stack traces, request/page/browser context, projected trace attributes; no session replay |
| ImprovMX | Support-mail forwarding | Sender/recipient, message body, attachments |
| Destination mailbox service — **OPEN: identify provider before adoption** | Receiving and storing forwarded support mail | Sender/recipient, message body, attachments |
| GitHub (repository + Actions CI) | Source control, CI, and deployment triggers | Source code, workflow definitions, **CI/Actions secrets** (test credentials, tokens), dependency and security alerts. Privileged access path: repository admin and Actions secrets settings. Incident contact: GitHub support/security. |
| DNS — Vercel DNS (registrar Name.com via Vercel) | Domain control: routes the app, the Clerk auth subdomains, and **all support mail (MX/SPF)** | DNS record set. Privileged access path: the Vercel account's domain settings. A DNS compromise silently redirects the product and its mail — treat as production control plane. Incident contact: Vercel support. |
| Operator devices and local checkout | Development and administration | Source, environment configuration, redacted logs, possible temporary diagnostic data |

Control-plane systems (GitHub, DNS, and the provider dashboards above) are in scope for every access, secret-rotation, and incident review in this program — they can change production behaviour without touching application code. *(Rows added 2026-08-03 per promo #724 review: §§ 4–5's OPEN checks already referenced GitHub/DNS/CI access, but the inventory omitted them.)*

The detailed field and retention inventory is maintained in `docs/legal/privacy-policy.md`. A provider, new field, analytics/advertising integration, outbound email provider, or new copy of production data cannot be added without updating both documents.

## 3. Foreseeable risks

At minimum, review:

- operator account takeover, phishing, credential reuse, and lost device;
- provider dashboard/API-key compromise;
- source-control or CI secret disclosure;
- production data copied into local/test environments;
- broken authorization or cross-user access;
- injection, malicious free text, webhook forgery, abuse, and denial of service;
- sensitive data in logs, Sentry, support mail, or provider-event error fields;
- incomplete deletion or retention cleanup;
- dependency, deployment, DNS, or provider compromise;
- payment and renewal-consent disputes;
- unavailable, corrupted, or irrecoverable data;
- incorrect breach classification or missed notification deadline.

## 4. Administrative safeguards

- The owner is the named coordinator and sole ordinary production administrator.
- Access is least-privilege and task-specific. Shared accounts are prohibited.
- Production data must not be copied into local/test systems unless an incident or approved diagnostic task specifically requires it and the copy is encrypted, minimized, recorded, and promptly disposed.
- Secrets belong in provider environment stores or local ignored environment files, never source control, issue text, screenshots, or logs.
- Provider selection requires a recorded review of security capabilities, breach-notice commitments, deletion/retention controls, and contractual safeguards.
- A security review is required before adding authentication, sensitive inputs, endpoints, payment features, or a new provider.
- The owner completes and records security-practice training at adoption and annually. Employee training and management are currently not applicable because the business has no employees; before any employee, contractor, or delegated administrator receives access, the owner must document role-specific onboarding, confidentiality/security duties, least-privilege access, supervision, recurring training, and access removal.
- Security-relevant incidents and near misses are recorded and reviewed for program changes.
- The owner reviews this program at least annually and after a material incident, provider change, data-practice change, or business-structure change.

**OPEN before adoption:**

- [ ] Confirm MFA/passkeys and recovery methods for GitHub, Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX, DNS, and the destination inbox.
- [ ] Identify the destination mailbox provider and reconcile it with the Privacy Policy's provider inventory; if the same provider will send transactional renewal mail, record both roles.
- [ ] Record every current administrator/member and remove stale access.
- [ ] Record provider DPA/security-term review dates and breach-notice contacts.
- [ ] Record operator-device encryption, screen lock, patching, backup, and remote-wipe status.
- [ ] Confirm repository/CI secret-scanning and dependency-alert settings.
- [ ] Confirm whether any production data exists in developer machines, exports, screenshots, or support mail.
- [ ] Complete and retain the owner's security-practice training record; confirm no employee, contractor, or delegated administrator has unrecorded access, or document the required training and management evidence for each person.

## 5. Technical safeguards

Repository-verified controls include:

- Clerk authentication and middleware protection for non-public routes;
- Stripe and Clerk webhook verification;
- input schemas and application error boundaries;
- rate limiting on public/webhook paths;
- idempotency controls for duplicate operations;
- database foreign keys and account-deletion cascades for user-linked rows;
- logger redaction of authorization, cookie, and Stripe-signature headers;
- bounded safe-error projection at named server diagnostic seams;
- Sentry replay disabled, client tracing disabled, and server tracing sampled at 5%;
- narrow projected attributes for the named traced operations;
- automated TypeScript, lint, unit, browser, integration, and build gates.

These controls do not prove provider-account configuration.

**OPEN before adoption:**

- [ ] Confirm production TLS, database encryption-at-rest, backup, restore, and access-log settings from current provider evidence.
- [ ] Confirm production and preview environment-variable scope and rotate any stale credentials.
- [ ] Confirm Clerk session, password, bot/abuse, and account-recovery settings.
- [ ] Confirm Stripe restricted-key scope, webhook endpoints/secrets, portal cancellation, fraud controls, and administrator access.
- [ ] Confirm Vercel runtime-log retention, Web Analytics state, firewall/rate controls, and member access.
- [ ] Confirm Sentry scrubbing, IP handling, retention, member access, and project settings; do not infer safety from `sendDefaultPii` defaults.
- [ ] Test authorization and deletion paths in the release cadence.
- [ ] Record a recurring restore exercise and incident contact test.

## 6. Physical safeguards

- At adoption and annually, assess physical risks to operator devices, paper, portable media, local exports, backups, and any location where private information is collected, transported, stored, or destroyed. Record whether each medium/location exists and the control or not-applicable basis.
- Operator devices must use full-disk encryption, automatic screen lock, current supported software, and individual authentication.
- Paper records containing private information are avoided. If created, they are locked while needed and cross-cut shredded when no longer required.
- Portable media holding private information is prohibited unless specifically approved, encrypted, inventoried, and erased after use.
- Detect, prevent, and respond to physical intrusion through controlled device/workspace access, prompt lost-or-stolen-device reporting, session/key revocation, remote lock or wipe where available, and the incident procedure. A dedicated office/server facility is currently not applicable because the product uses provider-hosted infrastructure and a sole-proprietor workspace; any later facility or delegated workspace requires its own access and intrusion controls before use.
- Protect private information during collection, transportation, and disposal: minimize local copies, encrypt approved electronic transfer/media, keep any permitted paper or device under the owner's control, inventory transfers, and verify destruction.
- Disposal must make electronic information unreadable and unreconstructable, subject to legal-retention requirements.

**OPEN before adoption:**

- [ ] Complete and retain the physical-risk assessment, including storage/disposal, collection/transportation, and intrusion-response controls; record each genuinely absent medium or facility as not applicable with the reason.

## 7. Retention and disposal

The current technical policies are:

- rate-limit cleanup targets records older than 24 hours but is not a hard maximum;
- idempotency records normally expire after 24 hours and are physically pruned best effort;
- successfully processed Stripe events target deletion after 90 days;
- unresolved Stripe events remain until successful replay or operator resolution;
- handled Clerk events and Clerk deletion tombstones have no current terminal deletion period;
- user-linked application rows cascade when the local user is deleted;
- pending Stripe-customer cleanup remains until successful completion.

**Every open-ended or non-guaranteed retention policy above requires its own annual review with a recorded justification** — not just a subset. The current set is: (1) rate-limit cleanup with no hard maximum row age; (2) best-effort idempotency pruning; (3) successfully processed Stripe events, whose 90-day deletion is a target rather than a guaranteed maximum; (4) unresolved Stripe events held until replay/resolution; (5) handled Clerk events with no terminal period; (6) Clerk deletion tombstones with no terminal period; (7) pending Stripe-customer cleanup held until success. For each, the annual review records why continued retention remains necessary or converts it to a bounded/enforced policy. *(Corrected 2026-08-03 per promo #724 review and #725 round 2 — earlier revisions said "the two indefinite policies," then omitted the non-guaranteed 90-day target.)* Provider, support-mail, export, backup, and local-copy retention must be added to the inventory once verified.

## 8. Testing, monitoring, and review record

| Review | Minimum cadence | Evidence |
|---|---|---|
| Provider/admin access | Quarterly and after personnel/account change | Dated member list and removals |
| Secrets/API keys | Quarterly and after suspected exposure | Dated inventory; never record secret values |
| Dependency/security alerts | Monthly | Dated alert review |
| Auth/authorization/deletion checks | Each material release | Test/gate links |
| Backup/restore | At least annually | Disposable restore record |
| Incident contact and notification drill | At least annually | Completed exercise record |
| Full program and data inventory | Annually and event-driven | Owner sign-off below |

## 9. Adoption and revision record

| Date | Action | Owner | Evidence/open exceptions |
|---|---|---|---|
| 2026-07-29 | Non-lawyer draft created from repository evidence and N.Y. GBL § 899-bb | Codex audit; not adopted | All `OPEN` provider/device/account checks remain |

**Owner adoption:** `[DATE / SIGN-OFF / OPEN EXCEPTIONS]`

## Source

[New York General Business Law § 899-bb](https://www.nysenate.gov/legislation/laws/GBS/899-BB) requires reasonable administrative, technical, and physical safeguards. Subdivision 2(c) scales the program to a small business's size, complexity, activities, and data sensitivity; it does not remove the duty.
