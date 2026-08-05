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
  'rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

function LegalLink({
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<'a'>) {
  if (href?.startsWith('/')) {
    return (
      <Link href={href} className={contentLinkClass}>
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
      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
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
      <td className="border-b border-border px-4 py-3 align-top leading-6 text-foreground last:border-b-0">
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
