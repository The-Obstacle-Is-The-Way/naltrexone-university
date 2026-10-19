import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { describe, expect, it } from 'vitest';
import { createRequestContainer } from '@/lib/container';
import { createStripeClient } from '@/lib/stripe-client';
import { StripeCallBudget } from '@/src/adapters/gateways/stripe/stripe-call-budget';
import { callStripeWithRetry } from '@/src/adapters/gateways/stripe/stripe-retry';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

async function withServer(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
  run: (
    client: (
      budget: StripeCallBudget,
      timeoutMs?: number,
      logger?: FakeLogger,
    ) => ReturnType<typeof createStripeClient>,
  ) => Promise<void>,
) {
  const server = createServer((request, response) => {
    // A failed regression must not leave an unanswered socket behind.
    const fallback = setTimeout(() => response.end('{}'), 2_500);
    response.once('close', () => clearTimeout(fallback));
    respond(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No loopback port');
  try {
    await run((budget, timeoutMs = 10_000, logger) =>
      createStripeClient(
        'sk_test_loopback_only',
        {
          host: '127.0.0.1',
          port: address.port,
          protocol: 'http',
        },
        { timeoutMs, maxNetworkRetries: 1 },
        budget,
        logger,
      ),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function customer(response: ServerResponse) {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ id: 'cus_loopback', object: 'customer' }));
}

describe('Stripe caller budget on loopback', () => {
  it('bounds silence across attempts and backoff and closes the in-flight connection', async () => {
    let requests = 0;
    let closed = false;
    await withServer(
      (_request, response) => {
        requests += 1;
        response.once('close', () => {
          closed = true;
        });
      },
      async (client) => {
        const budget = new StripeCallBudget(100);
        const stripe = client(budget);
        const started = performance.now();
        await expect(
          callStripeWithRetry({
            operation: 'customers.retrieve',
            budget,
            fn: () => stripe.customers.retrieve('cus_loopback'),
            logger: new FakeLogger(),
          }),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        expect(performance.now() - started).toBeLessThan(350);
        await expect.poll(() => closed).toBe(true);
        expect(requests).toBe(1);
      },
    );
  });

  it('aborts a trickling body at the caller deadline', async () => {
    let requests = 0;
    let closed = false;
    await withServer(
      (_request, response) => {
        requests += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"id":"');
        const trickle = setInterval(() => response.write('x'), 10);
        response.once('close', () => {
          clearInterval(trickle);
          closed = true;
        });
      },
      async (client) => {
        await expect(
          client(new StripeCallBudget(100)).customers.retrieve('cus_loopback'),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        await expect.poll(() => closed).toBe(true);
        expect(requests).toBe(1);
      },
    );
  });

  it('does not start backoff when the remaining budget cannot fit it', async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { type: 'api_error', message: 'Loopback failure' },
          }),
        );
      },
      async (client) => {
        const started = performance.now();
        await expect(
          client(new StripeCallBudget(100)).customers.retrieve('cus_loopback'),
        ).rejects.toMatchObject({ type: 'StripeAPIError' });
        expect(performance.now() - started).toBeLessThan(350);
        expect(requests).toBe(1);
      },
    );
  });

  it('uses one retry owner and cancels a retryable response body before backoff', async () => {
    let requests = 0;
    let firstClosed = false;
    await withServer(
      (_request, response) => {
        requests += 1;
        if (requests === 1) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.write('{');
          response.once('close', () => {
            firstClosed = true;
          });
        } else customer(response);
      },
      async (client) => {
        const budget = new StripeCallBudget(1_000);
        const stripe = client(budget);
        await expect(
          callStripeWithRetry({
            operation: 'customers.retrieve',
            budget,
            fn: () => stripe.customers.retrieve('cus_loopback'),
            logger: new FakeLogger(),
          }),
        ).resolves.toMatchObject({ id: 'cus_loopback' });
        expect(firstClosed).toBe(true);
        expect(requests).toBe(2);
      },
    );
  });

  it('caps the next attempt at the remaining deadline after backoff', async () => {
    let requests = 0;
    let closed = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        response.once('close', () => {
          closed += 1;
        });
      },
      async (client) => {
        const started = performance.now();
        await expect(
          client(new StripeCallBudget(650), 100).customers.retrieve(
            'cus_loopback',
          ),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        expect(performance.now() - started).toBeLessThan(900);
        await expect.poll(() => closed).toBe(2);
        expect(requests).toBe(2);
      },
    );
  });

  it('bounds a closed connection without an extra SDK retry', async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        response.destroy();
      },
      async (client) => {
        await expect(
          client(new StripeCallBudget(1_000)).customers.retrieve(
            'cus_loopback',
          ),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        expect(requests).toBe(2);
      },
    );
  });

  it('shares the deadline across sequential calls and refuses a third without contacting the server', async () => {
    let requests = 0;
    let closed = false;
    await withServer(
      (_request, response) => {
        requests += 1;
        if (requests === 1) {
          const timer = setTimeout(() => customer(response), 100);
          response.once('close', () => clearTimeout(timer));
        } else
          response.once('close', () => {
            closed = true;
          });
      },
      async (client) => {
        const budget = new StripeCallBudget(200);
        const stripe = client(budget);
        const call = () =>
          callStripeWithRetry({
            operation: 'customers.retrieve',
            budget,
            fn: () => stripe.customers.retrieve('cus_loopback'),
            logger: new FakeLogger(),
          });
        const started = performance.now();
        await call();
        await expect(call()).rejects.toMatchObject({
          type: 'StripeConnectionError',
        });
        await expect(call()).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
        expect(performance.now() - started).toBeLessThan(450);
        await expect.poll(() => closed).toBe(true);
        expect(requests).toBe(2);
      },
    );
  });

  it('preserves an unknown write outcome and recovers with the same idempotency key', async () => {
    const keys: Array<string | undefined> = [];
    const written = new Set<string>();
    await withServer(
      (request, response) => {
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string')
          throw new Error('Expected an idempotency key');
        keys.push(key);
        written.add(key);
        if (keys.length === 1) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.write('{');
        } else customer(response);
      },
      async (client) => {
        const options = { idempotencyKey: 'customer-recovery-loopback' };
        await expect(
          client(new StripeCallBudget(100)).customers.create({}, options),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        await expect(
          client(new StripeCallBudget(1_000)).customers.create({}, options),
        ).resolves.toMatchObject({ id: 'cus_loopback' });
        expect(keys).toEqual([options.idempotencyKey, options.idempotencyKey]);
        expect(written.size).toBe(1);
      },
    );
  });

  it('shares the request-container budget through customer search and creation', async () => {
    let requests = 0;
    let closed = false;
    await withServer(
      (request, response) => {
        requests += 1;
        if (request.url?.startsWith('/v1/customers/search')) {
          response.setHeader('content-type', 'application/json');
          response.end(
            JSON.stringify({
              object: 'search_result',
              data: [],
              has_more: false,
            }),
          );
        } else
          response.once('close', () => {
            closed = true;
          });
      },
      async (client) => {
        const budget = new StripeCallBudget(150);
        const container = createRequestContainer({
          primitives: {
            stripeBudget: budget,
            getStripe: () => client(budget),
          },
        });
        expect(container.stripeBudget).toBe(budget);
        expect(container.stripe).toBe(container.stripe);
        await expect(
          container.createPaymentGateway().createCustomer({
            userId: crypto.randomUUID(),
            clerkUserId: 'user_loopback',
            email: 'loopback@example.com',
          }),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        await expect.poll(() => closed).toBe(true);
        expect(requests).toBe(2);
      },
    );
  });

  it('refuses a positive SDK retry override before making a request', async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        customer(response);
      },
      async (client) => {
        const budget = new StripeCallBudget(1_000);
        const container = createRequestContainer({
          primitives: { stripeBudget: budget, getStripe: () => client(budget) },
        });
        await expect(
          container.stripe.customers.create({}, { maxNetworkRetries: 1 }),
        ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
        expect(requests).toBe(0);
      },
    );
  });

  it.each([
    { status: 429, directive: undefined, attempts: 2 },
    { status: 409, directive: undefined, attempts: 2 },
    { status: 400, directive: 'true', attempts: 2 },
    { status: 500, directive: 'false', attempts: 1 },
    { status: 400, directive: undefined, attempts: 1 },
  ])(
    'keeps one retry policy for status $status and directive $directive',
    async ({ status, directive, attempts }) => {
      let requests = 0;
      await withServer(
        (_request, response) => {
          requests += 1;
          if (requests > 1) {
            customer(response);
            return;
          }
          response.statusCode = status;
          response.setHeader('content-type', 'application/json');
          if (directive) response.setHeader('stripe-should-retry', directive);
          response.end(
            JSON.stringify({
              error: { type: 'api_error', message: 'Loopback failure' },
            }),
          );
        },
        async (client) => {
          const result = client(new StripeCallBudget(1_000)).customers.retrieve(
            'cus_loopback',
          );
          if (attempts === 1)
            await expect(result).rejects.toMatchObject({ statusCode: status });
          else
            await expect(result).resolves.toMatchObject({ id: 'cus_loopback' });
          expect(requests).toBe(attempts);
        },
      );
    },
  );

  it('does not let a per-request timeout raise the configured attempt limit', async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        const timer = setTimeout(() => customer(response), 800);
        response.once('close', () => clearTimeout(timer));
      },
      async (client) => {
        const started = performance.now();
        await expect(
          client(new StripeCallBudget(2_000), 50).customers.retrieve(
            'cus_loopback',
            {},
            { timeout: 1_000 },
          ),
        ).rejects.toMatchObject({ type: 'StripeConnectionError' });
        expect(performance.now() - started).toBeLessThan(750);
        expect(requests).toBe(2);
      },
    );
  });

  it('logs a budgeted transport retry without provider response text', async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        if (requests > 1) {
          customer(response);
          return;
        }
        response.statusCode = 500;
        response.end(
          JSON.stringify({
            error: {
              type: 'api_error',
              message: 'Private provider response marker',
            },
          }),
        );
      },
      async (client) => {
        const logger = new FakeLogger();
        await client(
          new StripeCallBudget(1_000),
          10_000,
          logger,
        ).customers.retrieve('cus_loopback');
        expect(logger.warnCalls).toHaveLength(1);
        expect(logger.warnCalls[0]).toMatchObject({
          msg: 'Retrying Stripe API call',
          context: {
            operation: 'GET customers',
            attempt: 1,
            maxAttempts: 2,
            delayMs: 500,
            statusCode: 500,
          },
        });
        expect(JSON.stringify(logger.warnCalls)).not.toContain(
          'Private provider response marker',
        );
      },
    );
  });

  it('continues provider recovery when retry logging throws', async () => {
    class ThrowingLogger extends FakeLogger {
      override warn(...args: Parameters<FakeLogger['warn']>): void {
        super.warn(...args);
        throw new Error('Logger unavailable');
      }
    }
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests += 1;
        if (requests > 1) {
          customer(response);
          return;
        }
        response.statusCode = 500;
        response.end('{}');
      },
      async (client) => {
        const logger = new ThrowingLogger();
        await expect(
          client(
            new StripeCallBudget(1_000),
            10_000,
            logger,
          ).customers.retrieve('cus_loopback'),
        ).resolves.toMatchObject({ id: 'cus_loopback' });
        expect(logger.warnCalls).toHaveLength(1);
        expect(requests).toBe(2);
      },
    );
  });

  it('retains the SDK-generated write key across transport retries', async () => {
    const keys: Array<string | string[] | undefined> = [];
    await withServer(
      (request, response) => {
        keys.push(request.headers['idempotency-key']);
        if (keys.length === 1) response.destroy();
        else customer(response);
      },
      async (client) => {
        await client(new StripeCallBudget(1_000)).customers.create({});
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBeTruthy();
        expect(keys[0]).toBe(keys[1]);
      },
    );
  });
});
