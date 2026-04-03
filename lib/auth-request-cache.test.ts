import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runReactServerScript(script: string) {
  const output = execFileSync(
    'pnpm',
    ['exec', 'tsx', '--conditions', 'react-server', '-e', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  return JSON.parse(output) as {
    getCurrentUserCallCount: number;
    executeCallCount: number;
  };
}

describe('auth-request-cache', () => {
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
