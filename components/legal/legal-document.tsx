import 'server-only';

import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export type LegalDocumentContent = {
  title: string;
  effectiveDate: string;
  bodyMarkdown: string;
};

const contentLinkClass =
  'rounded-sm font-medium text-foreground hover:underline ring-focus';

function LegalLink({
  href,
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<'a'> & { node?: unknown }) {
  const target = href ?? '';

  // Same-page anchors and mailto: stay in this tab. A single leading slash is
  // an app route; `//host` is protocol-relative, i.e. external despite the
  // leading slash, and must never reach next/link.
  if (target.startsWith('#') || /^mailto:/i.test(target)) {
    return (
      <a {...props} href={target} className={contentLinkClass}>
        {children}
      </a>
    );
  }

  if (target.startsWith('/') && !target.startsWith('//')) {
    // A blanket `{...props}` spread is rejected by next/link's LinkProps under
    // exactOptionalPropertyTypes. `title` is the only attribute rehype-sanitize
    // lets through on an anchor besides href, so forward it explicitly rather
    // than silently dropping what the anchor branches preserve.
    return (
      <Link
        {...(props.title === undefined ? {} : { title: props.title })}
        href={target}
        className={contentLinkClass}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      {...props}
      href={href}
      className={contentLinkClass}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  );
}

const legalMarkdownComponents: Components = {
  h2({ children }) {
    return (
      <h2 className="mt-10 font-heading text-2xl font-bold tracking-tight text-foreground">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h2 className="mt-10 font-heading text-2xl font-bold tracking-tight text-foreground">
        {children}
      </h2>
    );
  },
  h4({ children }) {
    return (
      <h3 className="mt-8 font-heading text-xl font-semibold tracking-tight text-foreground">
        {children}
      </h3>
    );
  },
  p({ children }) {
    return (
      <p className="mt-4 text-base leading-7 text-foreground">{children}</p>
    );
  },
  ul({ children }) {
    return (
      <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-foreground">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7 text-foreground">
        {children}
      </ol>
    );
  },
  table({ children }) {
    return (
      // Focusable but deliberately unlabelled and role-less: axe
      // scrollable-region-focusable only requires keyboard reachability, while
      // a `region` role would make every table on the page a landmark sharing
      // one accessible name — trading this violation for axe landmark-unique.
      <div
        /* biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontally scrollable content must be keyboard-reachable (WCAG 2.1.1 / axe scrollable-region-focusable). */
        tabIndex={0}
        className="mt-6 overflow-x-auto rounded-xl border border-border ring-focus"
      >
        <table className="w-full border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted/20 text-foreground">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="border-b border-border px-4 py-3 font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      // Border suppression targets the last row's cells, not each row's last
      // cell — `last:` alone would strip the rightmost column's separators.
      <td className="border-b border-border px-4 py-3 align-top leading-6 text-foreground [tbody_tr:last-child_&]:border-b-0">
        {children}
      </td>
    );
  },
  a: LegalLink,
  code({ children }) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 text-sm text-foreground">
        {children}
      </code>
    );
  },
};

export function LegalDocument({ content }: { content: LegalDocumentContent }) {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
          {content.title}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: {content.effectiveDate}
        </p>
      </header>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={legalMarkdownComponents}
      >
        {content.bodyMarkdown}
      </ReactMarkdown>
    </article>
  );
}
