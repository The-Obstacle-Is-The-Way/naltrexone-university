import { describe, expect, it } from 'vitest';

describe('container modules', () => {
  it('exposes modular container builders by bounded context', async () => {
    const [repositories, gateways, useCases, controllers] = await Promise.all([
      import('./container/repositories'),
      import('./container/gateways'),
      import('./container/use-cases'),
      import('./container/controllers'),
    ]);

    expect(repositories).toHaveProperty('createRepositoryFactories');
    expect(gateways).toHaveProperty('createGatewayFactories');
    expect(useCases).toHaveProperty('createUseCaseFactories');
    expect(controllers).toHaveProperty('createControllerFactories');
  });
});
