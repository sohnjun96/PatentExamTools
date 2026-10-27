import { chooseSaveFile, writeChosenFile } from './save-file';

export type ExportSheet = { name: string; rows: (string | number | null)[][] };
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xml = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
function column(index: number): string {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}

// Standard OOXML; identifiers and user text are inline strings, never formulas.
export async function createWorkbookBlob(sheets: ExportSheet[]) {
  if (!sheets.length) throw new Error('저장할 시트가 없습니다.');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const names = new Set<string>();
  const normalized = sheets.map((sheet, index) => {
    const base = sheet.name.replace(/[\\/*?:\[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 27) || `시트${index + 1}`;
    let name = base;
    for (let suffix = 2; names.has(name); suffix++) name = `${base} ${suffix}`;
    names.add(name);
    return { ...sheet, name };
  });
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${normalized.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${normalized.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${normalized.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${normalized.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172E46"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" numFmtId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" numFmtId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  normalized.forEach((sheet, index) => {
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    const end = `${column(width - 1)}${Math.max(1, sheet.rows.length)}`;
    const cols = Array.from({ length: width }, (_, col) => {
      const longest = Math.max(...sheet.rows.map((row) => [...String(row[col] ?? '')].reduce((length, c) => length + (c.charCodeAt(0) > 255 ? 2 : 1), 0)), 10);
      return `<col min="${col + 1}" max="${col + 1}" width="${Math.min(55, longest + 3)}" customWidth="1"/>`;
    }).join('');
    const rows = sheet.rows.map((row, r) => `<row r="${r + 1}"${r === 0 ? ' ht="28" customHeight="1"' : ''}>${row.map((value, c) => {
      const ref = `${column(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      return typeof value === 'number' && Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('')}</row>`).join('');
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData>${sheet.rows.length ? `<autoFilter ref="A1:${end}"/>` : ''}</worksheet>`);
  });
  return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
}

export async function exportWorkbook(filename: string, sheets: ExportSheet[]): Promise<string | null> {
  const destination = await chooseSaveFile(filename, MIME, 'xlsx');
  if (!destination) return null;
  return writeChosenFile(destination, await createWorkbookBlob(sheets));
}
