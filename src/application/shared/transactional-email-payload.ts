import { ApplicationError } from '@/src/application/errors';
import type {
  Sha256Hasher,
  TransactionalEmailPayload,
} from '@/src/application/ports';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';

export const RENEWAL_NOTICE_RETRY_BASE_DELAY_MS = 15 * 60 * 1000;
export const RENEWAL_NOTICE_RETRY_MAX_DELAY_MS = 24 * 60 * 60 * 1000;

const PAYLOAD_KEYS = [
  'from',
  'to',
  'replyTo',
  'subject',
  'html',
  'text',
] as const;

function isTransactionalEmailPayload(
  value: unknown,
): value is TransactionalEmailPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === PAYLOAD_KEYS.length &&
    PAYLOAD_KEYS.every(
      (key) => typeof record[key] === 'string' && record[key].length > 0,
    )
  );
}

export function createTransactionalEmailPayloadSnapshot(
  payload: TransactionalEmailPayload,
  hasher: Sha256Hasher,
): { snapshot: string; hash: string } {
  if (!isTransactionalEmailPayload(payload)) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Transactional email payload requires valid non-empty fields',
    );
  }
  const snapshot = JSON.stringify({
    from: payload.from,
    to: payload.to,
    replyTo: payload.replyTo,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
  return { snapshot, hash: hasher.hash(snapshot) };
}

export function parseTransactionalEmailPayloadSnapshot(
  input: {
    snapshot: string;
    hash: string;
    destination: string;
  },
  hasher: Sha256Hasher,
): TransactionalEmailPayload {
  if (hasher.hash(input.snapshot) !== input.hash) {
    throw new ApplicationError(
      'CONFLICT',
      'Renewal notice payload hash does not match its immutable snapshot',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.snapshot);
  } catch {
    // Convert corrupt persisted JSON into the explicit integrity error below.
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Renewal notice payload snapshot is not valid JSON',
    );
  }
  if (!isTransactionalEmailPayload(parsed)) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Renewal notice payload snapshot has an invalid shape',
    );
  }
  if (parsed.to !== input.destination) {
    throw new ApplicationError(
      'CONFLICT',
      'Renewal notice payload destination does not match the delivery row',
    );
  }
  return parsed;
}

export function getRenewalNoticeProviderIdempotencyKey(
  deliveryId: string,
): string {
  return `renewal-notice/${deliveryId}`;
}

export function assertValidRenewalNoticeDeliveryPayload(
  input: Pick<
    NewRenewalNoticeDelivery,
    | 'id'
    | 'destination'
    | 'providerIdempotencyKey'
    | 'payloadSnapshot'
    | 'payloadHash'
  >,
  hasher: Sha256Hasher,
): void {
  if (
    input.providerIdempotencyKey !==
    getRenewalNoticeProviderIdempotencyKey(input.id)
  ) {
    throw new ApplicationError(
      'CONFLICT',
      'Renewal notice provider idempotency key is not derived from its delivery ID',
    );
  }
  parseTransactionalEmailPayloadSnapshot(
    {
      snapshot: input.payloadSnapshot,
      hash: input.payloadHash,
      destination: input.destination,
    },
    hasher,
  );
}

export function getRenewalNoticeRetryAt(
  failedAt: Date,
  attemptCount: number,
): Date {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Renewal notice retry requires a completed attempt',
    );
  }
  const delay = Math.min(
    RENEWAL_NOTICE_RETRY_BASE_DELAY_MS * 2 ** (attemptCount - 1),
    RENEWAL_NOTICE_RETRY_MAX_DELAY_MS,
  );
  return new Date(failedAt.getTime() + delay);
}
