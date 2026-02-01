import { describe, expect, it } from 'vitest';
import { DrizzleUserRepository } from '@/src/adapters/repositories';

describe('repositories exports', () => {
  it('exports DrizzleUserRepository from the barrel', () => {
    expect(DrizzleUserRepository).toBeTypeOf('function');
  });
});
