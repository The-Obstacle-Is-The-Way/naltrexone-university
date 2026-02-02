/**
 * Integration test setup
 * Loads .env.test before tests run
 */

import { resolve } from 'node:path';
import { vi } from 'vitest';
import { loadDotenvFileOrThrow } from '../shared/load-dotenv-file';

// Load .env.test from project root
loadDotenvFileOrThrow(resolve(__dirname, '../../.env.test'));

vi.mock('server-only', () => ({}));
