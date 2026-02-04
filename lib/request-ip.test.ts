import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/request-ip';

describe('getClientIp', () => {
  it('prefers x-vercel-forwarded-for when present', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.1',
      'x-vercel-forwarded-for': '198.51.100.9',
    });

    expect(getClientIp(headers)).toBe('198.51.100.9');
  });

  it('falls back to x-forwarded-for when x-vercel-forwarded-for is empty', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.1',
      'x-vercel-forwarded-for': '',
    });

    expect(getClientIp(headers)).toBe('203.0.113.1');
  });

  it('falls back to x-forwarded-for when x-vercel-forwarded-for is missing', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.1, 70.41.3.18, 150.172.238.178',
    });

    expect(getClientIp(headers)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when forwarded-for headers are missing', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.2' });

    expect(getClientIp(headers)).toBe('203.0.113.2');
  });

  it('returns unknown when no headers are present', () => {
    const headers = new Headers();

    expect(getClientIp(headers)).toBe('unknown');
  });

  it('returns unknown when headers contain empty values', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '',
      'x-forwarded-for': '',
      'x-real-ip': '',
    });

    expect(getClientIp(headers)).toBe('unknown');
  });
});
