# BUG-061: Debt Index Claims No Active Items While Listing DEBT-102

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

`docs/debt/index.md` stated `_No active debt items._` but also listed an active debt entry (`DEBT-102`) in the table immediately below.

This is documentation drift that can mislead triage and planning.

---

## Steps to Reproduce

1. Open `docs/debt/index.md`.
2. Observe `_No active debt items._` above the active debt table.

---

## Root Cause

The index header text was not updated when DEBT-102 was added.

---

## Fix

Remove the incorrect `_No active debt items._` line so the index accurately reflects the active register.

---

## Verification

- [x] Manual doc review

---

## Related

- `docs/debt/index.md`

