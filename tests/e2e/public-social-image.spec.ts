import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

for (const accept of ['*/*', 'text/html']) {
  test(`serves the social image anonymously with Accept: ${accept}`, async ({
    request,
  }) => {
    const response = await request.get('/opengraph-image', {
      headers: { Accept: accept },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\/png\b/);
    const body = await response.body();
    expect([...body.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });
}
