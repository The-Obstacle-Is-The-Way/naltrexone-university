import { z } from 'zod';

export const zUuid = z.string().uuid();

export const zDifficulty = z.enum(['easy', 'medium', 'hard']);
