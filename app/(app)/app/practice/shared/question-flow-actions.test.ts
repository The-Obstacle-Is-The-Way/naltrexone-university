import { describe, expect, it } from 'vitest';
import {
  buildTimeSpentSeconds,
  createTransitionedLoadAction,
} from './question-flow-actions';

describe('question-flow-actions', () => {
  it('returns zero when questionLoadedAtMs is null', () => {
    expect(buildTimeSpentSeconds(null, 1_000)).toBe(0);
  });

  it('clamps computed time spent to zero when clock goes backwards', () => {
    expect(buildTimeSpentSeconds(2_000, 1_000)).toBe(0);
  });

  it('converts elapsed milliseconds to whole seconds', () => {
    expect(buildTimeSpentSeconds(1_000, 3_499)).toBe(2);
  });

  it('runs load action within startTransition', () => {
    let transitioned = false;
    let executed = false;

    const run = () => {
      executed = true;
      return Promise.resolve();
    };

    const load = createTransitionedLoadAction({
      run,
      startTransition: (fn) => {
        transitioned = true;
        fn();
      },
    });

    load();

    expect(transitioned).toBe(true);
    expect(executed).toBe(true);
  });
});
