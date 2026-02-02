# BUG-009: Vercel Preview Deployment Status Fails Due to Rate Limit

**Status:** Won't Fix
**Priority:** P3
**Date:** 2026-02-01

---

## Description

Pull requests can show a failing `Vercel` status check even when the code is correct.
The failure message indicates Vercel preview deployments are being rate limited.

This creates noisy red CI and can mislead reviewers into thinking the PR is broken.

## Steps to Reproduce

1. Open or update a PR.
2. Observe the `Vercel` status/check on the PR.
3. See a failure similar to:
   - `Resource is limited - try again in X hours (api-deployments-free-per-day)`

## Root Cause

The Vercel integration is hitting a free-tier/plan deployment limit for preview deployments.

## Fix

Won't fix in code. This is expected behavior on the current Vercel plan.

Options (operational):

- Upgrade the Vercel plan to raise/remove preview deployment limits.
- Reduce preview deployments (e.g., only deploy on certain branches).
- Adjust/disable the PR status integration if it is not required for merge.

## Verification

- [x] Confirm merges are not blocked by Vercel failures (treat as advisory).

## Related

- PR #18: Vercel status failure due to rate limiting
