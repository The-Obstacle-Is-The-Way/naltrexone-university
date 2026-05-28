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
