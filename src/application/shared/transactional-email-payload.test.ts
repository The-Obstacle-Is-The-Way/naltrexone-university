import { describe, expect, it } from 'vitest';
import { FakeSha256Hasher } from '@/src/application/test-helpers/fakes';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
  getRenewalNoticeRetryAt,
  parseTransactionalEmailPayloadSnapshot,
  RENEWAL_NOTICE_RETRY_MAX_DELAY_MS,
} from './transactional-email-payload';

const payload = {
  from: 'Addiction Boards <notices@addictionboards.com>',
  to: 'subscriber@example.com',
  replyTo: 'support@addictionboards.com',
  subject: 'Your renewal terms',
  html: '<p>Renewal terms</p>',
  text: 'Renewal terms',
};
const hasher = new FakeSha256Hasher();

function evidenceFor(snapshot: string) {
  return {
    snapshot,
    hash: hasher.hash(snapshot),
    destination: payload.to,
  };
}

describe('transactional email payload snapshot', () => {
  it('creates canonical JSON and delegates its digest to the SHA-256 port', () => {
    const result = createTransactionalEmailPayloadSnapshot(payload, hasher);

    expect(result.snapshot).toBe(
      '{"from":"Addiction Boards <notices@addictionboards.com>","to":"subscriber@example.com","replyTo":"support@addictionboards.com","subject":"Your renewal terms","html":"<p>Renewal terms</p>","text":"Renewal terms"}',
    );
    expect(result.hash).toBe(`sha256:${result.snapshot}`);
    expect(hasher.inputs.at(-1)).toBe(result.snapshot);
  });

  it.each([
    { label: 'empty', subject: '' },
    { label: 'missing', subject: undefined },
  ])('rejects a $label required field before snapshotting', ({ subject }) => {
    expect(() =>
      createTransactionalEmailPayloadSnapshot(
        {
          ...payload,
          subject: subject as string,
        },
        hasher,
      ),
    ).toThrow('valid non-empty fields');
  });

  it('parses only a matching immutable snapshot and destination', () => {
    const { snapshot, hash } = createTransactionalEmailPayloadSnapshot(
      payload,
      hasher,
    );

    expect(
      parseTransactionalEmailPayloadSnapshot(
        {
          snapshot,
          hash,
          destination: payload.to,
        },
        hasher,
      ),
    ).toEqual(payload);
    expect(() =>
      parseTransactionalEmailPayloadSnapshot(
        {
          snapshot: snapshot.replace('renewal terms', 'changed terms'),
          hash,
          destination: payload.to,
        },
        hasher,
      ),
    ).toThrow('payload hash');
    expect(() =>
      parseTransactionalEmailPayloadSnapshot(
        {
          snapshot,
          hash,
          destination: 'other@example.com',
        },
        hasher,
      ),
    ).toThrow('destination');
  });

  it('rejects non-JSON and exact-shape violations with valid hashes', () => {
    expect(() =>
      parseTransactionalEmailPayloadSnapshot(evidenceFor('not-json'), hasher),
    ).toThrow('not valid JSON');

    const missingField = JSON.stringify({
      from: payload.from,
      to: payload.to,
      replyTo: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
    });
    expect(() =>
      parseTransactionalEmailPayloadSnapshot(evidenceFor(missingField), hasher),
    ).toThrow('invalid shape');

    const extraField = JSON.stringify({ ...payload, trackingId: 'unexpected' });
    expect(() =>
      parseTransactionalEmailPayloadSnapshot(evidenceFor(extraField), hasher),
    ).toThrow('invalid shape');
  });
});

describe('renewal notice provider invariants', () => {
  it('derives the stable provider key from the delivery UUID', () => {
    expect(
      getRenewalNoticeProviderIdempotencyKey(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toBe('renewal-notice/11111111-1111-4111-8111-111111111111');
  });

  it('uses capped exponential backoff from the completed attempt count', () => {
    const failedAt = new Date('2026-08-06T18:00:00.000Z');

    expect(getRenewalNoticeRetryAt(failedAt, 1).toISOString()).toBe(
      '2026-08-06T18:15:00.000Z',
    );
    expect(getRenewalNoticeRetryAt(failedAt, 2).toISOString()).toBe(
      '2026-08-06T18:30:00.000Z',
    );
    expect(getRenewalNoticeRetryAt(failedAt, 20).getTime()).toBe(
      failedAt.getTime() + RENEWAL_NOTICE_RETRY_MAX_DELAY_MS,
    );
    expect(() => getRenewalNoticeRetryAt(failedAt, 0)).toThrow(
      'requires a completed attempt',
    );
  });
});
