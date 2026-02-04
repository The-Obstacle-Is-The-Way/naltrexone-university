export function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise resolved before initialization');
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise rejected before initialization');
  };

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
