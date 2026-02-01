/**
 * Integration test setup
 * Loads .env.test before tests run
 */

import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load .env.test from project root
config({ path: resolve(__dirname, '../../.env.test') });
