export type AsyncLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type AsyncLoadStateWithIdle = { status: 'idle' } | AsyncLoadState;

export function getLoadStateErrorMessage(
  state: AsyncLoadState | AsyncLoadStateWithIdle,
): string | null {
  return state.status === 'error' ? state.message : null;
}
