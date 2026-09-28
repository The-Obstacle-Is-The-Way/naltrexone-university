import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_DISCLOSURE_REGISTRY,
  resolveCheckoutDisclosure,
} from './checkout-disclosures';
import { createCheckoutRenewalTerms } from './pricing-data';

const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

// DEBT-414 F15: registered consent texts are evidence and never change.
const PINNED_SHA256: Record<string, Record<string, string>> = {
  '2026-09-16': {
    'monthly/trial':
      '74cbc34b184c2652a3d693dc19516f86de80a16d0dbf8a426bbf0c07371df632',
    'monthly/standard':
      'ddf078ac20842af82e3e9dec9034856a7fb8a701a44dc99baf35b2365aa98da8',
    'annual/trial':
      '7b8fa40e22feb4a5cb17794a0af904d1f1ce8864533dcfd313cb3b402517b72e',
    'annual/standard':
      '9c748034f93710de59e05441da01a2fca1f6dd7e1e7d672849ef6ea2b2b1c54b',
  },
};

describe('checkout disclosure registry', () => {
  it('never changes a registered text', () => {
    const actual = Object.fromEntries(
      Object.entries(CHECKOUT_DISCLOSURE_REGISTRY).map(([version, plans]) => [
        version,
        Object.fromEntries(
          Object.entries(plans).flatMap(([plan, variants]) =>
            Object.entries(variants).map(([variant, text]) => [
              `${plan}/${variant}`,
              sha256(text),
            ]),
          ),
        ),
      ]),
    );

    expect(actual).toEqual(PINNED_SHA256);
  });

  it.each([
    ['monthly', true],
    ['monthly', false],
    ['annual', true],
    ['annual', false],
  ] as const)(
    'registers the live %s consent text (trial: %s) under its current version',
    (plan, hasTrial) => {
      const live = createCheckoutRenewalTerms(plan, hasTrial);

      expect(
        resolveCheckoutDisclosure({
          disclosureVersion: live.disclosureVersion,
          plan,
          hasTrial,
        }),
      ).toBe(live.disclosureSnapshot);
    },
  );

  it('resolves nothing for an unregistered version', () => {
    expect(
      resolveCheckoutDisclosure({
        disclosureVersion: '1999-01-01',
        plan: 'monthly',
        hasTrial: false,
      }),
    ).toBeNull();
    // Not an inherited object key either.
    expect(
      resolveCheckoutDisclosure({
        disclosureVersion: 'constructor',
        plan: 'monthly',
        hasTrial: false,
      }),
    ).toBeNull();
  });
});
