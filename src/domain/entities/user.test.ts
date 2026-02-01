import { describe, expect, it } from 'vitest';
import type { User } from './user';

describe('User entity', () => {
  it('has required readonly properties', () => {
    const user: User = {
      id: 'uuid-123',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(user.id).toBe('uuid-123');
    expect(user.email).toBe('test@example.com');
  });
});
