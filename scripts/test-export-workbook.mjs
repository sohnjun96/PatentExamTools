import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { LITERATURE_REPORT_MAX_LENGTH } from '../app/lib/evaluation.ts';

const require = createRequire(import.meta.url);
let source = await readFile(new URL('../app/lib/export-workbook.ts', import.meta.url), 'utf8');
source = source.replace("import { chooseSaveFile, writeChosenFile } from './save-file';", 'const chooseSaveFile = async () => null; const writeChosenFile = async () => null;');
source = source.replace("import('jszip')", `import(${JSON.stringify(pathToFileURL(require.resolve('jszip')).href)})`);
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createWorkbookBlob, exportWorkbook } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const sheets = [
  { name: 'AI 검색 결과 평가', rows: [['출원번호', '문헌번호', '점수', '비고'], ['10-2020-0000001', '00123', 0, '=HYPERLINK("bad")'], ['10-2020-0000002', 'KR1020220000001A', null, '한글 & < > " \'\n메모']] },
  { name: 'AI 검색 결과 평가', rows: [['동명 시트'], ['두 번째']] },
  { name: '빈 월', rows: [['대상', '평균'], [0, null]] },
];
const blob = await createWorkbookBlob(sheets);
assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
const zip = await JSZip.loadAsync(await blob.arrayBuffer());
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const workbook = parser.parse(await zip.file('xl/workbook.xml').async('string'));
assert.deepEqual(workbook.workbook.sheets.sheet.map(sheet => sheet['@_name']), ['AI 검색 결과 평가', 'AI 검색 결과 평가 2', '빈 월']);
const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
assert(!sheetXml.includes('<f>'), 'user input must never become a formula');
const worksheet = parser.parse(sheetXml).worksheet;
assert.equal(worksheet.sheetData.row[1].c[1].is.t['#text'], '00123', 'leading zero identifiers are text');
assert.equal(worksheet.sheetData.row[1].c[2].v, '0', 'actual zero stays numeric');
assert.equal(worksheet.sheetData.row[1].c[3].is.t['#text'], '=HYPERLINK("bad")');
assert.equal(worksheet.sheetData.row[2].c[3].is.t['#text'], '한글 & < > " \'\n메모');
assert.equal(worksheet.sheetViews.sheetView.pane['@_state'], 'frozen');
assert.equal(worksheet.autoFilter['@_ref'], 'A1:D3');
assert.equal(await exportWorkbook('cancel.xlsx', sheets), null, 'cancel skips generating/saving file');
const maximumReport = '가'.repeat(LITERATURE_REPORT_MAX_LENGTH);
assert(maximumReport.length <= 32767, 'The report limit must fit Excel\'s single cell text limit.');
const reportBlob = await createWorkbookBlob([{ name: '선행기술 보고서', rows: [['보고서 (마크다운)'], [maximumReport]] }]);
const reportZip = await JSZip.loadAsync(await reportBlob.arrayBuffer());
const reportSheet = parser.parse(await reportZip.file('xl/worksheets/sheet1.xml').async('string')).worksheet;
assert.equal(reportSheet.sheetData.row[1].c.is.t['#text'], maximumReport, 'A maximum-length Korean report must survive XLSX export without truncation.');
console.log('Workbook tests passed: real XLSX structure, sheet names, identifiers, zero/null, formula safety, Unicode, cancel.');
