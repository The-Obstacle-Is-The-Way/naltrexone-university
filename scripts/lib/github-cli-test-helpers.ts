import { withRecordedCli } from '../../tests/shared/recorded-cli';
import { createGhRunner } from './github-cli.mts';

// The error the runner throws when gh exits nonzero, taken from a real child
// process, so a caller's test sees Node's own error shape.
export async function ghRunnerFailure(stderr: string): Promise<unknown> {
  let failure: unknown;
  await withRecordedCli(
    'gh',
    '',
    async () => {
      try {
        createGhRunner({ timeout: 5000 })(['api']);
      } catch (error) {
        failure = error;
      }
    },
    { stderr, status: 1 },
  );
  return failure;
}
