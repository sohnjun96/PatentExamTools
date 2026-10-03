import type { FullTextDocument } from './patent-document-client';

export type OriginalTarget = { sourceId: string; locator: string; excerpt: string };

/** Choose a substantive original passage, not the legal-ground index/table. */
export function noticeGroundTarget(markdown: string, provision: string, claimNumbers: number[], documentNumber: string): OriginalTarget {
  const body = markdown.split(/구체적인\s*거절이유/u).slice(1).join('구체적인 거절이유') || '';
  const law = provision.replace(/\s+/g, '').replace(/^특허법/u, '');
  const lawPattern = /제\s*\d+\s*조\s*(?:제\s*)?\d+\s*항/gu;
  const normalizeLaw = (value: string) => value.replace(/\s+/g, '').replace(/조(\d+)항/u, '조제$1항');
  const targetLaw = normalizeLaw(law);
  let activeLaw = '';
  const candidates = body.replace(/<br\s*\/?\s*>/gi, ' ').replace(/\*\*/g, '').split('\n')
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .map((line) => {
      const laws = [...line.matchAll(lawPattern)].map((match) => normalizeLaw(match[0]));
      if (laws.length === 1 && line.length < 200) activeLaw = laws[0];
      return { line, laws, sectionLaw: activeLaw };
    })
    .filter(({ line }) => line.length >= 45 && !line.startsWith('|'));
  const scored = candidates.filter(({ laws, sectionLaw }) => laws.includes(targetLaw) || (!laws.length && sectionLaw === targetLaw))
    .map(({ line }) => ({
    line, score: (exactEvidenceExpression(line, law) ? 10 : 5)
      + claimNumbers.filter((number) => new RegExp(`제?\\s*${number}\\s*항`, 'u').test(line)).length
      + (/인용발명|차이점|통상의\s*기술자|기재|쉽게/.test(line) ? 2 : 0),
  })).sort((a, b) => b.score - a.score);
  const excerpt = scored[0]?.line.slice(0, 180) ?? '';
  return { sourceId: `notice-${documentNumber}`, locator: `${provision} · 청구항 ${claimNumbers.join(', ')}${excerpt ? '' : ' · 근거 위치 미확인'}`, excerpt };
}

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
