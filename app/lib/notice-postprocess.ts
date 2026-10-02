import type { NoticeSummary } from './notice-analysis';

export const NOTICE_POSTPROCESS_VERSION = 'notice-cleanup-v2';

export function splitTableRow(line: string): string[] {
  let input = line.trim();
  if (input.startsWith('|')) input = input.slice(1);
  if (/(?<!\\)\|$/.test(input)) input = input.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '\\' && input[index + 1] === '|') { cell += '|'; index += 1; }
    else if (character === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

export function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

export function trimNoticeMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const marker = (line: string) => line.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/[\[\]【】〔〕〈〉《》＜＞<>()\s]/g, '');
  const start = lines.findIndex((line) => marker(line) === '심사결과');
  const end = lines.findIndex((line, index) => index > Math.max(start, -1) && marker(line) === '안내' &&
    (/[<〈《＜]/.test(line) || /지정기간|연장가능기간|개인정보|심사청구료/.test(lines.slice(index + 1, index + 10).join(' '))));
  return lines.slice(start >= 0 ? start : 0, end >= 0 ? end : undefined).join('\n').trim();
}

/** Join physical line wraps only. Never guess which column an absent cell belonged to. */
export function normalizeNoticeMarkdown(markdown: string): { markdown: string; warnings: string[] } {
  const lines = trimNoticeMarkdown(markdown).split('\n');
  const output: string[] = [];
  const warnings: string[] = [];
  let index = 0;
  let table = 0;
  while (index < lines.length) {
    if (lines[index].includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      table += 1;
      const columns = splitTableRow(lines[index]).length;
      output.push(lines[index], lines[index + 1]);
      index += 2;
      let row = 0;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        row += 1;
        let logicalRow = lines[index++].trim();
        while (!/(?<!\\)\|$/.test(logicalRow) && index < lines.length && lines[index].trim() && !lines[index].trim().startsWith('|') && !/^#{1,6}\s/.test(lines[index])) {
          logicalRow += `<br/>${lines[index++].trim()}`;
        }
        const count = splitTableRow(logicalRow).length;
        if (count !== columns) warnings.push(`표 ${table}의 ${row}행: ${columns}개 열 중 ${count}개 셀이 추출되었습니다. 열 대응은 PDF 원문에서 확인해 주세요.`);
        output.push(logicalRow);
      }
    } else output.push(lines[index++]);
  }
  return { markdown: output.join('\n').trim(), warnings };
}

const GUIDANCE = /지정기간\s*연장|기간\s*연장\s*신청|연장가능기간|제출\s*(?:기한|기간)|의견서\s*(?:또는|및|또는\/및).*제출|(?:문서|서류)\s*제출.*개인정보|개인정보.*(?:기재|주의|유의|제출)|심사청구료.*(?:반환|환급)|별지\s*제?\s*\d+\s*호\s*서식|전자\s*출원|문의\s*(?:처|전화)|특허청\s*홈페이지|소명서를\s*첨부|서류\s*제출\s*요령/iu;

export function stripGuidanceFromSummary(value: NoticeSummary): NoticeSummary {
  const strings = (items: unknown) => Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === 'string' && !!item.trim() && !GUIDANCE.test(item)).map((item) => item.trim()))] : [];
  const numbers = (items: unknown) => Array.isArray(items) ? [...new Set(items.map(Number).filter((number) => Number.isInteger(number) && number > 0))].sort((a, b) => a - b) : [];
  return {
    oneLine: typeof value.oneLine === 'string' && !GUIDANCE.test(value.oneLine) ? value.oneLine.trim() : '',
    rejectionGrounds: Array.isArray(value.rejectionGrounds) ? value.rejectionGrounds.filter((ground) => ground && typeof ground.provision === 'string').map((ground) => ({
      provision: ground.provision.trim(), claimNumbers: numbers(ground.claimNumbers),
      reason: typeof ground.reason === 'string' && !GUIDANCE.test(ground.reason) ? ground.reason.trim() : '',
    })) : [],
    allowableClaims: numbers(value.allowableClaims),
    keyIssues: strings(value.keyIssues), affectedClaims: strings(value.affectedClaims), citedReferences: strings(value.citedReferences),
    // This is a substantive review summary, not a deadline/task reminder.
    deadlines: [], requiredActions: strings(value.requiredActions), cautions: strings(value.cautions),
  };
}
