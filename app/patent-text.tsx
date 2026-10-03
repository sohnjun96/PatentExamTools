import { Fragment, type ReactNode } from 'react';
import { exactEvidenceExpression } from '@/app/lib/evidence-location';
import { parsePatentText, patentPlainText, type PatentTextFormat } from '@/app/lib/patent-text';

function format(content: ReactNode, tags: PatentTextFormat[]): ReactNode {
  return tags.reduceRight<ReactNode>((child, tag) => {
    if (tag === 'sup') return <sup>{child}</sup>;
    if (tag === 'sub') return <sub>{child}</sub>;
    if (tag === 'ins') return <ins>{child}</ins>;
    return <del>{child}</del>;
  }, content);
}

/** Safe inline typography + matching against visible text, not markup syntax. */
export default function PatentText({ text, excerpt = '', query = '', allowChanges = false }: {
  text: string; excerpt?: string; query?: string; allowChanges?: boolean;
}) {
  const runs = parsePatentText(text, allowChanges);
  const plain = runs.map((run) => run.text).join('');
  const evidence = exactEvidenceExpression(plain, patentPlainText(excerpt));
  const expression = evidence ?? exactEvidenceExpression(plain, patentPlainText(query));
  const matches = expression ? [...plain.matchAll(expression)].map((match) => ({ start: match.index!, end: match.index! + match[0].length })) : [];
  const positions = [0];
  for (const run of runs) positions.push(positions.at(-1)! + run.text.length);
  return <span className="patent-text">{runs.map((run, index) => {
    const start = positions[index]; const end = positions[index + 1];
    const children: ReactNode[] = [];
    let cursor = start;
    for (const match of matches) {
      if (match.end <= start || match.start >= end) continue;
      const from = Math.max(match.start, start); const to = Math.min(match.end, end);
      if (from > cursor) children.push(run.text.slice(cursor - start, from - start));
      children.push(<mark key={from} className={evidence ? 'evidence-highlight' : 'search-highlight'}>{run.text.slice(from - start, to - start)}</mark>);
      cursor = to;
    }
    if (cursor < end) children.push(run.text.slice(cursor - start));
    return <Fragment key={index}>{format(children, run.formats)}</Fragment>;
  })}</span>;
}
