# UI QA Procedures

**Last Updated:** 2026-08-14

Scripted, repeatable test procedures that exercise the system **at the UI** — the third leg of the test triad this repo is adopting (see `docs/adr/adr-019-test-quality-practices.md`):

1. **Unit tests** (TDD, colocated) prevent regressions in logic.
2. **Acceptance tests** (`docs/dev/acceptance-testing.md`) keep business rules separated from the UI.
3. **QA procedures** (this doc + the `docs/qa/` register) catch the failure mode the other two structurally cannot: *software that works at the API but not at the UI*.

A QA procedure is a numbered, versioned markdown script (`docs/qa/qa-NNN-slug.md`) that a human, an agent, or a Playwright-assisted run can execute against a running app, with explicit expected results and evidence capture.

---

## Why this exists (and what Playwright E2E does not cover)

The Playwright suite (`tests/e2e/`, 17 specs) is deterministic regression coverage for critical journeys. QA procedures cover what it structurally leaves out:

- **Judgment-bearing checks** — "does this layout look broken?", copy tone, visual hierarchy, dark-mode token drift. Assertions can't encode taste; the design docs in `docs/frontend/` + a pair of eyes (or a vision-capable agent pass over screenshots) can.
- **Surfaces without route-level UI automation.** The 2026-08-14 audit found these gaps: rendered Clerk `/sign-in` and `/sign-up` forms (E2E proves the pricing-to-sign-up handoff but signs in programmatically via `@clerk/testing`); real-browser `/privacy`–`/terms` routes (rich unit-render tests and E2E HTTP checks exist); forced route-level `error.tsx`/`not-found.tsx`/`loading.tsx` states (the components have unit-render coverage, except the quick-practice error and loading files lack direct render tests); billing-portal round-trip; paid (card) checkout + real-browser `?checkout=cancel|error|rate_limited` banners; the route-level entitlement redirect gate (`/app/*` → `/pricing?reason=…`, unit-covered); a real-browser `PastDueBanner` state (unit-covered); account deletion via the rendered Clerk `<UserButton>`; nondefault practice-starter filters at the route level (browser-component-covered); the quick-practice status switch at the route level (browser-component-covered); history tab, non-Source filters, and pagination at the route level (the Source filter and session disclosure are browser-component-covered); feedback rating + report dialog end-to-end; exam-timer expiry at the route level (browser hook/page-model and integration coverage exist); and an **app-wide mobile sweep** (one 375×667 practice E2E and one 375×667 browser-component case exist, while the Playwright project remains Desktop Chrome).
- **Deployed-target verification.** Playwright boots its own local server (`reuseExistingServer: false`); it does not point at Vercel previews or production. QA procedures do.
- **Pre-automation staging.** A flow becomes a procedure first; once its steps are stable and mechanizable, it is *promoted* to a Playwright spec and the procedure records the handoff (see Lifecycle).

Once QA-001 is Active, it absorbs Flows A–C of the manual "Core Flow Verification" scripts in `docs/dev/stabilization-checklist.md`; Flow D remains there. QA-002 supplies the draft procedure that can give `docs/dev/deployment-environments.md` → "Operator Verification Checklist" item 8 ("Auth and payment flows have been smoke-tested on the target environment after changes") a concrete, executable form once DEBT-465 Part 4 activates it and links the checklist to the register.

---

## The register

- **Index:** `docs/qa/index.md` — procedure table, statuses, and the `**Next QA ID:**` allocator (same register mechanics as `docs/debt/` and `docs/bugs/`).
- **Procedures:** `docs/qa/qa-NNN-short-slug.md`, IDs zero-padded to 3 digits, allocated at doc-creation time by bumping the allocator.
- **Evidence assets:** representative WebP/PNG screenshots go in `docs/qa/assets/qa-NNN/` (mirroring `docs/debt/assets/debt-NNN/`). Working screenshots stay in the gitignored `audit-screenshots/`.

## Procedure format

Every procedure uses this skeleton (copy from `docs/qa/index.md` → Template):

- **Header block:** ID/title, `Status`, `Surfaces` (routes), `Preconditions` (environment, auth, seed data), `Execution modes` (which of the four modes below can run it fully vs. partially), `Estimated time`, `Promotion gate` (runs pre-promotion when `yes`), `Promoted to` (E2E spec path once promoted, else `—`).
- **Steps table:** `| # | Action | Expected |` — one operator checkpoint per row, with explicit actions and verifiable expectations. Write expectations against stable markers: visible text, `data-testid`, URL/query params, `aria-*` — the same seams the test-quality rules mandate.
- **Visual checks:** an explicit list of judgment checks with the governing policy doc cited per line (`docs/frontend/standards.md`, `pattern-registry.md`, `contrast-policy.md`, `typography-policy.md`, `bookmark-surface-policy.md`). The app is forced dark (DEBT-421) — flag any light-mode leakage immediately.
- **Viewports:** default to the established audit pair — **1600×1000 desktop** and **390×844 mobile** — unless the procedure states otherwise.
- **Evidence:** which steps require screenshots, and where they land.
- **On failure:** file a `BUG-NNN` in `docs/bugs/index.md` (behavioral defect) or flag against the design docs (visual drift). Never patch-and-forget: the procedure links the finding.

