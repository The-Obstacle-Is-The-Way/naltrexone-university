import { createHmac, timingSafeEqual } from 'node:crypto';

function stableJsonStringify(record: Record<string, string>): string {
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`)
    .join(',')}}`;
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
