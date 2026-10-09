import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// GitHub's runners share addresses, so Docker Hub's anonymous pull limit
// refused the Postgres service image three times in #1409's run 37991221313.
// Google's Docker Hub mirror serves the same digest without that limit.
describe('CI service images', () => {
  it('pulls Postgres from the mirror, pinned by digest, in every workflow that runs it', () => {
    const images = globSync('.github/workflows/*.yml').flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/image: (\S*postgres\S*)/g)].map(
        ([, image]) => image,
      ),
    );

    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toMatch(
        /^mirror\.gcr\.io\/library\/postgres@sha256:[0-9a-f]{64}$/,
      );
    }
  });
});