## Execution modes

Declare per procedure which modes can execute it. The constraint table below is the distilled reality of `docs/tooling/agent-browser.md` (DEBT-323) — do not relearn it per session.

| Mode | Auth | Can do | Cannot do |
|---|---|---|---|
| **Human** | Normal sign-in | Everything, incl. pixel judgment, Stripe-hosted card entry, the one-time headed Clerk login that seeds `/tmp/clerk-profile` | — |
| **Agent — Chrome MCP** (preferred inside Claude Code) | User's browser is typically already signed in; check `tabs_context_mcp` first | Navigate, read text/structure, click links + dialog buttons, fill inputs, screenshots, console/network reads | Trusted-pointer-only widgets; card entry |
| **Agent — agent-browser** | `--profile /tmp/clerk-profile` (human seeded once); `agent-browser close` first or the flag is silently ignored; host must match `NEXT_PUBLIC_APP_URL` exactly | Links and dialog Confirm/Cancel reliably; full-page screenshots; answer radios + Submit via the `eval` label/button-click fallback | **Tutor/Exam toggle, `SegmentedControl`, `FilterChip` — no workaround exists; steps needing them are Playwright-or-human** |
| **Playwright-assisted** | `@clerk/testing` programmatic sign-in | Toggle-dependent steps, deterministic state reset, exam-mode entry | Judgment checks (pair with screenshot review) |

Rules of engagement (restating the standing mandates):

- **Never skip a procedure because of an auth redirect — authenticate first.**
- Agent modes must **re-snapshot after every navigation or DOM change** (refs expire).
- A procedure step an agent cannot perform is marked `⚠ human/PW` in the steps table, not silently skipped; the run report states which steps were executed in which mode.

## Environments

| Target | Use for | Cautions |
|---|---|---|
| Local dev (`pnpm dev`, `NEXT_PUBLIC_APP_URL`) | Default for per-PR runs | Host exactness for Clerk cookies (`localhost` ≠ `127.0.0.1`) |
| Vercel preview (`*.vercel.app`, any non-`main` branch) | Pre-promotion runs; anything involving Stripe test mode + webhooks | Clerk dev-mode quirk: the redirect back from Stripe Checkout can land on sign-in — environment behavior, not a bug (`docs/dev/deployment-environments.md`) |
| Production (`https://addictionboards.com`) | Post-deploy smoke only | **Signed-out/read-only checks by default.** Mutating flows use live Stripe and the real user base — production mutation is owner-initiated only |

## When procedures run

1. **Per PR (touched surfaces):** run the procedure(s) covering the UI you changed; attach representative screenshots to the PR (this operationalizes the existing "Add screenshots/GIFs for UI changes" rule in `AGENTS.md`).
2. **Pre-promotion (dev → main):** the procedures marked `Promotion gate: yes` in the register, against the dev preview.
3. **Post-deploy smoke:** the production-safe subset, against `addictionboards.com`.

## Lifecycle and promotion

`Draft` → `Active` → `Superseded` (promoted or retired). A Draft becomes Active after two evidenced end-to-end runs without step edits. Its behavior flow is promotable when those behavior steps are mechanizable and it has then survived at least two Active runs without step edits; judgment-only visual checks remain manual. Promotion = write the Playwright spec in `tests/e2e/`, set the procedure's `Promoted to:` field, and keep the judgment-only visual checks behind as a slimmed procedure. The register row records both.

## Writing rules

1. One procedure = one user-meaningful surface or flow, executable in ≤ 20 minutes.
2. Steps are *observable actions*, expectations are *verifiable states* — no "verify it works".
3. Use the app's real vocabulary (button labels, headings) so a non-developer could execute it.
4. Preconditions must be executable, not aspirational ("subscribed E2E user" → say which user and how it is reset).
5. Destructive flows (account deletion) get a disposable account requirement in Preconditions — never the shared E2E user.
6. Cite the governing policy doc for every visual check; if a pattern isn't documented, that's a finding under the frontend Discoverability Rule (`.claude/rules/frontend.md`), not a QA pass.
