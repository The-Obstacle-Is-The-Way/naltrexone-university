'use client';

import { Children, isValidElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const CLINICAL_PEARL_LABEL = /^clinical\s+pearl:\s*$/i;

function isClinicalPearl(children: ReactNode) {
  const [firstChild] = Children.toArray(children);

  if (
    !isValidElement<{ children?: ReactNode }>(firstChild) ||
    firstChild.type !== 'strong'
  ) {
    return false;
  }

  const label = String(firstChild.props.children ?? '');
  return CLINICAL_PEARL_LABEL.test(label);
}

function extractPearlContent(children: ReactNode) {
  const [, ...remainingChildren] = Children.toArray(children);

  if (remainingChildren.length === 0) {
    return null;
  }

  const [firstContentNode, ...restContentNodes] = remainingChildren;

  if (typeof firstContentNode !== 'string') {
    return remainingChildren;
  }

  return [firstContentNode.replace(/^\s+/, ''), ...restContentNodes];
}

const markdownComponents: Components = {
  p({ children }) {
    if (!isClinicalPearl(children)) {
      return <p>{children}</p>;
    }

    const pearlContent = extractPearlContent(children);

    return (
      <div className="mt-3 border-l-2 border-foreground/20 pl-3">
        {/* <div> not <p> — avoids wrapper's [&_p+p]:mt-3 cascade into the content <p> */}
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Clinical Pearl
        </div>
        <p>{pearlContent}</p>
      </div>
    );
  },
};

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn('[&_p+p]:mt-3', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
