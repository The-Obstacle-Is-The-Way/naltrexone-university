import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isPublishedKeySet,
  matchesPublishedClerkKeys,
  parseClerkJwtKey,
} from './clerk-jwt-key';

function rsaKeys(modulusLength = 2048) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
  });
  return {
    pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    jwk: publicKey.export({ format: 'jwk' }),
  };
}

// DEBT-503 item 5: Clerk reads a local key by stripping the PEM's newlines,
// header and a fixed 2048-bit RSA prefix. A key it would misread signs every
// visitor out, so only a key it reads exactly is accepted.
describe('parseClerkJwtKey', () => {
  it('accepts an RSA 2048 public key in PEM form', () => {
    const { pem } = rsaKeys();

    expect(parseClerkJwtKey(pem)).toBe(pem.trim());
  });

  it('restores the newlines of a key pasted with escaped ones', () => {
    const { pem } = rsaKeys();

    expect(parseClerkJwtKey(pem.trim().replaceAll('\n', '\\n'))).toBe(
      pem.trim(),
    );
  });

  it('is undefined when no key is configured', () => {
    expect(parseClerkJwtKey(undefined)).toBeUndefined();
    expect(parseClerkJwtKey('  ')).toBeUndefined();
  });

  it('refuses text that is not a public key', () => {
    expect(() => parseClerkJwtKey('not a key')).toThrow(
      'CLERK_JWT_KEY is not a public key in PEM form',
    );
  });

  it('refuses a PEM whose body is not a key', () => {
    expect(() =>
      parseClerkJwtKey(
        '-----BEGIN PUBLIC KEY-----\nbm90IGEga2V5\n-----END PUBLIC KEY-----',
      ),
    ).toThrow('CLERK_JWT_KEY is not a public key in PEM form');
  });

  it('refuses a private key', () => {
    expect(() => parseClerkJwtKey(rsaKeys().privatePem)).toThrow(
      'CLERK_JWT_KEY is not a public key in PEM form',
    );
  });

  it('refuses a key Clerk would misread', () => {
    expect(() => parseClerkJwtKey(rsaKeys(4096).pem)).toThrow(
      'CLERK_JWT_KEY is not an RSA 2048 key Clerk can read',
    );
  });
});

describe('matchesPublishedClerkKeys', () => {
  it('matches a key Clerk publishes', () => {
    const configured = rsaKeys();
    const other = rsaKeys();

    expect(
      matchesPublishedClerkKeys(configured.pem, {
        keys: [
          { ...other.jwk, kid: 'ins_other' },
          { ...configured.jwk, kid: 'ins_live' },
        ],
      }),
    ).toBe(true);
  });

  it('does not match when Clerk publishes other keys', () => {
    expect(
      matchesPublishedClerkKeys(rsaKeys().pem, {
        keys: [{ ...rsaKeys().jwk, kid: 'ins_live' }],
      }),
    ).toBe(false);
  });

  it('does not match an empty key set', () => {
    expect(matchesPublishedClerkKeys(rsaKeys().pem, { keys: [] })).toBe(false);
  });
});

// Only a key set can show the configured key is wrong; any other answer says
// nothing about it (scripts/deploy/check-clerk-jwt-key.ts).
describe('isPublishedKeySet', () => {
  it.each([
    ['an empty key set', { keys: [] }],
    ['a key set', { keys: [{ kty: 'RSA' }] }],
  ])('accepts %s', (_label, answer) => {
    expect(isPublishedKeySet(answer)).toBe(true);
  });

  it.each([
    ['null', null],
    ['text', 'maintenance'],
    ['an object without keys', { errors: [{ code: 'internal' }] }],
    ['keys that are not a list', { keys: { kty: 'RSA' } }],
  ])('refuses %s', (_label, answer) => {
    expect(isPublishedKeySet(answer)).toBe(false);
  });
});
