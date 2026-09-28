import { z } from 'zod';
import {
  AllDifficulties,
  AllQuestionProgressStatuses,
} from '@/src/domain/value-objects';

export const zUuid = z.guid();

export const zDifficulty = z.enum(AllDifficulties);

export const zQuestionProgressStatus = z.enum(AllQuestionProgressStatuses);

// A consent disclosure's version: its adoption date, with a revision suffix
// when a second text is adopted the same day (DEBT-414 F03).
export const zDisclosureVersion = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
