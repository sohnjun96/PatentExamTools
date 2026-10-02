import type { FullTextDocument } from './patent-document-client';

export type OriginalTarget = { sourceId: string; locator: string; excerpt: string };

export function canonicalOriginalId(id: string, payload: Pick<FullTextDocument, 'sections' | 'abstract' | 'claims'>): string {
  if (id === 'abstract') return payload.abstract.length ? `abstract-${payload.abstract[0].number || 1}` : id;
  const match = id.match(/^(paragraph|abstract|claim)-(.+)$/);
  if (!match) return id;
  const key = Number(match[2].replace(/\D/g, ''));
  if (match[1] === 'claim') return `claim-${key}`;
  const paragraphs = match[1] === 'abstract' ? payload.abstract : payload.sections.flatMap((section) => section.paragraphs);
  const paragraph = paragraphs.find((item) => item.number && Number(item.number.replace(/\D/g, '')) === key);
  return paragraph?.number ? `${match[1]}-${paragraph.number}` : id;
}

export function exactEvidenceExpression(text: string, excerpt: string): RegExp | null {
  const words = excerpt.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const provision = excerpt.match(/^제\s*(\d+)\s*조\s*(?:제\s*)?(\d+)\s*항$/u);
  const source = provision ? `제\\s*${provision[1]}\\s*조\\s*(?:제\\s*)?${provision[2]}\\s*항` : words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const expression = new RegExp(`(${source})`, 'giu');
  return expression.test(text) ? new RegExp(`(${source})`, 'giu') : null;
}
