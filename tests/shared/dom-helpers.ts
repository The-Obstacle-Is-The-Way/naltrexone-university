type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function elementText(element: Element): string {
  return normalizeText(element.textContent ?? '');
}

export function findElementByText<T extends Element = Element>(
  root: ParentNode,
  selector: string,
  text: string,
): T | null {
  const normalizedText = normalizeText(text);
  return (
    (Array.from(root.querySelectorAll<T>(selector)).find(
      (element) => elementText(element) === normalizedText,
    ) as T | undefined) ?? null
  );
}

export function findAnchorByHref(
  root: ParentNode,
  href: string,
): HTMLAnchorElement | null {
  return (
    Array.from(root.querySelectorAll('a')).find(
      (anchor) => anchor.getAttribute('href') === href,
    ) ?? null
  );
}

export function findMainLandmarkById(
  root: ParentNode,
  id: string,
): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('main')).find(
      (main) => main.id === id,
    ) ?? null
  );
}

function headingLevel(element: Element): HeadingLevel | null {
  const nativeLevel = /^H([1-6])$/.exec(element.tagName)?.[1];
  if (nativeLevel) {
    return Number(nativeLevel) as HeadingLevel;
  }

  if (element.getAttribute('role') !== 'heading') {
    return null;
  }

  const ariaLevel = element.getAttribute('aria-level');
  if (!ariaLevel || !/^[1-6]$/.test(ariaLevel)) {
    return null;
  }

  return Number(ariaLevel) as HeadingLevel;
}

export function findHeadingByText(
  root: ParentNode,
  text: string,
  options: { level?: HeadingLevel } = {},
): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[role="heading"]'),
  );
  const normalizedText = normalizeText(text);

  return (
    candidates.find((candidate) => {
      if (elementText(candidate) !== normalizedText) {
        return false;
      }

      return options.level ? headingLevel(candidate) === options.level : true;
    }) ?? null
  );
}

export function findButtonByText(
  root: ParentNode,
  text: string,
): HTMLButtonElement | null {
  return findElementByText<HTMLButtonElement>(root, 'button', text);
}

export function findFieldsetByLegendText(
  root: ParentNode,
  legendText: string,
): HTMLFieldSetElement | null {
  const normalizedLegendText = normalizeText(legendText);
  return (
    Array.from(root.querySelectorAll<HTMLFieldSetElement>('fieldset')).find(
      (fieldset) => {
        const legend = fieldset.querySelector('legend');
        return legend ? elementText(legend) === normalizedLegendText : false;
      },
    ) ?? null
  );
}

export function isNodeBefore(before: Node, after: Node): boolean {
  const position = before.compareDocumentPosition(after);
  if ((position & Node.DOCUMENT_POSITION_DISCONNECTED) !== 0) {
    return false;
  }

  return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

export function hasExplicitDocumentShell(html: string): boolean {
  const trimmedHtml = html.trimStart().toLowerCase();
  const htmlOpenIndex = trimmedHtml.search(/<html(?:\s|>)/);
  const headOpenIndex = trimmedHtml.search(/<head(?:\s|>)/);
  const bodyOpenIndex = trimmedHtml.search(/<body(?:\s|>)/);

  return (
    htmlOpenIndex === 0 &&
    headOpenIndex > htmlOpenIndex &&
    bodyOpenIndex > headOpenIndex
  );
}
