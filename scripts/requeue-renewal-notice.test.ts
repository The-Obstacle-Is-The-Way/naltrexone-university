import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '../src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '../src/application/test-helpers/fakes';
import {
  parseRequeueRenewalNoticeArgs,
  type RequeueRenewalNoticeDeps,
  runRequeueRenewalNotice,
} from './requeue-renewal-notice';

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:55432/addiction_boards_test';
const OPERATOR = 'operator@example.com';
const SUBSCRIBER = 'subscriber@example.com';
const now = new Date('2026-10-18T12:00:00.000Z');

describe('parseRequeueRenewalNoticeArgs', () => {
  const deliveryId = randomUUID();

  it('reads the delivery ID and reason, with no-send unconfirmed by default', () => {
    expect(
      parseRequeueRenewalNoticeArgs([
        '--delivery-id',
        deliveryId,
        '--reason',
        'Resend shows no email for this notice',
      ]),
    ).toEqual({
      deliveryId,
      reason: 'Resend shows no email for this notice',
      confirmedNoSend: false,
    });
  });

  it('records the no-send confirmation only when the flag is given', () => {
    expect(
      parseRequeueRenewalNoticeArgs([
        '--confirmed-no-send',
        '--reason',
        'Resend shows no email for this notice',
        '--delivery-id',
        deliveryId,
      ]).confirmedNoSend,
    ).toBe(true);
  });

  it('requires a delivery ID and a reason', () => {
    expect(() =>
      parseRequeueRenewalNoticeArgs(['--reason', 'Retry approved']),
    ).toThrow(/--delivery-id is required/);
    expect(() =>
      parseRequeueRenewalNoticeArgs(['--delivery-id', deliveryId]),
    ).toThrow(/--reason is required/);
  });

  it('refuses a delivery ID that is not a UUID before any database work', () => {
    expect(() =>
      parseRequeueRenewalNoticeArgs([
        '--delivery-id',
        'not-a-uuid',
        '--reason',
        'Retry approved',
      ]),
    ).toThrow(/--delivery-id must be a delivery UUID/);
  });

  it('refuses a flag with no value', () => {
    expect(() =>
      parseRequeueRenewalNoticeArgs([
        '--delivery-id',
        '--reason',
        'Retry approved',
      ]),
    ).toThrow(/--delivery-id needs a value/);
    expect(() =>
      parseRequeueRenewalNoticeArgs(['--delivery-id', deliveryId, '--reason']),
    ).toThrow(/--reason needs a value/);
  });

  it('refuses a repeated flag rather than letting the last one win', () => {
    expect(() =>
      parseRequeueRenewalNoticeArgs([
        '--delivery-id',
        deliveryId,
        '--reason',
        'First reason',
        '--reason',
        'Second reason',
      ]),
    ).toThrow(/--reason was given more than once/);
  });

  it('refuses an unknown flag and shows the usage', () => {
    expect(() => parseRequeueRenewalNoticeArgs(['--force'])).toThrow(
      /Unknown flag: --force[\s\S]*Usage:/,
    );
  });
});

