import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import type { Sha256Hasher } from '@/src/application/ports';

export class NobleSha256Hasher implements Sha256Hasher {
  hash(input: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(input)));
  }
}
