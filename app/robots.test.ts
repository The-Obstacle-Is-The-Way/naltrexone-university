import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('public crawler policy', () => {
  it('publishes the canonical sitemap and keeps auth pages crawlable for noindex', () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/api/', '/checkout/'],
      },
      sitemap: 'https://addictionboards.com/sitemap.xml',
    });
  });
});
