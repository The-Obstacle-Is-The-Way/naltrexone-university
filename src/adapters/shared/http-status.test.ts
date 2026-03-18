import { describe, expect, it } from 'vitest';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from './http-status';

describe('http-status', () => {
  it('exports the shared HTTP status constants used by runtime handlers', () => {
    expect(HTTP_OK).toBe(200);
    expect(HTTP_BAD_REQUEST).toBe(400);
    expect(HTTP_UNAUTHORIZED).toBe(401);
    expect(HTTP_TOO_MANY_REQUESTS).toBe(429);
    expect(HTTP_INTERNAL_SERVER_ERROR).toBe(500);
    expect(HTTP_SERVICE_UNAVAILABLE).toBe(503);
  });
});
