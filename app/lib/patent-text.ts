export type PatentTextFormat = 'sup' | 'sub' | 'ins' | 'del';
export type PatentTextRun = { text: string; formats: PatentTextFormat[] };

// Decode text, never HTML: unknown tags still become escaped React text.
function decodeEntities(value: string) {
  const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0' };
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (entity, key: string) => {
      if (!key.startsWith('#')) return named[key.toLowerCase()] ?? entity;
      const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    });
    if (decoded === value) break;
    value = decoded;
  }
  return value;
}

/** Only balanced, explicitly allowed inline tags affect presentation. Attributes
 * are never forwarded. All other markup stays literal, including scripts/URLs. */
export function parsePatentText(text: string, allowChanges = false): PatentTextRun[] {
  const value = decodeEntities(text);
  const tokens = [...value.matchAll(/<\s*(\/?)\s*(sup|sub|ins|del)\b[^<>]*>|<\s*br\s*\/?\s*>/gi)]
    .map((match) => ({ raw: match[0], index: match.index!, closing: Boolean(match[1]), tag: match[2]?.toLowerCase() as PatentTextFormat | undefined }));
  const balanced = new Set<number>();
  const openings: number[] = [];
  tokens.forEach((token, index) => {
    if (!token.tag || (!allowChanges && (token.tag === 'ins' || token.tag === 'del')) || /\/\s*>$/.test(token.raw)) return;
    if (!token.closing) openings.push(index);
    else if (tokens[openings.at(-1) ?? -1]?.tag === token.tag) {
      balanced.add(openings.pop()!); balanced.add(index);
    }
  });
  const runs: PatentTextRun[] = [];
  const formats: PatentTextFormat[] = [];
  const append = (part: string) => {
    if (!part) return;
    const activeFormats = formats.slice(-16);
    const previous = runs.at(-1);
    if (previous && previous.formats.join(',') === activeFormats.join(',')) previous.text += part;
    else runs.push({ text: part, formats: activeFormats });
  };
  let cursor = 0;
  tokens.forEach((token, index) => {
    append(value.slice(cursor, token.index));
    if (!token.tag) append('\n');
    else if (!balanced.has(index)) append(token.raw);
    else if (token.closing) formats.pop();
    else formats.push(token.tag);
    cursor = token.index + token.raw.length;
  });
  append(value.slice(cursor));
  return runs;
}

export function patentPlainText(text: string) {
  return parsePatentText(text).map((run) => run.text).join('');
}

export function patentTextHtml(text: string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  return parsePatentText(text).map((run) => run.formats.reduceRight((content, tag) => `<${tag}>${content}</${tag}>`, escape(run.text))).join('');
}
