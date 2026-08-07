import type { Sha256Hasher } from '@/src/application/ports';

export class FakeSha256Hasher implements Sha256Hasher {
  readonly inputs: string[] = [];

  hash(input: string): string {
    this.inputs.push(input);
    return `sha256:${input}`;
  }
}
