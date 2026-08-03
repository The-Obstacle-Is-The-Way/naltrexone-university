import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { getRequestAuthState } from '@/lib/auth-request-cache';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { createSubscription, createUser } from '@/src/domain/test-helpers';

class CountingAuthGateway extends FakeAuthGateway {
  getCurrentUserCallCount = 0;

  override async getCurrentUser() {
    this.getCurrentUserCallCount++;
    return super.getCurrentUser();
  }
}

class CountingCheckEntitlementUseCase extends CheckEntitlementUseCase {
  executeCallCount = 0;

  override async execute(
    input: Parameters<CheckEntitlementUseCase['execute']>[0],
  ) {
    this.executeCallCount++;
    return super.execute(input);
  }
}

function createCountingAuthDeps() {
  const user = createUser({ id: 'user_1' });
  const authGateway = new CountingAuthGateway(user);
  const subscriptionRepository = new FakeSubscriptionRepository([
    createSubscription({
      userId: user.id,
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
    }),
  ]);
  const checkEntitlementUseCase = new CountingCheckEntitlementUseCase(
    subscriptionRepository,
    () => new Date('2026-02-01T00:00:00Z'),
  );

  return {
    authGateway,
    checkEntitlementUseCase,
  };
}

function normalizeExecOutput(output: unknown): string | null {
  if (typeof output === 'string') {
    return output.trim();
  }

  if (Buffer.isBuffer(output)) {
    return output.toString('utf8').trim();
  }

  return null;
}

