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
  ) => Promise<void>;
  unmount: () => void;
};

export function renderLiveHook<T>(useHook: () => T): LiveHookHarness<T> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  let current: T | undefined;
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
    if (current === undefined) {
      throw new Error('Hook result was not captured');
    }
    return current;
  };

  const waitFor: LiveHookHarness<T>['waitFor'] = async (
    predicate,
    timeoutMs = 1_000,
  ) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (current !== undefined && predicate(current)) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('Timed out waiting for hook state');
  };

  const unmount = () => {
    root.unmount();
    container.remove();
  };

  return { getCurrent, waitFor, unmount };
}
