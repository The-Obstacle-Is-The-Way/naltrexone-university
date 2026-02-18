import { beforeAll, describe, expect, it } from 'vitest';

let repositories: typeof import('@/lib/container/repositories');
let gateways: typeof import('@/lib/container/gateways');
let useCases: typeof import('@/lib/container/use-cases');
let controllers: typeof import('@/lib/container/controllers');

beforeAll(async () => {
  [repositories, gateways, useCases, controllers] = await Promise.all([
    import('@/lib/container/repositories'),
    import('@/lib/container/gateways'),
    import('@/lib/container/use-cases'),
    import('@/lib/container/controllers'),
  ]);
});

describe('container modules', () => {
  it('exposes modular container builders by bounded context', () => {
    expect(repositories).toHaveProperty('createRepositoryFactories');
    expect(gateways).toHaveProperty('createGatewayFactories');
    expect(useCases).toHaveProperty('createUseCaseFactories');
    expect(controllers).toHaveProperty('createControllerFactories');
  });
});
