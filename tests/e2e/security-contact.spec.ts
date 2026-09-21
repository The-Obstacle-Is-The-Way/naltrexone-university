import { expect, test } from '@playwright/test';

// Deliberately signed out: a file-content test cannot prove publication through
// the built application's middleware and static-resource serving boundary.
test.use({ storageState: { cookies: [], origins: [] } });

for (const accept of ['*/*', 'text/html']) {
  test(`publishes the security contact anonymously with Accept: ${accept}`, async ({
    request,
  }) => {
    const response = await request.get('/.well-known/security.txt', {
      headers: { Accept: accept },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/plain\b/);
    const body = await response.text();
    expect(body).toContain(
      'Contact: https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/security/advisories/new',
    );
    expect(body).toContain(
      'Canonical: https://addictionboards.com/.well-known/security.txt',
    );
  });
}
