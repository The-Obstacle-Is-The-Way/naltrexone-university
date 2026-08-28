# Addiction Boards Information Security Program

> **STATUS: ADOPTED 2026-08-27 (owner sign-off in § 9).** This document converts the New York SHIELD Act safeguard categories into an operational program for the current sole proprietorship. The former `OPEN` items below were closed on the dates recorded with each item, with evidence of the type each item required (one control remains pending rather than closed: Resend has no account yet; open exception 4 in § 9 closes only when the Resend account exists, MFA or a passkey is configured on it, and its recovery method is verified): the provider and account rows were verified against the live provider accounts (the support-mail delivery check on 2026-08-05 and 2026-08-06; the measured CLI/API audit on 2026-08-13; owner dashboard verification and hardening through 2026-08-27), the operator-device row by host inspection, the physical-safeguard row by owner attestation, and the training and drill rows by the recorded read-through, the executed restore drill, and the tabletop; each checked item labels its evidence source, and plan-gated limitations are recorded as open exceptions in § 9 rather than silently passed. It is not legal advice.

## 1. Scope and coordinator

This program covers computerized personal and private information owned, licensed, or maintained by Addiction Boards, including information processed through Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX, Google Workspace, Resend, operator devices, and local development environments.

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
| Google Workspace (Google LLC) | Receiving and storing forwarded support mail | Sender/recipient, message body, attachments |
| Resend | Transactional account, billing, renewal, and subscription notices when configured; the implemented durable queue makes no provider call while `RESEND_API_KEY` is absent | Recipient address, message body, delivery status, provider event identifiers |
| GitHub (repository + Actions CI) | Source control, CI, and deployment triggers | Source code, workflow definitions, **CI/Actions secrets** (test credentials, tokens), dependency and security alerts. Privileged access path: repository admin and Actions secrets settings. Incident contact: GitHub support/security. |
| DNS hosting — Vercel DNS | Record hosting: routes the app, the Clerk auth subdomains, and **all support mail (MX/SPF)** | DNS record set. Privileged access path: the Vercel account's domain settings. A DNS compromise silently redirects the product and its mail — treat as production control plane. Incident contact: Vercel support. |
| Domain registration — Name.com, managed entirely through Vercel | Registrar of record for `addictionboards.com` (purchased via Vercel Domains) | Registration, renewal, transfer lock, nameserver delegation, and account recovery are all controlled through the **Vercel** account — the owner holds no direct Name.com credentials or access path. Registrar-level incidents (hijack, transfer, expiry) route through Vercel support; Vercel is the single privileged path for both rows. |
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

