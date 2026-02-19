export type RemoveBookmarkErrorCode =
  | 'missing_question_id'
  | 'toggle_failed'
  | 'remove_failed';

export function parseRemoveBookmarkErrorCode(
  code: string | undefined,
): RemoveBookmarkErrorCode | undefined {
  if (code === 'missing_question_id') return code;
  if (code === 'toggle_failed') return code;
  if (code === 'remove_failed') return code;
  return undefined;
}

export function getRemoveBookmarkErrorMessage(
  code: RemoveBookmarkErrorCode | undefined,
): string | null {
  if (!code) return null;

  switch (code) {
    case 'missing_question_id':
      return 'Unable to remove bookmark: missing question id.';
    case 'toggle_failed':
      return 'Unable to remove bookmark. Please try again.';
    case 'remove_failed':
      return 'Unable to remove bookmark. Please refresh and try again.';
  }
}