function runReactServerScript(script: string) {
  let output: string;

  try {
    output = execFileSync(
      'pnpm',
      ['exec', 'tsx', '--conditions', 'react-server', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const stdout = normalizeExecOutput(
      (error as { stdout?: unknown } | undefined)?.stdout,
    );
    const stderr = normalizeExecOutput(
      (error as { stderr?: unknown } | undefined)?.stderr,
    );
    const message = [
      'React server script failed.',
      stderr ? `stderr:\n${stderr}` : null,
      stdout ? `stdout:\n${stdout}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    throw new Error(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  try {
    return JSON.parse(output) as {
      getCurrentUserCallCount: number;
      executeCallCount: number;
    };
  } catch (error) {
    throw new Error(
      `React server script returned invalid JSON.\n\nstdout:\n${output.trim()}`,
      {
        cause: error instanceof Error ? error : undefined,
      },
    );
  }
}

describe('auth-request-cache', () => {
  it('surfaces subprocess stderr when the react server script fails', () => {
    expect(() =>
      runReactServerScript(`
console.error('subprocess boom');
process.exit(1);
`),
    ).toThrowError(/React server script failed\./);

    expect(() =>
      runReactServerScript(`
console.error('subprocess boom');
process.exit(1);
`),
    ).toThrowError(/subprocess boom/);
  });

  it('surfaces stdout when the react server script returns invalid json', () => {
    expect(() =>
      runReactServerScript(`
console.log('not json');
`),
    ).toThrowError(/React server script returned invalid JSON\./);

    expect(() =>
      runReactServerScript(`
console.log('not json');
`),
    ).toThrowError(/not json/);
  });

  it('preserves the entitlement output, including plan and trialEndsAt, for in-trial users', async () => {
    const user = createUser({ id: 'user_1' });
    const trialEnd = new Date('2026-02-08T00:00:00Z');
    const deps = {
      authGateway: new FakeAuthGateway(user),
      checkEntitlementUseCase: new CheckEntitlementUseCase(
        new FakeSubscriptionRepository([
          createSubscription({
            userId: user.id,
            status: 'inTrial',
            currentPeriodEnd: trialEnd,
          }),
        ]),
        () => new Date('2026-02-01T00:00:00Z'),
      ),
    };

    const authState = await getRequestAuthState({ deps });

    expect(authState.user).toEqual(user);
    expect(authState.entitlement).toEqual({
      isEntitled: true,
      reason: null,
      subscriptionStatus: 'inTrial',
      plan: 'monthly',
      hasActiveSubscriptionPeriod: true,
      trialEndsAt: trialEnd,
    });
  });

  it('bypasses the cache when deps are injected directly', async () => {
    const deps = createCountingAuthDeps();

    const first = await getRequestAuthState({ deps });
    const second = await getRequestAuthState({ deps });

    expect(first).toEqual(second);
    expect(deps.authGateway.getCurrentUserCallCount).toBe(2);
    expect(deps.checkEntitlementUseCase.executeCallCount).toBe(2);
  });

  it('bypasses the cache when a custom container loader is provided', async () => {
    const deps = createCountingAuthDeps();
    const loadContainer = vi.fn(async () => ({
      createAuthGateway: () => deps.authGateway,
      createCheckEntitlementUseCase: () => deps.checkEntitlementUseCase,
    }));

    const first = await getRequestAuthState({ options: { loadContainer } });
    const second = await getRequestAuthState({ options: { loadContainer } });

    expect(first).toEqual(second);
    expect(loadContainer).toHaveBeenCalledTimes(2);
    expect(deps.authGateway.getCurrentUserCallCount).toBe(2);
    expect(deps.checkEntitlementUseCase.executeCallCount).toBe(2);
  });

  it('deduplicates auth and entitlement work within a single server render', () => {
    const result = runReactServerScript(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createCachedRequestAuthStateReader } = require('./lib/auth-request-cache.ts');
const { FakeAuthGateway } = require('./src/application/test-helpers/fakes/fake-gateways.ts');
const { FakeSubscriptionRepository } = require('./src/application/test-helpers/fakes/fake-subscription-repository.ts');
const { CheckEntitlementUseCase } = require('./src/application/use-cases/check-entitlement.ts');
const { createSubscription, createUser } = require('./src/domain/test-helpers/index.ts');

class CountingAuthGateway extends FakeAuthGateway {
  getCurrentUserCallCount = 0;

  async getCurrentUser() {
    this.getCurrentUserCallCount++;
    return super.getCurrentUser();
  }
}

class CountingCheckEntitlementUseCase extends CheckEntitlementUseCase {
  executeCallCount = 0;

  async execute(input) {
    this.executeCallCount++;
    return super.execute(input);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const user = createUser({ id: 'user_1' });
const authGateway = new CountingAuthGateway(user);
const subscriptionRepository = new FakeSubscriptionRepository([
  createSubscription({
    userId: user.id,
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
  }),
]);
const checkEntitlementUseCase = new CountingCheckEntitlementUseCase(
  subscriptionRepository,
  () => new Date('2026-02-01T00:00:00Z'),
);
const getRequestAuthState = createCachedRequestAuthStateReader(async () => ({
  authGateway,
  checkEntitlementUseCase,
}));

async function FirstCaller() {
  const authState = await getRequestAuthState();
  return React.createElement('div', null, authState.user?.id ?? 'anonymous');
}

async function SecondCaller() {
  const authState = await getRequestAuthState();
  return React.createElement(
    'div',
    null,
    authState.entitlement?.isEntitled ? 'entitled' : 'not-entitled',
  );
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    getCurrentUserCallCount: authGateway.getCurrentUserCallCount,
    executeCallCount: checkEntitlementUseCase.executeCallCount,
  }),
);
`);

    expect(result).toEqual({
      getCurrentUserCallCount: 1,
      executeCallCount: 1,
    });
  });

  it('rechecks auth and entitlement on a new server render', () => {
    const result = runReactServerScript(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createCachedRequestAuthStateReader } = require('./lib/auth-request-cache.ts');
const { FakeAuthGateway } = require('./src/application/test-helpers/fakes/fake-gateways.ts');
const { FakeSubscriptionRepository } = require('./src/application/test-helpers/fakes/fake-subscription-repository.ts');
const { CheckEntitlementUseCase } = require('./src/application/use-cases/check-entitlement.ts');
const { createSubscription, createUser } = require('./src/domain/test-helpers/index.ts');

class CountingAuthGateway extends FakeAuthGateway {
  getCurrentUserCallCount = 0;

  async getCurrentUser() {
    this.getCurrentUserCallCount++;
    return super.getCurrentUser();
  }
}

class CountingCheckEntitlementUseCase extends CheckEntitlementUseCase {
  executeCallCount = 0;

  async execute(input) {
    this.executeCallCount++;
    return super.execute(input);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const user = createUser({ id: 'user_1' });
const authGateway = new CountingAuthGateway(user);
const subscriptionRepository = new FakeSubscriptionRepository([
  createSubscription({
    userId: user.id,
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
  }),
]);
const checkEntitlementUseCase = new CountingCheckEntitlementUseCase(
  subscriptionRepository,
  () => new Date('2026-02-01T00:00:00Z'),
);
const getRequestAuthState = createCachedRequestAuthStateReader(async () => ({
  authGateway,
  checkEntitlementUseCase,
}));

async function Caller() {
  const authState = await getRequestAuthState();
  return React.createElement('div', null, authState.user?.id ?? 'anonymous');
}

async function App() {
  return React.createElement(Caller);
}

await drain(await renderToReadableStream(React.createElement(App), null));
await drain(await renderToReadableStream(React.createElement(App), null));

console.log(
  JSON.stringify({
    getCurrentUserCallCount: authGateway.getCurrentUserCallCount,
    executeCallCount: checkEntitlementUseCase.executeCallCount,
  }),
);
`);

    expect(result).toEqual({
      getCurrentUserCallCount: 2,
      executeCallCount: 2,
    });
  });
});
