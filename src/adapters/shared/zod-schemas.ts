import { z } from 'zod';
import { AllQuestionProgressStatuses } from '@/src/domain/value-objects';

export const zUuid = z.string().uuid();

export const zDifficulty = z.enum(['easy', 'medium', 'hard']);

export const zQuestionProgressStatus = z.enum(AllQuestionProgressStatuses);
