# Package A closeout ledger — 2026-09-20

Audit tree: main `86336194`, dev `bad0c71a`, identical tree
`be773e338368d186e6aaf0bdff8fffb5752fc6b4`. These are measured receipts,
not a declaration that either record is ready to archive.

## Reviewed and promoted work

| PR | Exact approved head | Merge | Proof |
| --- | --- | --- | --- |
| #926 credential policy | `3b731bc2` | `f2baa4bf` | CodeRabbit APPROVED 06:30:50Z; CI `35492272660`; zero unresolved threads |
| #927 merge rules | `c5ace2e2` | `bad0c71a` | CodeRabbit APPROVED 08:30:14Z; CI `35497380295`; zero unresolved threads |
| #928 promotion | `bad0c71a` | `86336194` | CodeRabbit APPROVED 09:38:00Z; CI `35499839823`; zero unresolved threads |

Every source push passed the full local gate. Post-merge main CI
`35502924978` independently passed: unit 462 files / 4,261 tests; browser
65 / 411; integration 43 passing files / 293 tests, plus two intentionally
opt-in provider files / six skipped cases; build 23/23; required E2E 44/44
in 3.2 minutes, without failures or retries. Codecov and preview checks
on the reviewed heads were green, separately from those lane counts.

The source dev head is an ancestor of main (exit 0). No override, admin
merge, direct dev push, or Force Promote was used.

## Provider and local-target re-execution

All provider negative/skip cases used the supported commands and reached
their asserted marker. They do not claim a new live Stripe contract run.

| Invocation condition | Result |
| --- | --- |
| Checkout flag on; no exported key; `pnpm test:integration` with checkout file | exit 1, `PROVIDER_KEY_INVALID` |
| Trial-clock flag on; no exported key; same command with trial file | exit 1, `PROVIDER_KEY_INVALID` |
| Checkout flag on; syntactically valid test-key fixture; dummy Price | exit 1, `PROVIDER_PRICE_INVALID`; no provider request |
| Both provider flags off; both files | exit 0, six cases skipped |
| `STRIPE_SECRET_KEY=` exported to `pnpm test:stripe-provider` | exit 1, `PROVIDER_KEY_INVALID`; dotenv does not override the export |
| `CI=1 DATABASE_URL=`; passthrough unset; checkout file flag off | exit 0, four cases skipped after isolated database preflight |
| Same empty URL with `INTEGRATION_USE_EXISTING_DATABASE=true` | exit 1, required-URL error in wrapper |
| Empty URL passed directly to Vitest's integration config | exit 1, required-URL error in setup |

The last three rows correct DEBT-473's former Verification command: the
supported isolated wrapper must replace an absent/empty inherited URL;
explicit passthrough and direct setup must reject it.

Hosted activation run `33038731445` was re-read through `gh run view --log`:
`[stripe-provider] PASS executed=6 passed=6 skipped=0`. Its head is
`3162a7be91e57eb5c66f0575d675414c91646991`; the ancestry check from provider
gate commit `934e57a319ae45e0aec807a4e903368f13c364af` exits 0.

## Settings and deployment

- Ruleset `17666822` API readback: active, explicit main/dev targets, no
  bypass actors; PR required, zero approvals, resolved review threads,
  strict GitHub Actions `test`, deletion and non-fast-forward protection.
- Dependabot secret-store count: zero. Actions CRON_SECRET count: zero.
- Vercel rotation: one generated value, present / length 64 / header-safe
  before submission; no plaintext file or output. Scope updates succeeded
  at 09:39:23.517Z (Production), 09:39:24.877Z (Preview), and 09:39:26.314Z
  (Development). API metadata confirms all three updates and zero branch
  Preview overrides. Sensitive plaintext was not retrieved.
- Production build Ready at 09:41:13.039Z; still staged, no alias assigned,
  old release serving through the 09:48:24Z observation. Main `test`
  completed 09:50:03Z; Vercel's check succeeded 09:50:05.268Z; production
  alias moved to `86336194` at 09:50:05.476Z. Home and health returned 200.
- [Durable GitHub promotion receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/928#issuecomment-5749060434).

## Evidence still pending

1. **DEBT-473:** the first real Dependabot run after the policy change must
   show the decided reason in its evidence summary while E2E is skipped.
   The Actions API query for actor `dependabot[bot]` since September 20
   returned zero runs. The exact YAML contract and earlier mutation proof
   are not mislabeled as that hosted receipt. Do not execute a bot head
   locally with shared credentials to manufacture it.
2. **DEBT-474:** scheduled reconciliation and renewal-notice invocations
   after rotation and deployment must each return 200. The new production
   deployment had zero cron records at 09:51Z. The scheduled hours are
   08:00 and 09:00 UTC respectively; earlier pre-rotation successes do not
   count. No manual invocation of production billing jobs was performed.

Both records remain Open until their respective missing receipts exist.

## Local closeout-document verification

- Focused provider gate, skip policy, CI workflow, local E2E/integration
  plans, and integration setup: six files / 98 cases passed.
- The four touched documents have 534 checked relative file destinations,
  zero missing destinations, and exactly one register Latest stanza. This
  is not a claim that unrelated historical links or heading anchors were
  repaired or globally verified.
- While scheduled/bot evidence is pending, the executor continues the next
  already-authorized DEBT-475 mechanism serially. Neither record is archived
  or described as resolved to permit that sequencing adjustment.
