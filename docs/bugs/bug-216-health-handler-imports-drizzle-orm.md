# BUG-216: Health Handler Directly Imports `drizzle-orm` in App Layer

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

The health check handler at `app/api/health/handler.ts:1` imports `{ type SQLWrapper, sql } from 'drizzle-orm'` directly. The handler builds and executes a `SELECT 1` query using the ORM, coupling the app layer to a specific database library. This should use an abstracted health-check port.

## Impact

- The app layer has a direct dependency on `drizzle-orm` internals.
- If the ORM changes, the health handler must change -- it should only depend on a `HealthCheckGateway.ping()` abstraction.
- Minor architectural inconsistency compared to other handlers which use injected ports.

## Location

- `app/api/health/handler.ts:1`

## Suggested Fix

Create a `ping(): Promise<void>` method on an existing gateway or repository port, and call it from the handler instead of using raw `sql` directly.
