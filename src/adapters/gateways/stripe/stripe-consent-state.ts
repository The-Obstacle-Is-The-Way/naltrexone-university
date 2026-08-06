import { createHmac, timingSafeEqual } from 'node:crypto';

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function createStripeConsentStateSignature(
  metadata: Record<string, string>,
  stateSecret: string,
): string {
  return createHmac('sha256', stateSecret)
    .update(stableJsonStringify(metadata))
    .digest('hex');
}

export function isValidStripeConsentStateSignature(
  metadata: Record<string, string>,
  signature: string,
  stateSecret: string,
): boolean {
  const expected = Buffer.from(
    createStripeConsentStateSignature(metadata, stateSecret),
    'hex',
  );
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
