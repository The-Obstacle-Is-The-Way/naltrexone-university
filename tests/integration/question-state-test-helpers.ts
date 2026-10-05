// The question-state fixtures moved to tests/shared/question-fixtures.ts so
// the end-to-end lane can use them too (DEBT-496).
export {
  type QuestionRevisionChange,
  type QuestionStateNow,
  reviseQuestion,
  setQuestionState,
} from '@/tests/shared/question-fixtures';
