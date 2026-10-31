import type { ReactNode } from 'react';
import { literatureLink } from '@/app/lib/literature-link';
import AppIcon from './app-icon';

export default function LiteratureLink({ reference, url, children, className }: { reference: string; url?: string; children?: ReactNode; className?: string }) {
  const explicit = url ? literatureLink(url) : null;
  const link = explicit?.kind === 'url' ? explicit : literatureLink(reference);
  return <a href={link.href} title={link.title} className={className} target="_blank" rel="noopener noreferrer">
    {children ?? reference} <AppIcon name="arrow-right-up" size={16} /><span className="sr-only"> (새 창)</span>
  </a>;
}