describe('runRequeueRenewalNotice', () => {
  it('requeues an unknown outcome through the use case once no send is confirmed', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await runRequeueRenewalNotice({
      argv: [
        '--delivery-id',
        deliveryId,
        '--reason',
        '  Resend shows no email for this notice  ',
        '--confirmed-no-send',
      ],
      env: localEnv({ RENEWAL_NOTICE_OPERATOR: `  ${OPERATOR}  ` }),
      output: harness.output,
      errorOutput: harness.errorOutput,
      deps: harness.deps,
      now: () => now,
    });

    await expect(repository.findById(deliveryId)).resolves.toMatchObject({
      status: 'queued',
      requeueReason: 'Resend shows no email for this notice',
      requeuedBy: OPERATOR,
      requeuedAt: now,
      requeueAudit: [
        {
          reason: 'Resend shows no email for this notice',
          requeuedBy: OPERATOR,
          requeuedAt: now.toISOString(),
          confirmedNoSend: true,
          priorStatus: 'outcome_unknown',
        },
      ],
    });
    expect(harness.output.text()).toBe(
      [
        `Requeued renewal notice ${deliveryId}; its status is now queued.`,
        `Audit entry: {"reason":"Resend shows no email for this notice","requeuedAt":"${now.toISOString()}","requeuedBy":"${OPERATOR}","confirmedNoSend":true,"priorStatus":"outcome_unknown"}`,
        'The next daily renewal-notice run, which starts between 09:00 and 10:00 UTC, rechecks it before sending it.',
        '',
      ].join('\n'),
    );
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('refuses an unknown outcome without the no-send confirmation and leaves it quarantined', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await expect(
      runRequeueRenewalNotice({
        argv: ['--delivery-id', deliveryId, '--reason', 'Retry requested'],
        env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
        output: harness.output,
        errorOutput: harness.errorOutput,
        deps: harness.deps,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(repository.findById(deliveryId)).resolves.toMatchObject({
      status: 'outcome_unknown',
      requeueAudit: [],
    });
    expect(harness.output.text()).toBe('');
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('prints the latest audit entry for a notice requeued before', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    await repository.requeue({
      id: deliveryId,
      reason: 'First requeue',
      requeuedBy: 'earlier@example.com',
      requeuedAt: new Date('2026-10-17T12:00:00.000Z'),
      confirmedNoSend: true,
    });
    await repository.claim({
      id: deliveryId,
      attemptId: 'attempt-2',
      startedAt: now,
    });
    await repository.markTerminalFailure({
      id: deliveryId,
      attemptId: 'attempt-2',
      failureClass: 'provider_bounced',
      failureCode: 'bounced',
      failedAt: now,
    });
    const harness = createHarness(repository);

    await runRequeueRenewalNotice({
      argv: ['--delivery-id', deliveryId, '--reason', 'Mailbox fixed'],
      env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
      output: harness.output,
      errorOutput: harness.errorOutput,
      deps: harness.deps,
      now: () => now,
    });

    expect(harness.output.text()).toContain(
      `Audit entry: {"reason":"Mailbox fixed","requeuedAt":"${now.toISOString()}","requeuedBy":"${OPERATOR}","confirmedNoSend":false,"priorStatus":"terminal_failure"}`,
    );
  });

  it('refuses a delivery that is not quarantined', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const queued = await repository.saveQueued(newDelivery(randomUUID()));
    const harness = createHarness(repository);

    await expect(
      runRequeueRenewalNotice({
        argv: [
          '--delivery-id',
          queued.id,
          '--reason',
          'Retry requested',
          '--confirmed-no-send',
        ],
        env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
        output: harness.output,
        errorOutput: harness.errorOutput,
        deps: harness.deps,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(repository.findById(queued.id)).resolves.toMatchObject({
      status: 'queued',
      requeueAudit: [],
    });
  });

  it('keeps the subscriber address out of its output', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await runRequeueRenewalNotice({
      argv: [
        '--delivery-id',
        deliveryId,
        '--reason',
        'Resend shows no email for this notice',
        '--confirmed-no-send',
      ],
      env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
      output: harness.output,
      errorOutput: harness.errorOutput,
      deps: harness.deps,
    });

    expect(harness.output.text() + harness.errorOutput.text()).not.toContain(
      SUBSCRIBER,
    );
  });

  it('requires the operator before opening the database', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    for (const operator of [undefined, '   ']) {
      await expect(
        runRequeueRenewalNotice({
          argv: [
            '--delivery-id',
            deliveryId,
            '--reason',
            'Resend shows no email for this notice',
            '--confirmed-no-send',
          ],
          env: localEnv({ RENEWAL_NOTICE_OPERATOR: operator }),
          output: harness.output,
          errorOutput: harness.errorOutput,
          deps: harness.deps,
        }),
      ).rejects.toThrow(/RENEWAL_NOTICE_OPERATOR must name the operator/);
    }
    expect(harness.openRepository).not.toHaveBeenCalled();
  });

  it('refuses bad arguments before opening the database', async () => {
    const harness = createHarness(
      new FakeRenewalNoticeDeliveryRepository(() => now),
    );

    await expect(
      runRequeueRenewalNotice({
        argv: ['--delivery-id', 'not-a-uuid', '--reason', 'Retry approved'],
        env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
        output: harness.output,
        errorOutput: harness.errorOutput,
        deps: harness.deps,
      }),
    ).rejects.toThrow(/--delivery-id must be a delivery UUID/);
    expect(harness.openRepository).not.toHaveBeenCalled();
  });

  it.each(['', '   '])(
    'refuses an empty audit reason %j before opening the database',
    async (reason) => {
      const harness = createHarness(
        new FakeRenewalNoticeDeliveryRepository(() => now),
      );
      await expect(
        runRequeueRenewalNotice({
          argv: ['--delivery-id', randomUUID(), '--reason', reason],
          env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
          output: harness.output,
          errorOutput: harness.errorOutput,
          deps: harness.deps,
        }),
      ).rejects.toThrow(/--reason is required/);
      expect(harness.openRepository).not.toHaveBeenCalled();
    },
  );

  it('requires an explicit DATABASE_URL before opening the database', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await expect(
      runRequeueRenewalNotice({
        argv: [
          '--delivery-id',
          deliveryId,
          '--reason',
          'Resend shows no email for this notice',
          '--confirmed-no-send',
        ],
        env: { RENEWAL_NOTICE_OPERATOR: OPERATOR },
        output: harness.output,
        errorOutput: harness.errorOutput,
        deps: harness.deps,
      }),
    ).rejects.toThrow(/explicit DATABASE_URL/i);
    expect(harness.openRepository).not.toHaveBeenCalled();
  });

  it('refuses a remote target without its exact acknowledgment', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await expect(
      runRequeueRenewalNotice({
        argv: [
          '--delivery-id',
          deliveryId,
          '--reason',
          'Resend shows no email for this notice',
          '--confirmed-no-send',
        ],
        env: {
          DATABASE_URL:
            'postgresql://remote-user:remote-password@db.example/app',
          RENEWAL_NOTICE_OPERATOR: OPERATOR,
        },
        output: harness.output,
        errorOutput: harness.errorOutput,
        deps: harness.deps,
      }),
    ).rejects.toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');
    expect(harness.openRepository).not.toHaveBeenCalled();
  });

  it('names the redacted database target on stderr', async () => {
    const { repository, deliveryId } = await quarantinedDelivery();
    const harness = createHarness(repository);

    await runRequeueRenewalNotice({
      argv: [
        '--delivery-id',
        deliveryId,
        '--reason',
        'Resend shows no email for this notice',
        '--confirmed-no-send',
      ],
      env: localEnv({ RENEWAL_NOTICE_OPERATOR: OPERATOR }),
      output: harness.output,
      errorOutput: harness.errorOutput,
      deps: harness.deps,
    });

    expect(harness.errorOutput.text()).toContain(
      'Database target: LOCAL localhost:55432/addiction_boards_test',
    );
    expect(harness.errorOutput.text()).not.toContain('postgres:postgres');
    expect(harness.openRepository).toHaveBeenCalledWith(LOCAL_DATABASE_URL);
  });
});

function localEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { DATABASE_URL: LOCAL_DATABASE_URL, ...overrides };
}

function newDelivery(id: string) {
  const payload = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: SUBSCRIBER,
      replyTo: 'support@addictionboards.com',
      subject: 'Annual subscription reminder',
      html: '<p>Annual subscription reminder</p>',
      text: 'Annual subscription reminder',
    },
    new FakeSha256Hasher(),
  );
  return {
    id,
    noticeKind: 'annual_reminder' as const,
    consentRecordId: null,
    externalSubscriptionId: 'sub_requeue_script',
    applicableAt: new Date('2027-10-18T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: SUBSCRIBER,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
  };
}

// A notice whose send timed out: claimed, then marked outcome_unknown, the
// state the renewal_notice_outcome_unknown alert reports.
async function quarantinedDelivery() {
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
  const deliveryId = randomUUID();
  await repository.saveQueued(newDelivery(deliveryId));
  await repository.claim({
    id: deliveryId,
    attemptId: 'attempt-1',
    startedAt: now,
  });
  await repository.markOutcomeUnknown({
    id: deliveryId,
    attemptId: 'attempt-1',
    failureClass: 'provider_outcome_unknown',
    failureCode: 'provider_timeout',
    failedAt: now,
  });
  return { repository, deliveryId };
}

function createHarness(repository: FakeRenewalNoticeDeliveryRepository) {
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const openRepository = vi.fn((_databaseUrl: string) => ({
    repository,
    close,
  }));
  const deps: RequeueRenewalNoticeDeps = { openRepository };
  return {
    close,
    openRepository,
    deps,
    output: createWritableSink(),
    errorOutput: createWritableSink(),
  };
}

function createWritableSink() {
  let value = '';

  return {
    write(text: string) {
      value += text;
      return true;
    },
    text() {
      return value;
    },
  };
}
