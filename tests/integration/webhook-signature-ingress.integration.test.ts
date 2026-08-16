import { createHmac, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { POST as postStripeWebhook } from '@/app/api/stripe/webhook/route';
import { POST as postClerkWebhook } from '@/app/api/webhooks/clerk/route';
import * as schema from '@/db/schema';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const clerkEventIds: string[] = [];
const clerkUserIds: string[] = [];
const stripe = new Stripe(requireTestSecret('STRIPE_SECRET_KEY'));

function requireTestSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for integration tests`);
  return value;
}

function createProviderId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function createTestIp(): string {
  const octets = randomUUID()
    .replaceAll('-', '')
    .slice(0, 6)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16));
  return `198.51.${octets?.[0] ?? 100}.${octets?.[1] ?? 100}`;
}

function trackRateLimitKey(provider: 'clerk' | 'stripe', ip: string): void {
  cleanup.rateLimitKeys.push(`webhook:${provider}:${ip}`);
}

function createStripePayload(eventId: string): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-05-27.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'invoice.updated',
  });
}

function createStripeSignature(input: {
  payload: string;
  secret?: string;
  timestamp?: number;
}): string {
  return stripe.webhooks.generateTestHeaderString({
    payload: input.payload,
    secret: input.secret ?? requireTestSecret('STRIPE_WEBHOOK_SECRET'),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
  });
}

function createStripeRequest(input: {
  payload: string;
  signature: string;
  ip: string;
}): Request {
  trackRateLimitKey('stripe', input.ip);
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': input.signature,
      'x-forwarded-for': input.ip,
    },
    body: input.payload,
  });
}

function createClerkPayload(input: {
  clerkUserId: string;
  email: string;
}): string {
  const emailId = createProviderId('idn');
  return JSON.stringify({
    data: {
      id: input.clerkUserId,
      email_addresses: [{ id: emailId, email_address: input.email }],
      primary_email_address_id: emailId,
      updated_at: Date.now(),
    },
    object: 'event',
    type: 'user.updated',
  });
}

function createClerkHeaders(input: {
  eventId: string;
  payload: string;
  secret?: string;
  timestamp?: number;
}): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const secret =
    input.secret ?? requireTestSecret('CLERK_WEBHOOK_SIGNING_SECRET');
  const encodedSecret = secret.startsWith('whsec_')
    ? secret.slice('whsec_'.length)
    : secret;
  const signature = createHmac('sha256', Buffer.from(encodedSecret, 'base64'))
    .update(`${input.eventId}.${timestamp}.${input.payload}`)
    .digest('base64');
  return {
    'svix-id': input.eventId,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
}

function createClerkRequest(input: {
  payload: string;
  headers: Record<string, string>;
  ip: string;
}): Request {
  trackRateLimitKey('clerk', input.ip);
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': input.ip,
      ...input.headers,
    },
    body: input.payload,
  });
}

afterEach(async () => {
  if (clerkEventIds.length > 0) {
    await db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, clerkEventIds));
  }
  if (clerkUserIds.length > 0) {
    await db
      .delete(schema.users)
      .where(inArray(schema.users.clerkUserId, clerkUserIds));
  }
  clerkEventIds.length = 0;
  clerkUserIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('Stripe webhook signature ingress', () => {
  it('accepts a genuinely signed event and persists its processed receipt', async () => {
    const eventId = createProviderId('evt');
    const payload = createStripePayload(eventId);
    cleanup.stripeEventIds.push(eventId);

    const response = await postStripeWebhook(
      createStripeRequest({
        payload,
        signature: createStripeSignature({ payload }),
        ip: createTestIp(),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    await expect(
      db.query.stripeEvents.findFirst({
        where: eq(schema.stripeEvents.id, eventId),
      }),
    ).resolves.toMatchObject({
      id: eventId,
      type: 'invoice.updated',
      error: null,
      processedAt: expect.any(Date),
    });
  });

  it.each([
    ['tampered body', 'tampered'],
    ['wrong secret', 'wrong-secret'],
    ['stale timestamp', 'stale-timestamp'],
  ] as const)(
    'rejects a %s without persisting the event',
    async (_label, kind) => {
      const eventId = createProviderId('evt');
      cleanup.stripeEventIds.push(eventId);
      const originalPayload = createStripePayload(eventId);
      const payload =
        kind === 'tampered'
          ? originalPayload.replace('invoice.updated', 'invoice.created')
          : originalPayload;
      const signature = createStripeSignature({
        payload: originalPayload,
        ...(kind === 'wrong-secret'
          ? { secret: 'whsec_wrong_integration_secret' }
          : {}),
        ...(kind === 'stale-timestamp'
          ? { timestamp: Math.floor(Date.now() / 1000) - 600 }
          : {}),
      });

      const response = await postStripeWebhook(
        createStripeRequest({ payload, signature, ip: createTestIp() }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Webhook validation failed',
      });
      await expect(
        db.query.stripeEvents.findFirst({
          where: eq(schema.stripeEvents.id, eventId),
        }),
      ).resolves.toBeUndefined();
    },
  );
});

describe('Clerk webhook signature ingress', () => {
  it('accepts a genuinely signed event and persists the user and processed receipt', async () => {
    const eventId = createProviderId('msg');
    const clerkUserId = createProviderId('user');
    const email = `${randomUUID()}@example.com`;
    const payload = createClerkPayload({ clerkUserId, email });
    clerkEventIds.push(eventId);
    clerkUserIds.push(clerkUserId);

    const response = await postClerkWebhook(
      createClerkRequest({
        payload,
        headers: createClerkHeaders({ eventId, payload }),
        ip: createTestIp(),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    const user = await db.query.users.findFirst({
      where: eq(schema.users.clerkUserId, clerkUserId),
    });
    expect(user).toMatchObject({ clerkUserId, email });
    if (!user) throw new Error('Expected signed Clerk event to create user');
    await expect(
      db.query.clerkEvents.findFirst({
        where: eq(schema.clerkEvents.id, eventId),
      }),
    ).resolves.toMatchObject({
      id: eventId,
      type: 'user.updated',
      error: null,
      processedAt: expect.any(Date),
    });
  });

  it.each([
    ['tampered body', 'tampered'],
    ['wrong secret', 'wrong-secret'],
    ['stale timestamp', 'stale-timestamp'],
  ] as const)(
    'rejects a %s without persisting the event or user',
    async (_label, kind) => {
      const eventId = createProviderId('msg');
      const clerkUserId = createProviderId('user');
      clerkEventIds.push(eventId);
      clerkUserIds.push(clerkUserId);
      const originalPayload = createClerkPayload({
        clerkUserId,
        email: `${randomUUID()}@example.com`,
      });
      const payload =
        kind === 'tampered'
          ? originalPayload.replace('user.updated', 'user.deleted')
          : originalPayload;
      const headers = createClerkHeaders({
        eventId,
        payload: originalPayload,
        ...(kind === 'wrong-secret'
          ? { secret: 'whsec_d3JvbmdfaW50ZWdyYXRpb25fc2VjcmV0' }
          : {}),
        ...(kind === 'stale-timestamp'
          ? { timestamp: Math.floor(Date.now() / 1000) - 600 }
          : {}),
      });

      const response = await postClerkWebhook(
        createClerkRequest({ payload, headers, ip: createTestIp() }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid webhook signature',
      });
      await expect(
        db.query.clerkEvents.findFirst({
          where: eq(schema.clerkEvents.id, eventId),
        }),
      ).resolves.toBeUndefined();
      await expect(
        db.query.users.findFirst({
          where: eq(schema.users.clerkUserId, clerkUserId),
        }),
      ).resolves.toBeUndefined();
    },
  );
});
