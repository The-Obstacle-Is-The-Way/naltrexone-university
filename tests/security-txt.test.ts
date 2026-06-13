import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('security.txt', () => {
  it('publishes a vulnerability contact and disclosure policy', () => {
    const contents = readFileSync('public/.well-known/security.txt', 'utf-8');

    expect(contents).toContain(
      'Contact: https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/security/advisories/new',
    );
    expect(contents).toContain(
      'Policy: https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/security/policy',
    );
    expect(contents).toContain(
      'Canonical: https://addictionboards.com/.well-known/security.txt',
    );
    expect(contents).toContain('Preferred-Languages: en');
    expect(contents).toContain('Expires: 2027-06-13T00:00:00Z');
  });
});
