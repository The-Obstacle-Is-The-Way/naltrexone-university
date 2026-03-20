// Augment FocusOptions with the `focusVisible` property from the WHATWG HTML
// spec proposal.  Chrome 122+, Firefox 104+, Safari 17.4+ support it at
// runtime, but TypeScript's lib.dom.d.ts has not absorbed it yet.
// Remove this file once TypeScript ships the property natively.
interface FocusOptions {
  focusVisible?: boolean;
}
