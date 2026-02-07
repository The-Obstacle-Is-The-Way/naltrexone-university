// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';

type HookProbeProps<T> = {
  useHook: () => T;
  onRender: (value: T) => void;
};

function HookProbe<T>(props: HookProbeProps<T>) {
  props.onRender(props.useHook());
  return null;
}

export type LiveHookHarness<T> = {
  getCurrent: () => T;
  waitFor: (
    predicate: (value: T) => boolean,
    timeoutMs?: number,
    pollIntervalMs?: number,
  ) => Promise<void>;
  unmount: () => void;
};

const UNSET = Symbol('UNSET_HOOK_VALUE');

export function renderLiveHook<T>(useHook: () => T): LiveHookHarness<T> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  let current: T | typeof UNSET = UNSET;
  const root = createRoot(container);
  root.render(
    <HookProbe
      useHook={useHook}
      onRender={(value) => {
        current = value;
      }}
    />,
  );

  const getCurrent = () => {
    if (current === UNSET) {
      throw new Error('Hook result was not captured');
    }
    return current;
  };

  const waitFor: LiveHookHarness<T>['waitFor'] = async (
    predicate,
    timeoutMs = 1_000,
    pollIntervalMs = 10,
  ) => {
    let stopped = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const pollPromise = (async () => {
      while (!stopped) {
        if (current !== UNSET && predicate(current)) return;
        await sleep(pollIntervalMs);
      }
    })();

    const timeoutPromise = (async () => {
      await sleep(timeoutMs);
      throw new Error('Timed out waiting for hook state');
    })();

    try {
      await Promise.race([pollPromise, timeoutPromise]);
    } finally {
      stopped = true;
    }
  };

  const unmount = () => {
    root.unmount();
    container.remove();
  };

  return { getCurrent, waitFor, unmount };
}
