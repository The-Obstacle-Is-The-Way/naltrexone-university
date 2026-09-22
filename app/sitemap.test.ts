import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('public sitemap', () => {
  it('lists exactly the four canonical content URLs, without auth or matcher syntax', () => {
    expect(sitemap()).toEqual([
      { url: 'https://addictionboards.com/' },
      { url: 'https://addictionboards.com/pricing' },
      { url: 'https://addictionboards.com/privacy' },
      { url: 'https://addictionboards.com/terms' },
    ]);
  });
});
