export const QUESTION_PAGE_QUESTION_1_ID = crypto.randomUUID();
export const QUESTION_PAGE_QUESTION_2_ID = crypto.randomUUID();
export const QUESTION_PAGE_CHOICE_1_ID = crypto.randomUUID();
export const QUESTION_PAGE_CHOICE_2_ID = crypto.randomUUID();
export const QUESTION_PAGE_ATTEMPT_1_ID = crypto.randomUUID();
export const QUESTION_PAGE_ATTEMPT_2_ID = crypto.randomUUID();
export const QUESTION_PAGE_ATTEMPT_3_ID = crypto.randomUUID();

export function getQuestionPageQuestionIdForSlug(slug: string) {
  return slug === 'q-2'
    ? QUESTION_PAGE_QUESTION_2_ID
    : QUESTION_PAGE_QUESTION_1_ID;
}
