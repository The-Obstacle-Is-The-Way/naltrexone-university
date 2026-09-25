import { describe, expect, it } from 'vitest';
import { createBaseProps } from './question-page-client-test-helpers';

describe('question-page-client test helpers', () => {
  it('creates base props whose callbacks do nothing', () => {
    const props = createBaseProps();

    expect(props.onTryAgain()).toBeUndefined();
    expect(props.onSelectChoice()).toBeUndefined();
    expect(props.onSubmit()).toBeUndefined();
    expect(props.onReattempt()).toBeUndefined();
  });
});
