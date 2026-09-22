import { expect, test } from '@playwright/test';

// The proxy must admit these exact machine resources without a Clerk handshake.
test.use({ storageState: { cookies: [], origins: [] } });

for (const accept of ['*/*', 'text/html']) {
  test(`publishes the sitemap anonymously with Accept: ${accept}`, async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml', {
      headers: { Accept: accept },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^application\/xml\b/);
    const urls = [
      ...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((match) => match[1]);
    expect(urls).toEqual([
      'https://addictionboards.com/',
      'https://addictionboards.com/pricing',
      'https://addictionboards.com/privacy',
      'https://addictionboards.com/terms',
    ]);
  });

  test(`publishes robots anonymously with Accept: ${accept}`, async ({
    request,
  }) => {
    const response = await request.get('/robots.txt', {
      headers: { Accept: accept },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/plain\b/);
    const lines = (await response.text()).trim().split(/\r?\n/).filter(Boolean);
    expect(lines).toEqual([
      'User-Agent: *',
      'Allow: /',
      'Disallow: /app/',
      'Disallow: /api/',
      'Disallow: /checkout/',
      'Sitemap: https://addictionboards.com/sitemap.xml',
    ]);
  });
}
