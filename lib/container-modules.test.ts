import { beforeAll, describe, expect, it } from 'vitest';

let repositories: typeof import('./container/repositories');
let gateways: typeof import('./container/gateways');
let useCases: typeof import('./container/use-cases');
let controllers: typeof import('./container/controllers');

describe('container modules', () => {
  beforeAll(async () => {
    [repositories, gateways, useCases, controllers] = await Promise.all([
      import('./container/repositories'),
      import('./container/gateways'),
      import('./container/use-cases'),
      import('./container/controllers'),
    ]);
  });

  it('exposes modular container builders by bounded context', () => {
    expect(repositories).toHaveProperty('createRepositoryFactories');
    expect(gateways).toHaveProperty('createGatewayFactories');
    expect(useCases).toHaveProperty('createUseCaseFactories');
    expect(controllers).toHaveProperty('createControllerFactories');
  });
});
