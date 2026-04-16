import { describe, expect, it, vi } from 'vitest';
import { focusElementWithoutScroll } from './focus-element-without-scroll';

describe('focusElementWithoutScroll', () => {
  it('focuses with preventScroll when the browser supports it', () => {
    const focus = vi.fn();
    const element = { focus } as unknown as HTMLElement;

    focusElementWithoutScroll(element);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('falls back to a plain focus call when preventScroll is unsupported', () => {
    const focus = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('preventScroll unsupported');
      })
      .mockImplementationOnce(() => undefined);
    const element = { focus } as unknown as HTMLElement;

    focusElementWithoutScroll(element);

    expect(focus).toHaveBeenCalledTimes(2);
    expect(focus).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(focus).toHaveBeenNthCalledWith(2);
  });

  it('does nothing when the element is null', () => {
    expect(() => focusElementWithoutScroll(null)).not.toThrow();
  });
});