- [x] Confirm MFA/passkeys and recovery methods for GitHub, Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX, Google Workspace, Resend, and DNS. **DONE for every existing account 2026-08-20 to 2026-08-24 (owner-verified in each dashboard); Resend PENDING (no account exists; closes only when the Resend account exists, MFA or a passkey is configured on it, and its recovery method is verified):** GitHub 2FA with authenticator app and GitHub Mobile, no SMS, recovery codes regenerated and vaulted; Vercel two-factor active (passkey plus authenticator, recovery codes vaulted; two active tokens, both the owner's); Stripe passwordless sign-in (Google plus passkey) with authenticator two-step and a regenerated backup code; Google Workspace 2SV with authenticator and prompt, SMS removed as a factor, backup codes vaulted, the account password rotated 2026-08-22, and the personal recovery mailbox hardened the same way; Clerk dashboard passkey, TOTP, and backup codes (added 2026-08-22); Sentry authenticator, passkey, and recovery codes with organization-wide 2FA required (2026-08-24); ImprovMX 2FA plus passkey and no API keys; Neon sign-in is OAuth only (Vercel and GitHub identities, no password set); DNS and the registrar are managed solely through the Vercel account (the domain was purchased via Vercel; auto-renew verified true, expiry 2027-02-04); Resend is not yet created and is tracked as open exception 4 in § 9 until the Resend account exists, MFA or a passkey is configured on it, and its recovery method is verified. Recovery codes live in the owner's password manager, never in this repository.
- [x] Send an external message to `support@addictionboards.com` and confirm receipt in Google Workspace — **done 2026-08-05 and independently corroborated from the connected destination mailbox 2026-08-06** (external `@gmail.com` sender; raw headers preserve the original Gmail DKIM pass). Inbox-not-spam placement at receipt remains owner-reported because the retained message no longer carries either label. Separately verify the claimed catch-all if it will ever be represented.
- [x] Record the Google Workspace destination inbox's retention and access settings. **DONE 2026-08-24:** Business Standard plan, one licensed user, the owner is the only administrator; the plan includes no Google Vault, so no retention rules exist and mail is retained until deleted (Trash purges after 30 days); organization-wide 2-Step Verification enforcement is ON with SMS and phone-call codes disallowed.
- [x] Record every current administrator/member and remove stale access. **DONE 2026-08-13 to 2026-08-26:** sole member and owner on GitHub (repository collaborators), Vercel (team), Neon (organization), Sentry (organization), Stripe (team, Super Administrator), and Google Workspace; GitHub installed apps pruned from 14 to 6 and authorized OAuth grants from 19 to 6 on 2026-08-24; no deploy keys, no repository webhooks, no log drains.
- [x] Record provider DPA/security-term review dates and breach-notice contacts. **DONE 2026-08-13:** the current DPA, security page, breach-notification clause, and incident-report contact were live-verified for GitHub, Stripe, Clerk, Neon (breach terms defer to the Databricks Security Addendum § 7.3), Vercel, Sentry, Google Workspace, ImprovMX (72-hour customer notice on its GDPR page; no security mailbox), Resend, and the registrar Name.com (no registrar-scope DPA or breach clause exists, abuse contact only, and the owner holds no direct Name.com access). The table is retained in the owner's adoption ledger; review annually.
- [x] Record operator-device encryption, screen lock, patching, backup, and remote-wipe status. **DONE 2026-08-20:** FileVault on; System Integrity Protection and Gatekeeper on; application firewall enabled (2026-08-14); macOS current (26.6.2, no pending updates); screen lock configured; Find My Mac on; backup position recorded: product data is provider-hosted (Neon, GitHub, Stripe) and personal data syncs to iCloud, so no local-only data exists and Time Machine is intentionally unconfigured.
- [x] Confirm repository/CI secret-scanning and dependency-alert settings. **DONE 2026-08-13 (API-verified):** secret scanning, push protection, Dependabot security updates, and vulnerability alerts are all enabled on the public repository; the `main-protection` ruleset blocks deletion and non-fast-forward pushes and requires pull requests with passing status checks; the one open high-severity alert found (nanoid) was resolved by PR #787 and open alerts were 0 on 2026-08-14.
- [x] Confirm whether any production data exists in developer machines, exports, screenshots, or support mail. **DONE 2026-08-13:** no live Stripe or Clerk keys and no production database host in any local environment file (test-mode keys and the Neon development branch only); no SQL dumps or exports in either clone; no provider files in Downloads; dashboard screenshots reviewed and removed; the support mailbox holds only setup and test mail (no customers yet). The only live credential on the machine is the owner-authorized 90-day Stripe CLI restricted key (rotate by 2026-11-11).
- [x] Complete and retain the owner's security-practice training record; confirm no employee, contractor, or delegated administrator has unrecorded access, or document the required training and management evidence for each person. **DONE 2026-08-27:** the owner read this program, the incident procedure, and the adoption evidence ledger; no employee, contractor, or delegated administrator exists (every provider verified solo above). Refresh annually with the program review.

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

- [x] Confirm production TLS, database encryption-at-rest, backup, restore, and access-log settings from current provider evidence. **DONE 2026-08-13 (measured):** the production edge serves TLS 1.3 with an auto-renewed Let's Encrypt certificate, HSTS (one year, includeSubDomains), X-Frame-Options DENY, nosniff, and a report-only CSP wired to Sentry; the Neon client connection negotiates TLS 1.3; encryption at rest is a Neon platform property; point-in-time restore covers 6 hours (the free-plan maximum) and a restore drill succeeded the same day; access and audit logs are not available on the current Vercel Hobby and Neon Free plans, recorded as an open exception.
- [x] Confirm production and preview environment-variable scope and rotate any stale credentials. **DONE 2026-08-13 (API-verified by name and target only):** the Vercel variable set matches the application's expected keys across production, preview, and development; `RESEND_API_KEY` is absent everywhere (fail-closed queue); the E2E-only Stripe webhook owner variable is preview-scoped; no stale variables were found and none required rotation; the E2E preflight now fails closed on live-mode Stripe keys (PR #810).
- [x] Confirm Clerk session, password, bot/abuse, and account-recovery settings. **DONE 2026-08-24 (production instance):** email required and verified at sign-up by one-time code, code-based sign-in, magic links off; sessions run Clerk defaults (7-day maximum lifetime; a custom maximum lifetime requires a paid production plan; inactivity timeout is disabled by default); the session token carries no custom claims; lockout policy, Device Trust, Cloudflare Turnstile bot protection, and user-enumeration protection are enabled, and disposable-email and subaddress sign-ups were blocked on 2026-08-24; account recovery uses the platform-locked reset-password-code template. User-account MFA strategies are Pro-gated and therefore unavailable, recorded as an open exception.
- [x] Confirm Stripe restricted-key scope, webhook endpoints/secrets, portal cancellation, fraud controls, and administrator access. **DONE 2026-08-13 to 2026-08-22:** exactly three live keys exist (publishable, the production secret key used only by the deployed app, and one 90-day restricted CLI key); exactly one live webhook endpoint (`/api/stripe/webhook`, seven events, current API version); portal cancellation is enabled at period end; Radar runs provider defaults (pre-revenue); the dashboard has one member (owner, Super Administrator) with passwordless sign-in and two-step verification.
- [x] Confirm Vercel runtime-log retention, Web Analytics state, firewall/rate controls, and member access. **DONE 2026-08-13:** Hobby-plan runtime-log retention (about one hour) recorded as a limitation; Web Analytics is toggled on at the project level but was never instrumented, so nothing is collected (activation is governed by DEBT-464); Speed Insights is disabled; no custom firewall rules beyond platform DDoS mitigation; no log drains; the team has one member (owner).
- [x] Confirm Sentry scrubbing, IP handling, retention, member access, and project settings; do not infer safety from `sendDefaultPii` defaults. **DONE 2026-08-13 to 2026-08-24:** server-side data scrubbing with default scrubbers is on and now required organization-wide; IP-address storage was found enabled and was switched off on 2026-08-13 (project level, API-verified); enhanced privacy is on and join requests are off; the repository test-pins client tracing and replay at zero and server tracing at 5%; retention is the provider's 90-day default; the organization has one member (owner) and requires 2FA.
- [x] Test authorization and deletion paths in the release cadence. **DONE (continuous):** deletion cascades are covered by the Clerk webhook controller tests and the Stripe repository, subscription-writer lock-order, and pending-customer-cleanup integration contracts; authorization is covered by the signed-out redirect and entitlement E2E specs; CI runs typecheck, unit, browser, integration, and E2E lanes on every pull request and `main` accepts pull requests only.
- [x] Record a recurring restore exercise and incident contact test. **DONE 2026-08-13 and 2026-08-27:** a Neon point-in-time branch was created from `main`, verified to serve the production row counts, and deleted (first restore exercise; annual cadence in § 8); the incident contact and notification drill ran as the 2026-08-27 tabletop recorded in the incident procedure's § 8.

## 6. Physical safeguards

- At adoption and annually, assess physical risks to operator devices, paper, portable media, local exports, backups, and any location where private information is collected, transported, stored, or destroyed. Record whether each medium/location exists and the control or not-applicable basis.
- Operator devices must use full-disk encryption, automatic screen lock, current supported software, and individual authentication.
- Paper records containing private information are avoided. If created, they are locked while needed and cross-cut shredded when no longer required.
- Portable media holding private information is prohibited unless specifically approved, encrypted, inventoried, and erased after use.
- Detect, prevent, and respond to physical intrusion through controlled device/workspace access, prompt lost-or-stolen-device reporting, session/key revocation, remote lock or wipe where available, and the incident procedure. A dedicated office/server facility is currently not applicable because the product uses provider-hosted infrastructure and a sole-proprietor workspace; any later facility or delegated workspace requires its own access and intrusion controls before use.
- Protect private information during collection, transportation, and disposal: minimize local copies, encrypt approved electronic transfer/media, keep any permitted paper or device under the owner's control, inventory transfers, and verify destruction.
- Disposal must make electronic information unreadable and unreconstructable, subject to legal-retention requirements.

**OPEN before adoption:**

- [x] Complete and retain the physical-risk assessment, including storage/disposal, collection/transportation, and intrusion-response controls; record each genuinely absent medium or facility as not applicable with the reason. **DONE 2026-08-24 (owner-attested):** no paper records containing account or user data exist; no portable media or external drives hold project data; the single operator device stays under the owner's exclusive physical control with no other person holding access, protected by FileVault, screen lock, Find My, and the firewall; no other device holds provider-dashboard sessions; a dedicated office or server facility is not applicable because infrastructure is provider-hosted; no local copies of production data exist, so collection, transport, and disposal reduce to provider deletion paths. The device and location inventory behind these outcomes is held in the private adoption ledger, not in this public document. Reassess annually.

## 7. Retention and disposal

The current technical policies are:

- rate-limit cleanup targets records older than 24 hours but is not a hard maximum;
- idempotency records normally expire after 24 hours and are physically pruned best effort;
- successfully processed Stripe events target deletion after 90 days;
- unresolved Stripe events remain until successful replay or operator resolution;
- handled Clerk events and Clerk deletion tombstones have no current terminal deletion period;
- user-linked application rows cascade when the local user is deleted;
- renewal-consent evidence survives account deletion and is eligible for cleanup after the later of three years after consent or one year after subscription termination;
- acknowledgment delivery rows cascade when their related consent record is deleted, while scheduled-notice delivery rows have no current automatic terminal deletion period;
- pending Stripe-customer cleanup remains until successful completion.

**Every open-ended or non-guaranteed retention policy above requires its own annual review with a recorded justification** — not just a subset. The current set is: (1) rate-limit cleanup with no hard maximum row age; (2) best-effort idempotency pruning; (3) successfully processed Stripe events, whose 90-day deletion is a target rather than a guaranteed maximum; (4) unresolved Stripe events held until replay/resolution; (5) handled Clerk events with no terminal period; (6) Clerk deletion tombstones with no terminal period; (7) webhook-triggered, best-effort renewal-consent cleanup after its legal-retention floor; (8) scheduled-notice delivery rows with no terminal period; and (9) pending Stripe-customer cleanup held until success. For each, the annual review records why continued retention remains necessary or converts it to a bounded/enforced policy. *(Updated 2026-08-06 for the renewal ledgers; the 2026-08-03 correction had already expanded the earlier "two indefinite policies" wording to include non-guaranteed targets.)* Provider, support-mail, export, backup, and local-copy retention were verified on 2026-08-24: Google Workspace (Business Standard, no Vault) retains support mail until the owner deletes it; Sentry retains events for its 90-day default; Vercel runtime logs persist for about one hour on the Hobby plan; Neon history retention is 6 hours; no exports, backups outside the providers, or local copies of production data exist.

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
| 2026-08-13 | Measured live-account audit of every `OPEN` row (CLI/API evidence for GitHub, Vercel, Stripe, Sentry, Neon, DNS/TLS, and the operator host); Sentry IP-address storage disabled; Neon restore drill executed; provider DPA and breach-contact table compiled | Owner-directed session | Owner dashboard verifications remained for MFA, Workspace, the Clerk instance, and physical items |
| 2026-08-14 to 2026-08-26 | Owner dashboard verification and hardening: Mac firewall, patching, and Find My; MFA, passkeys, and vaulted recovery codes at every existing provider account; SMS removed as a factor; Workspace 2SV enforcement; Clerk abuse guards; Sentry organization policies; GitHub app and OAuth grant pruning | Owner | Training read-through and tabletop remained |
| 2026-08-27 | Owner training read-through recorded; tabletop completed (incident procedure § 8); program adopted | Owner | Open exceptions listed in the adoption line |

**Owner adoption:** 2026-08-27 / John H. Jung, MD, MS, sole proprietor (signature entered at the owner's instruction in the adoption session) / Open exceptions: (1) user-account MFA strategies are unavailable on the Clerk Hobby plan; (2) access and audit logs are unavailable on the Vercel Hobby and Neon Free plans; (3) Neon point-in-time restore is limited to 6 hours (plan maximum); (4) Resend has no account yet; this exception closes only when the Resend account exists, MFA or a passkey is configured on it, and its recovery method is verified; (5) the personal recovery-mailbox password was not rotated (2-Step Verification is on; accepted risk); (6) the screen-lock delay remains 5 minutes. Revisit each at the annual review or when the relevant plan changes.

## Source

[New York General Business Law § 899-bb](https://www.nysenate.gov/legislation/laws/GBS/899-BB) requires reasonable administrative, technical, and physical safeguards. Subdivision 2(c) scales the program to a small business's size, complexity, activities, and data sensitivity; it does not remove the duty.
