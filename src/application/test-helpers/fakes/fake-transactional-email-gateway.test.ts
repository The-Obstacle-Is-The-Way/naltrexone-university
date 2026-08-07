import { describe, expect, it } from 'vitest';
import { FakeTransactionalEmailGateway } from './fake-transactional-email-gateway';

const input = {
  idempotencyKey: 'renewal-notice/11111111-1111-4111-8111-111111111111',
  payload: {
    from: 'Addiction Boards <notices@addictionboards.com>',
    to: 'subscriber@example.com',
    replyTo: 'support@addictionboards.com',
    subject: 'Your renewal terms',
    html: '<p>Renewal terms</p>',
    text: 'Renewal terms',
  },
};

describe('FakeTransactionalEmailGateway', () => {
  it('reports whether delivery is configured', () => {
    expect(
      new FakeTransactionalEmailGateway({ configured: false }).isConfigured(),
    ).toBe(false);
    expect(
      new FakeTransactionalEmailGateway({ configured: true }).isConfigured(),
    ).toBe(true);
  });

  it('records the immutable send input and returns the configured outcome', async () => {
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [{ status: 'delivered', providerEventId: 'email_123' }],
    });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'delivered',
      providerEventId: 'email_123',
    });
    expect(gateway.sendInputs).toEqual([input]);
    expect(gateway.sendInputs[0]).not.toBe(input);
  });

  it('fails loudly when unconfigured code attempts a provider call', async () => {
    const gateway = new FakeTransactionalEmailGateway({ configured: false });

    await expect(gateway.send(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    expect(gateway.sendInputs).toEqual([]);
  });
});
