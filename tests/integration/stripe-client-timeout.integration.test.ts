import { createServer, type RequestListener } from 'node:http';
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createStripeClient } from '@/lib/stripe-client';
import { callStripeWithRetry } from '@/src/adapters/gateways/stripe/stripe-retry';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

const CUSTOMER = { id: 'cus_loopback', object: 'customer' };
// End the old unbounded request too, so a red test leaves no work running.
const FALLBACK_RESPONSE_MS = 4_500;
const TRICKLE_INTERVAL_MS = 25;

async function withStripeServer(
  handler: RequestListener,
  run: (stripe: Stripe) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Loopback server has no TCP address');
  }
  try {
    await run(
      createStripeClient('sk_test_loopback_only', {
        host: '127.0.0.1',
        port: address.port,
        protocol: 'http',
      }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function retrieve(stripe: Stripe) {
  return callStripeWithRetry({
    operation: 'customers.retrieve',
    fn: () => stripe.customers.retrieve(CUSTOMER.id),
    logger: new FakeLogger(),
  });
}

describe('the shared Stripe client on loopback', () => {
  it.each([
    { mode: 'silent', expectedRequests: 2 },
    { mode: 'trickling', expectedRequests: 1 },
  ] as const)(
    'aborts each $mode response before the fallback and closes the server connection',
    async ({ mode, expectedRequests }) => {
      const closedResponses: Promise<{
        fallbackSent: boolean;
        elapsedMs: number;
      }>[] = [];
      await withStripeServer(
        (_request, response) => {
          const closed = Promise.withResolvers<{
            fallbackSent: boolean;
            elapsedMs: number;
          }>();
          closedResponses.push(closed.promise);
          const started = performance.now();
          let fallbackSent = false;
          let trickle: ReturnType<typeof setInterval> | undefined;
          if (mode === 'trickling') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.write(' ');
            trickle = setInterval(
              () => response.write(' '),
              TRICKLE_INTERVAL_MS,
            );
          }
          const fallback = setTimeout(() => {
            fallbackSent = true;
            clearInterval(trickle);
            response.end(JSON.stringify(CUSTOMER));
          }, FALLBACK_RESPONSE_MS);
          response.once('close', () => {
            clearTimeout(fallback);
            clearInterval(trickle);
            closed.resolve({
              fallbackSent,
              elapsedMs: performance.now() - started,
            });
          });
        },
        async (stripe) => {
          // Only a pre-header timeout is retried by the SDK. A body timeout
          // becomes a StripeConnectionError after its retry decision; neither
          // timeout has the top-level code/status our outer retry requires.
          await expect(retrieve(stripe)).rejects.toMatchObject({
            type: 'StripeConnectionError',
          });
          expect(closedResponses).toHaveLength(expectedRequests);
          for (const closed of await Promise.all(closedResponses)) {
            expect(closed.fallbackSent).toBe(false);
            expect(closed.elapsedMs).toBeGreaterThanOrEqual(2_500);
            expect(closed.elapsedMs).toBeLessThan(FALLBACK_RESPONSE_MS);
          }
        },
      );
    },
  );

  it.each([
    { status: 500, retryHeader: undefined, expectedRequests: 6 },
    { status: 409, retryHeader: undefined, expectedRequests: 2 },
    { status: 400, retryHeader: 'true', expectedRequests: 2 },
    { status: 500, retryHeader: 'false', expectedRequests: 3 },
  ])(
    'keeps $status with stripe-should-retry=$retryHeader to $expectedRequests HTTP requests',
    async ({ status, retryHeader, expectedRequests }) => {
      let requests = 0;
      await withStripeServer(
        (_request, response) => {
          requests += 1;
          response.writeHead(status, {
            'content-type': 'application/json',
            ...(retryHeader ? { 'stripe-should-retry': retryHeader } : {}),
          });
          response.end(
            JSON.stringify({
              error: {
                type: 'api_error',
                message: 'Synthetic loopback refusal',
              },
            }),
          );
        },
        async (stripe) => {
          await expect(retrieve(stripe)).rejects.toMatchObject({
            statusCode: status,
          });
          expect(requests).toBe(expectedRequests);
        },
      );
    },
  );

  it('honors a caller override that disables SDK retries', async () => {
    let requests = 0;
    await withStripeServer(
      (_request, response) => {
        requests += 1;
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { type: 'api_error' } }));
      },
      async (stripe) => {
        await expect(
          stripe.customers.retrieve(CUSTOMER.id, {}, { maxNetworkRetries: 0 }),
        ).rejects.toMatchObject({ statusCode: 500 });
        expect(requests).toBe(1);
      },
    );
  });

  it('honors a shorter caller timeout through a trickling body', async () => {
    const closed = Promise.withResolvers<boolean>();
    await withStripeServer(
      (_request, response) => {
        let fallbackSent = false;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write(' ');
        const trickle = setInterval(
          () => response.write(' '),
          TRICKLE_INTERVAL_MS,
        );
        const fallback = setTimeout(() => {
          fallbackSent = true;
          clearInterval(trickle);
          response.end(JSON.stringify(CUSTOMER));
        }, 500);
        response.once('close', () => {
          clearTimeout(fallback);
          clearInterval(trickle);
          closed.resolve(fallbackSent);
        });
      },
      async (stripe) => {
        await expect(
          stripe.customers.retrieve(CUSTOMER.id, {}, { timeout: 100 }),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        expect(await closed.promise).toBe(false);
      },
    );
  });

  it('keeps the SDK-generated write key across its retry', async () => {
    const receivedKeys: (string | string[] | undefined)[] = [];
    await withStripeServer(
      (request, response) => {
        receivedKeys.push(request.headers['idempotency-key']);
        response.writeHead(receivedKeys.length === 1 ? 500 : 200, {
          'content-type': 'application/json',
        });
        response.end(
          JSON.stringify(
            receivedKeys.length === 1
              ? { error: { type: 'api_error' } }
              : CUSTOMER,
          ),
        );
      },
      async (stripe) => {
        await expect(stripe.customers.create({})).resolves.toMatchObject(
          CUSTOMER,
        );
        expect(receivedKeys).toHaveLength(2);
        expect(receivedKeys[0]).toMatch(/^stripe-node-retry-/);
        expect(receivedKeys[1]).toBe(receivedKeys[0]);
      },
    );
  });

  it('keeps a write whose response is cut off indeterminate and preserves its key for a later retry', async () => {
    const idempotencyKey = crypto.randomUUID();
    const receivedKeys: (string | string[] | undefined)[] = [];
    await withStripeServer(
      (request, response) => {
        receivedKeys.push(request.headers['idempotency-key']);
        request.resume();
        request.once('end', () => {
          response.writeHead(200, { 'content-type': 'application/json' });
          if (receivedKeys.length === 1) {
            // The provider received the write. Cut off its response after
            // headers; the caller cannot infer whether the write committed.
            response.write('{');
            setImmediate(() => response.destroy());
          } else {
            response.end(JSON.stringify(CUSTOMER));
          }
        });
      },
      async (stripe) => {
        const write = () => stripe.customers.create({}, { idempotencyKey });
        await expect(write()).rejects.toMatchObject({
          type: 'StripeConnectionError',
        });
        expect(receivedKeys).toEqual([idempotencyKey]);
        await expect(write()).resolves.toMatchObject(CUSTOMER);
        expect(receivedKeys).toEqual([idempotencyKey, idempotencyKey]);
      },
    );
  });
});
