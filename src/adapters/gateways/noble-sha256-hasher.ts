import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Sha256Hasher } from '@/src/application/ports';

export class NobleSha256Hasher implements Sha256Hasher {
  hash(input: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(input)));
  }
}
