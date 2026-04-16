export function focusElementWithoutScroll(element: HTMLElement | null) {
  if (!element) return;

  element.focus({ preventScroll: true });
}
