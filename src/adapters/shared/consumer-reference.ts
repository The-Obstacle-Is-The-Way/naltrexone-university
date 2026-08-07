import { createHash } from 'node:crypto';

export function toConsumerReference(externalCustomerId: string): string {
  return createHash('sha256').update(externalCustomerId).digest('hex');
}
