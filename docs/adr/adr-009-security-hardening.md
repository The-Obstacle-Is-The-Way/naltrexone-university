# ADR-009: Security Hardening

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture), ADR-004 (Auth Boundary), ADR-005 (Payment Boundary)

---

## Context

Security is critical for a medical education SaaS handling:

1. **User authentication** — Must prevent unauthorized access
2. **Payment data** — PCI DSS compliance via Stripe
3. **User data** — Email addresses, usage history
4. **Content protection** — Paid subscription content

This ADR consolidates security decisions across all layers, referencing OWASP Top 10 and current best practices.

**References:**
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Next.js Security Checklist](https://nextjs.org/docs/app/building-your-application/deploying/production-checklist)
- [Clerk Security](https://clerk.com/docs/security)
- [Stripe Security](https://stripe.com/docs/security)

## Decision

We implement **defense in depth** with security controls at each architectural layer.

### Security Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL THREATS                                │
│  XSS, CSRF, Injection, Auth Bypass, Data Exposure, Misconfiguration    │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EDGE / CDN (Vercel)                                 │
│                                                                          │
│   ✓ HTTPS only (automatic)                                              │
│   ✓ DDoS protection                                                      │
│   ✓ WAF rules (Vercel Pro)                                              │
│   ✓ Rate limiting                                                        │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      MIDDLEWARE (proxy.ts)                               │
│                                                                          │
│   ✓ Clerk authentication                                                │
│   ✓ Route protection                                                     │
│   ✓ Security headers                                                     │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                                   │
│                                                                          │
│   ✓ Input validation (Zod)                                              │
│   ✓ Authorization checks                                                 │
│   ✓ Subscription entitlement                                            │
│   ✓ Error sanitization                                                   │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                          │
│                                                                          │
│   ✓ Parameterized queries (Drizzle)                                     │
│   ✓ Row-level access control                                             │
│   ✓ Encryption at rest (Neon)                                           │
│   ✓ No raw SQL                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### OWASP Top 10 Mitigations

#### A01:2021 — Broken Access Control

**Mitigations:**

1. **Server-side authorization** — Never trust client-side checks

```typescript
// app/(app)/app/layout.tsx — Server Component
import { redirect } from 'next/navigation';
import { getAuthGateway, createCheckEntitlementUseCase } from '@/lib/container';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authGateway = getAuthGateway();
  const user = await authGateway.getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const entitlementUseCase = createCheckEntitlementUseCase();
  const { isEntitled } = await entitlementUseCase.execute({ userId: user.id });

  if (!isEntitled) {
    redirect('/pricing');
  }

  return <>{children}</>;
}
```

2. **Resource ownership checks** — Every data access verifies ownership

```typescript
// Use case checks ownership
async execute(input: { userId: string; sessionId: string }) {
  const session = await this.sessions.findById(input.sessionId);

  if (!session) {
    throw new ApplicationError('NOT_FOUND', 'Session not found');
  }

  // CRITICAL: Verify ownership
  if (session.userId !== input.userId) {
    throw new ApplicationError('NOT_FOUND', 'Session not found'); // Don't reveal existence
  }
}
```

3. **Deny by default** — Routes require auth unless explicitly public

```typescript
// proxy.ts
const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect(); // Deny if not authenticated
  }
});
```

#### A02:2021 — Cryptographic Failures

**Mitigations:**

1. **HTTPS only** — Vercel enforces HTTPS
2. **No secrets in code** — Environment variables only
3. **Secure sessions** — Clerk handles session cookies
4. **No custom crypto** — Use proven libraries

```typescript
// lib/env.ts — Validate secrets exist
import { z } from 'zod';

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
});

// Throws on missing secrets
export const env = serverSchema.parse(process.env);
```

#### A03:2021 — Injection

**Mitigations:**

1. **Parameterized queries** — Drizzle ORM only, no raw SQL

```typescript
// GOOD: Drizzle parameterized query
await db.select().from(users).where(eq(users.id, userId));

// BAD: Raw SQL with string interpolation (NEVER DO THIS)
// await db.execute(`SELECT * FROM users WHERE id = '${userId}'`);
```

2. **Input validation** — Zod schemas for all input

```typescript
// All server action inputs validated
export const SubmitAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  choiceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
}).strict(); // Reject unknown fields

export async function submitAnswer(input: unknown) {
  const parsed = SubmitAnswerInputSchema.parse(input);
  // Now safe to use parsed.questionId, etc.
}
```

3. **Markdown sanitization** — Rehype-sanitize for user content

```typescript
// lib/markdown-config.ts
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'table', 'thead', 'tbody', 'tr', 'th', 'td', // GFM tables
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'], // Syntax highlighting
  },
};
```

#### A04:2021 — Insecure Design

**Mitigations:**

1. **Clean Architecture** — Security decisions at boundaries
2. **Threat modeling** — Identified critical paths
3. **Principle of least privilege** — Each component has minimal access

#### A05:2021 — Security Misconfiguration

**Mitigations:**

1. **Security headers** — Set in Next.js config

```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
  ],
};
```

2. **No debug in production** — Environment-based configuration

```typescript
// lib/logger.ts
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? 'info' : 'debug';
```

#### A06:2021 — Vulnerable Components

**Mitigations:**

1. **Automated updates** — Dependabot/Renovate enabled
2. **Lock file** — pnpm-lock.yaml committed
3. **Audit** — `pnpm audit` in CI

```yaml
# .github/workflows/ci.yml
- name: Security audit
  run: pnpm audit --audit-level=high
```

#### A07:2021 — Authentication Failures

**Mitigations:**

1. **Delegate to Clerk** — Battle-tested auth provider
2. **No custom password handling** — Clerk manages credentials
3. **Session management** — Clerk handles securely

```typescript
// We NEVER handle passwords
// Clerk provides:
// - Secure password hashing
// - Session token management
// - MFA support
// - Brute force protection
```

#### A08:2021 — Software and Data Integrity

**Mitigations:**

1. **Webhook signature verification** — Stripe webhooks verified

```typescript
// MANDATORY: Verify Stripe webhook signature
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  env.STRIPE_WEBHOOK_SECRET
);
// Only trust event after verification
```

2. **Subresource integrity** — Next.js handles for chunks
3. **CI/CD security** — GitHub Actions with limited permissions

#### A09:2021 — Security Logging & Monitoring

**Mitigations:**

1. **Structured logging** — See ADR-008
2. **Error tracking** — Log errors with context
3. **Audit trail** — Log auth and payment events

```typescript
// Log security-relevant events
log.info({ userId, action: 'subscription.created' }, 'User subscribed');
log.warn({ userId, action: 'auth.failed' }, 'Authentication failed');
```

#### A10:2021 — Server-Side Request Forgery

**Mitigations:**

1. **No user-controlled URLs** — We don't fetch arbitrary URLs
2. **Allow-list for external services** — Only Stripe, Clerk, Neon

### Content Security Policy

```typescript
// next.config.ts
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.com https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://img.clerk.com;
  font-src 'self';
  connect-src 'self' https://api.clerk.com https://api.stripe.com wss://*.clerk.accounts.dev;
  frame-src https://js.stripe.com https://clerk.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;
```

### Rate Limiting

Implement at the edge with Vercel or in middleware:

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
  analytics: true,
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  return { success, limit, reset, remaining };
}

// Usage in server action
export async function submitAnswer(input: SubmitAnswerInput) {
  const user = await authGateway.requireUser();

  const { success } = await checkRateLimit(`submit:${user.id}`);
  if (!success) {
    throw new ApplicationError('RATE_LIMITED', 'Too many requests');
  }

  // Continue with logic
}
```

### Secrets Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SECRETS HIERARCHY                               │
│                                                                          │
│   1. Vercel Environment Variables (production)                          │
│      - Encrypted at rest                                                 │
│      - Scoped to environments (dev/preview/production)                  │
│                                                                          │
│   2. .env.local (local development)                                     │
│      - NEVER committed to git                                           │
│      - .env.example shows required vars (no values)                     │
│                                                                          │
│   3. CI Secrets (GitHub Actions)                                        │
│      - Repository secrets                                                │
│      - Accessed via ${{ secrets.VAR_NAME }}                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Protection

1. **Minimize data collection** — Only collect what's needed
2. **User deletion** — Support account deletion (cascade in schema)
3. **No PII in logs** — See ADR-008

```sql
-- Schema enforces cascade deletion
CREATE TABLE attempts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE
);
-- Deleting user deletes all their attempts
```

## Security Checklist

### Pre-Launch

- [ ] All secrets in environment variables (not code)
- [ ] Security headers configured
- [ ] CSP policy set
- [ ] Rate limiting enabled
- [ ] `pnpm audit` passes
- [ ] No `console.log` with sensitive data
- [ ] Error messages don't leak internals
- [ ] All inputs validated with Zod
- [ ] Webhook signatures verified

### Ongoing

- [ ] Dependabot/Renovate enabled
- [ ] Security monitoring alerts configured
- [ ] Regular security review (quarterly)
- [ ] Clerk and Stripe dashboards monitored
- [ ] Log review for anomalies

## Consequences

### Positive

1. **Defense in Depth** — Multiple layers of protection
2. **Industry Standards** — OWASP compliance
3. **Delegated Risk** — Auth and payments to specialists

### Negative

1. **Complexity** — More configuration to maintain
2. **Performance** — Some overhead from validation/rate limiting

### Mitigations

- Automate security checks in CI
- Use established libraries (Clerk, Stripe, Zod)
- Regular security training

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Clerk Security](https://clerk.com/docs/security)
- [Stripe Security Best Practices](https://stripe.com/docs/security/guide)
