# DEBT-349: Cross-Request Published Content Caching

**Priority:** P3
**Created:** 2026-04-03
**Source:** Follow-up split from DEBT-344 after Tier 1 request-scoped dedup shipped
**Related:** [ADR-010 Caching Strategy](../adr/adr-010-caching-strategy.md), [DEBT-344 Request-Scoped Auth/Entitlement Dedup + Static Read Caching](../_archive/debt/debt-344-request-scoped-caching.md)

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

DEBT-344 shipped request-scoped `React.cache` dedup for published question and
tag reads. Published question payloads and tag lists are still fetched fresh
across requests.

## Remaining Opportunity

The remaining potential win is cross-request caching for immutable published
content only:

- published question reads by id, slug, and repeated batch lookups
- tag list reads

This does **not** include:

- subscription status
- attempts
- user stats
- any other user-specific or webhook-driven data

## Constraints

- Framework layer only
- Use current Next.js caching primitives if this is pursued
- Land with an explicit invalidation story tied to content updates
- Keep request freshness guarantees for subscription and attempt data unchanged

## When To Do It

Only pursue this if profiling shows the remaining cross-request question/tag
query volume is worth the added invalidation complexity. After the Tier 1 work,
this is an optimization opportunity, not a correctness gap.
