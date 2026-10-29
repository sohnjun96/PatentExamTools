import type { ReactNode } from 'react';
import { literatureLink } from '@/app/lib/literature-link';

export default function LiteratureLink({ reference, url, children, className }: { reference: string; url?: string; children?: ReactNode; className?: string }) {
  const explicit = url ? literatureLink(url) : null;
  const link = explicit?.kind === 'url' ? explicit : literatureLink(reference);
  return <a href={link.href} title={link.title} className={className} target="_blank" rel="noopener noreferrer">
    {children ?? reference} <span aria-hidden="true">↗</span><span className="sr-only"> (새 창)</span>
  </a>;
}
