import { z } from 'zod';
import {
  AllDifficulties,
  AllQuestionProgressStatuses,
} from '@/src/domain/value-objects';

export const zUuid = z.guid();

export const zDifficulty = z.enum(AllDifficulties);

export const zQuestionProgressStatus = z.enum(AllQuestionProgressStatuses);
