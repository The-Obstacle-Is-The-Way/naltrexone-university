import { describe, expect, it, vi } from 'vitest';
import { focusElementWithoutScroll } from './focus-element-without-scroll';

describe('focusElementWithoutScroll', () => {
  it('calls focus with preventScroll: true', () => {
    const focus = vi.fn();
    const element = { focus } as unknown as HTMLElement;

    focusElementWithoutScroll(element);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('rethrows focus failures instead of retrying without preventScroll', () => {
    const error = new Error('focus failed');
    const focus = vi.fn().mockImplementationOnce(() => {
      throw error;
    });
    const element = { focus } as unknown as HTMLElement;

    expect(() => focusElementWithoutScroll(element)).toThrow(error);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does nothing when the element is null', () => {
    expect(() => focusElementWithoutScroll(null)).not.toThrow();
  });
});
