// Augment FocusOptions with the `focusVisible` property used by
// HTMLElement.focus(). Runtime support exists in modern browsers, but
// TypeScript's lib.dom.d.ts does not declare it yet. Remove this file once
// TypeScript ships the property natively.
interface FocusOptions {
  focusVisible?: boolean;
}
