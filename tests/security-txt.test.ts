import { existsSync, readFileSync } from 'node:fs';
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

    const expires = contents.match(/^Expires:\s*(.+)$/m)?.[1];
    expect(expires).toBeDefined();

    const expiresAt = new Date(expires ?? '');
    expect(Number.isNaN(expiresAt.getTime())).toBe(false);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // security.txt's Policy field opens GitHub's security policy page, which
  // shows "No security policy detected" unless the repository has a
  // SECURITY.md (BUG-338).
  it('keeps the disclosure policy that the Policy field points to', () => {
    expect(existsSync('SECURITY.md')).toBe(true);
    const policy = readFileSync('SECURITY.md', 'utf-8');

    expect(policy).toContain(
      'https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/security/advisories/new',
    );
    expect(policy).toContain('support@addictionboards.com');
  });
});
