import { normalizeSearchParam } from '@/lib/search-params';

const REMOVE_BOOKMARK_ERROR_CODES = [
  'missing_question_id',
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
  code: string | string[] | undefined,
): RemoveBookmarkErrorCode | undefined {
  const normalized = normalizeSearchParam(code);
  if (!normalized) return undefined;
  return isRemoveBookmarkErrorCode(normalized) ? normalized : undefined;
}

// A Record keeps every code's message required at compile time.
const REMOVE_BOOKMARK_ERROR_MESSAGES: Record<RemoveBookmarkErrorCode, string> =
  {
    missing_question_id: 'Unable to remove bookmark: missing question id.',
    remove_failed: 'Unable to remove bookmark. Please try again.',
  };

export function getRemoveBookmarkErrorMessage(
  code: RemoveBookmarkErrorCode | undefined,
): string | null {
  return code ? REMOVE_BOOKMARK_ERROR_MESSAGES[code] : null;
}
