import { beforeEach, describe, expect, it, vi } from 'vitest';

const resendSdk = vi.hoisted(() => ({
  constructorInputs: [] as string[],
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class ResendMock {
    readonly emails = { send: resendSdk.send };

    constructor(apiKey: string) {
      resendSdk.constructorInputs.push(apiKey);
    }
  },
}));

import { ResendTransactionalEmailGateway } from './resend-transactional-email-gateway';

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

describe('ResendTransactionalEmailGateway', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resendSdk.constructorInputs.length = 0;
    resendSdk.send.mockReset();
  });

  it('reports unconfigured without constructing or calling the SDK', async () => {
    const gateway = new ResendTransactionalEmailGateway({ apiKey: undefined });

    expect(gateway.isConfigured()).toBe(false);
    await expect(gateway.send(input)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    expect(resendSdk.constructorInputs).toEqual([]);
    expect(resendSdk.send).not.toHaveBeenCalled();
  });

  it('passes the immutable payload and stable idempotency key to Resend', async () => {
    resendSdk.send.mockResolvedValue({
      data: { id: 'email_123' },
      error: null,
    });
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'delivered',
      providerEventId: 'email_123',
    });
    expect(resendSdk.constructorInputs).toEqual(['re_test']);
    expect(resendSdk.send).toHaveBeenCalledWith(input.payload, {
      idempotencyKey: input.idempotencyKey,
    });
  });

  it.each([
    'application_error',
    'daily_quota_exceeded',
    'monthly_quota_exceeded',
    'rate_limit_exceeded',
    'internal_server_error',
  ])('maps known non-acceptance %s to transient_failure', async (name) => {
    resendSdk.send.mockResolvedValue({
      data: null,
      error: { name, message: 'try later' },
    });
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'transient_failure',
      failureCode: name,
    });
  });

  it('quarantines concurrent idempotent requests because provider acceptance is unresolved', async () => {
    resendSdk.send.mockResolvedValue({
      data: null,
      error: {
        name: 'concurrent_idempotent_requests',
        message: 'another request is still processing',
      },
    });
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'outcome_unknown',
      failureCode: 'concurrent_idempotent_requests',
    });
  });

  it.each([
    'invalid_idempotent_request',
    'validation_error',
    'invalid_api_key',
  ])('maps known terminal error %s to terminal_failure', async (name) => {
    resendSdk.send.mockResolvedValue({
      data: null,
      error: { name, message: 'do not retry' },
    });
    const gateway = new ResendTransactionalEmailGateway({
      apiKey: 're_test',
    });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'terminal_failure',
      failureCode: name,
    });
  });

  it('maps a thrown provider call to outcome_unknown', async () => {
    resendSdk.send.mockRejectedValue(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    );
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'outcome_unknown',
      failureCode: 'ETIMEDOUT',
    });
  });

  it('uses the fallback failure code for an unstructured thrown value', async () => {
    resendSdk.send.mockRejectedValue('provider disconnected');
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'outcome_unknown',
      failureCode: 'provider_exception',
    });
  });

  it('bounds a stalled provider call and clears its timeout', async () => {
    vi.useFakeTimers();
    resendSdk.send.mockImplementation(() => new Promise(() => undefined));
    const gateway = new ResendTransactionalEmailGateway({
      apiKey: 're_test',
      timeoutMs: 25,
    });

    const result = gateway.send(input);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      status: 'outcome_unknown',
      failureCode: 'provider_timeout',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps a response without data or error to outcome_unknown', async () => {
    resendSdk.send.mockResolvedValue({ data: null, error: null });
    const gateway = new ResendTransactionalEmailGateway({ apiKey: 're_test' });

    await expect(gateway.send(input)).resolves.toEqual({
      status: 'outcome_unknown',
      failureCode: 'invalid_provider_response',
    });
  });
});
