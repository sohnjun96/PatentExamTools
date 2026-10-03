import { XMLParser } from 'fast-xml-parser';
import { extractClaimReferenceNumbers } from './patent-claim-xml';

type Node = Record<string, unknown>;
type Element = { attributes: Node; children: Node[] };
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false });
const nodes = (value: unknown): Node[] => Array.isArray(value) ? value as Node[] : [];
const record = (value: unknown): Node => value && typeof value === 'object' && !Array.isArray(value) ? value as Node : {};
const name = (key: string) => key.split(':').at(-1)?.toLowerCase() ?? key.toLowerCase();

function elements(value: Node[], target: string, found: Element[] = []): Element[] {
  for (const node of value) for (const [key, child] of Object.entries(node)) {
    if (!Array.isArray(child)) continue;
    if (name(key) === target) found.push({ attributes: record(node[':@']), children: nodes(child) });
    elements(nodes(child), target, found);
  }
  return found;
}

/** Mixed XML content is a sequence, not an object grouped by tag name.
 * Never join child tags separately: doing so moves charges/claim references. */
function inlineText(value: Node[]): string {
  return value.map((node) => Object.entries(node).map(([key, child]) => {
    if (key === '#text' || key === '#cdata') return typeof child === 'string' || typeof child === 'number' ? String(child) : '';
    if (!Array.isArray(child)) return '';
    const tag = name(key);
    if (tag === 'br') return '\n';
    const text = inlineText(nodes(child));
    if (tag === 'sup' || tag === 'sub') return `<${tag}>${text}</${tag}>`;
    if (tag === 'p' || tag === 'claim-text' || tag === 'row') return text + '\n';
    if (tag === 'entry') return text + '\t';
    return text;
  }).join('')).join('');
}

function clean(value: Node[]) {
  return inlineText(value).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function attribute(value: Node, key: string) {
  const entry = Object.entries(value).find(([field]) => name(field.replace(/^@_/, '')) === key)?.[1];
  return typeof entry === 'string' || typeof entry === 'number' ? String(entry) : '';
}
function paragraphNumber(value: string) { return !value ? null : /^\d+$/.test(value) ? value.padStart(4, '0') : value; }
function paragraphs(value: Node[]) {
  const found = elements(value, 'p');
  if (!found.length) { const text = clean(value); return text ? [{ number: null, text }] : []; }
  return found.map((p) => ({ number: paragraphNumber(attribute(p.attributes, 'num')), text: clean(p.children) })).filter((p) => p.text);
}

export function normalizeFullTextXml(xml: string, applicationNumber: string, sourceFileName: string) {
  const document = nodes(parser.parse(xml));
  const firstText = (key: string) => clean(elements(document, key)[0]?.children ?? []);
  const resultCode = firstText('resultcode');
  if (resultCode && resultCode !== '00') throw new Error(firstText('resultmsg') || `전문파일 오류 코드 ${resultCode}`);
  const sections = [
    ['technical-field', '기술분야'], ['background-art', '배경기술'], ['summary-of-invention', '발명의 내용'],
    ['description-of-drawings', '도면의 간단한 설명'], ['description-of-embodiments', '발명을 실시하기 위한 구체적인 내용'], ['reference-signs-list', '부호의 설명'],
  ].map(([id, title]) => ({ id, title, paragraphs: paragraphs(elements(document, id)[0]?.children ?? []) })).filter((s) => s.paragraphs.length);
  const claims = elements(document, 'claim').map((claim, index) => {
    const refs = ['claim-ref', 'claim-reference', 'claimref'].flatMap((tag) => elements(claim.children, tag).map((ref) => ({ ...ref.attributes, '#text': clean(ref.children) })));
    const referenceNumbers = extractClaimReferenceNumbers({ 'claim-ref': refs });
    const textNodes = elements(claim.children, 'claim-text');
    return {
      number: Number(attribute(claim.attributes, 'num')) || index + 1,
      text: textNodes.length ? textNodes.map((node) => clean(node.children)).filter(Boolean).join('\n') : clean(claim.children),
      ...(referenceNumbers.length ? { referenceNumbers, multipleDependent: referenceNumbers.length > 1 } : {}),
    };
  }).filter((claim) => claim.text);
  return {
    applicationNumber, title: firstText('invention-title') || '발명의 명칭 미수신',
    abstract: paragraphs(elements(document, 'abstract')[0]?.children ?? []), sections, claims,
    figureCount: elements(document, 'figure').length, sourceFileName, isDemo: false, fetchedAt: new Date().toISOString(),
  };
}
