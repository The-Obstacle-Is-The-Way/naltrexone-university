const REMOVE_BOOKMARK_ERROR_CODES = [
  'missing_question_id',
  'toggle_failed',
  'remove_failed',
] as const;

export type RemoveBookmarkErrorCode =
  (typeof REMOVE_BOOKMARK_ERROR_CODES)[number];

function isRemoveBookmarkErrorCode(
  code: string,
): code is RemoveBookmarkErrorCode {
  return (REMOVE_BOOKMARK_ERROR_CODES as readonly string[]).includes(code);
}

export function parseRemoveBookmarkErrorCode(
  code: string | undefined,
): RemoveBookmarkErrorCode | undefined {
  if (!code) return undefined;
  return isRemoveBookmarkErrorCode(code) ? code : undefined;
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
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
