import { describe, expect, it } from 'vitest';
import {
  containsDescendant,
  findAnchorByHref,
  findButtonByText,
  findElementByText,
  findFieldsetByLegendText,
  findHeadingByText,
  findMainLandmarkById,
  hasExplicitDocumentShell,
  isNodeBefore,
  parseHtml,
} from './dom-helpers';

describe('dom-helpers', () => {
  it('parses static markup into a queryable document', () => {
    const doc = parseHtml('<main id="main-content">Content</main>');

    expect(doc.body.textContent).toBe('Content');
    expect(findMainLandmarkById(doc, 'main-content')).not.toBeNull();
  });

  it('finds elements by normalized text content', () => {
    const doc = parseHtml('<section><p> Alpha   beta </p></section>');

    expect(findElementByText(doc, 'p', 'Alpha beta')).not.toBeNull();
    expect(findElementByText(doc, 'p', 'Alpha')).toBeNull();
  });

  it('finds anchors by exact href attribute value', () => {
    const doc = parseHtml(
      '<a href="/app/history?tab=sessions&amp;sort=desc">Sessions</a><a href="/app/history?tab=questions">Questions</a>',
    );

    expect(
      findAnchorByHref(doc, '/app/history?tab=sessions&sort=desc')?.textContent,
    ).toBe('Sessions');
    expect(findAnchorByHref(doc, '/app/history?tab=sessions')).toBeNull();
  });

  it('finds headings by level and accessible text', () => {
    const doc = parseHtml(
      '<h1>Billing</h1><div role="heading" aria-level="2">Details</div>',
    );

    expect(findHeadingByText(doc, 'Billing', { level: 1 })?.tagName).toBe('H1');
    expect(findHeadingByText(doc, 'Details', { level: 2 })).not.toBeNull();
    expect(findHeadingByText(doc, 'Details', { level: 1 })).toBeNull();
  });

  it('finds buttons by normalized text content', () => {
    const doc = parseHtml('<button disabled> Submit </button>');

    expect(findButtonByText(doc, 'Submit')?.hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('finds fieldsets by legend text', () => {
    const doc = parseHtml(
      '<fieldset><legend>Answer choices</legend><button>A</button></fieldset>',
    );

    expect(findFieldsetByLegendText(doc, 'Answer choices')).not.toBeNull();
    expect(findFieldsetByLegendText(doc, 'Mode')).toBeNull();
  });

  it('compares document order without relying on serialized string offsets', () => {
    const doc = parseHtml('<div id="first"></div><div id="second"></div>');
    const first = doc.getElementById('first');
    const second = doc.getElementById('second');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first && second ? isNodeBefore(first, second) : false).toBe(true);
    expect(first && second ? isNodeBefore(second, first) : true).toBe(false);
  });

  it('does not treat disconnected nodes as ordered', () => {
    const firstDoc = parseHtml('<div id="first"></div>');
    const secondDoc = parseHtml('<div id="second"></div>');
    const first = firstDoc.getElementById('first');
    const second = secondDoc.getElementById('second');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first && second ? isNodeBefore(first, second) : true).toBe(false);
  });

  it('checks structural containment without accepting sibling nodes', () => {
    const doc = parseHtml(
      '<footer id="footer"><fieldset id="rating"></fieldset></footer><fieldset id="sibling"></fieldset>',
    );
    const footer = doc.getElementById('footer');
    const rating = doc.getElementById('rating');
    const sibling = doc.getElementById('sibling');

    expect(containsDescendant(footer, rating)).toBe(true);
    expect(containsDescendant(footer, sibling)).toBe(false);
    expect(containsDescendant(footer, footer)).toBe(false);
    expect(containsDescendant(footer, null)).toBe(false);
  });

  it('detects an explicitly rendered document shell without DOMParser synthesis', () => {
    expect(
      hasExplicitDocumentShell(
        '<html lang="en"><head><title>Title</title></head><body>Body</body></html>',
      ),
    ).toBe(true);
    expect(hasExplicitDocumentShell('<div>Fragment</div>')).toBe(false);
  });
});
