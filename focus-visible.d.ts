// Augment the global FocusOptions used by HTMLElement.focus() with the
// standards-track `focusVisible` option.
// Spec: https://html.spec.whatwg.org/multipage/interaction.html#dom-focus-options
// TypeScript tracking: https://github.com/microsoft/TypeScript/issues/61458
// Remove this file once TypeScript's lib.dom.d.ts includes `focusVisible`.
export {};

declare global {
  interface FocusOptions {
    focusVisible?: boolean;
  }
}
