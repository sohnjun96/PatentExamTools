export type DocumentNumberType = 'application' | 'publication' | 'registration';
export type DocumentKind = 'publication' | 'registration';
export type DocumentRow = {
  id: string;
  original: string;
  canonical: string;
  key: string;
  classification: 'ready' | 'foreign' | 'invalid' | 'needs-type' | 'duplicate';
  detail: string;
};
export type ArchiveStage = 'idle' | 'choosing' | 'collecting' | 'packing' | 'saving';
export const numberTypeLabels: Record<DocumentNumberType, string> = { application: '출원번호', publication: '공개번호', registration: '등록번호' };
export const documentKindLabels: Record<DocumentKind, string> = { publication: '공개공보', registration: '등록공보' };

/** Preserve display text while using one normalized identity for requests and filenames. */
export function classifyDocumentRows(input: string, numberType: DocumentNumberType | ''): DocumentRow[] {
  const seen = new Map<string, number>();
  return input.split(/[\n,;\t]+/).map(value => value.trim()).filter(Boolean).map((original, index) => {
    const raw = original.toUpperCase();
    const country = raw.match(/^([A-Z]{2})[\s-]*\d/);
    const base = { id: `row-${index}`, original, canonical: '', key: `row-${index}` };
    if (country && country[1] !== 'KR') return { ...base, classification: 'foreign', detail: '문헌 검색에서 해외 원문을 확인해 주세요.' };
    if (!/^(?:KR\s*)?(?:10|20)[\d\s-]+(?:[ABUY]\d?)?$/i.test(raw)) return { ...base, classification: 'invalid', detail: '국내 문헌번호 형식을 확인해 주세요.' };
    if (!numberType) return { ...base, classification: 'needs-type', detail: '출원번호·공개번호·등록번호 중 입력한 종류를 선택해 주세요.' };
    const kindCode = raw.match(/([ABUY])\d?$/)?.[1];
    if (kindCode && (numberType === 'application' || (numberType === 'publication' && !['A', 'U'].includes(kindCode)) || (numberType === 'registration' && !['B', 'Y'].includes(kindCode)))) {
      return { ...base, classification: 'invalid', detail: '문헌의 공보 기호와 선택한 번호 종류가 다릅니다. 번호 종류를 확인해 주세요.' };
    }
    let canonical = raw.replace(/^KR\s*/, '').replace(/[ABUY]\d?$/, '').replace(/[\s-]/g, '');
    if (numberType === 'registration' && /^(10|20)\d{7}$/.test(canonical)) canonical += '0000';
    const valid = numberType === 'registration' ? /^(10|20)\d{7}0000$/.test(canonical) : /^(10|20)\d{11}$/.test(canonical);
    if (!valid) return { ...base, classification: 'invalid', detail: numberType === 'registration' ? '등록번호를 확인해 주세요. 예: 10-2345678' : `${numberTypeLabels[numberType]} 13자리를 확인해 주세요. 공백과 붙임표는 사용할 수 있습니다.` };
    const key = `${numberType}:${canonical}`;
    const previous = seen.get(key);
    if (previous !== undefined) return { ...base, canonical, key, classification: 'duplicate', detail: `${previous + 1}번째 문헌과 같은 번호입니다. 한 번만 조회합니다.` };
    seen.set(key, index);
    return { ...base, canonical, key, classification: 'ready', detail: '' };
  });
}

export function documentFilename(row: Pick<DocumentRow, 'canonical'>, numberType: DocumentNumberType, kind: DocumentKind) {
  if (!/^\d{13}$/.test(row.canonical)) throw new Error('유효한 문헌번호가 없습니다.');
  return `${numberTypeLabels[numberType]}_${row.canonical}_${documentKindLabels[kind]}.pdf`;
}

export class DocumentTaskCancelled extends Error {
  constructor() { super('PDF 수집을 중단했습니다. ZIP 파일을 저장하지 않았습니다.'); this.name = 'DocumentTaskCancelled'; }
}
export class DocumentDownloadError extends Error {
  constructor(message: string) { super(message); this.name = 'DocumentDownloadError'; }
}
export function ensureDocumentTaskActive(signal: AbortSignal) { if (signal.aborted) throw new DocumentTaskCancelled(); }
export function canCancelArchive(stage: ArchiveStage) { return stage === 'collecting' || stage === 'packing'; }

/** A cancellation while packing must never reach the save operation. Saving is a separate final stage. */
export async function packAndSaveArchive<T>({ signal, pack, save, onStage }: {
  signal: AbortSignal;
  pack: (onProgress: () => void) => Promise<Blob>;
  save: (blob: Blob) => Promise<T>;
  onStage: (stage: ArchiveStage) => void;
}) {
  ensureDocumentTaskActive(signal);
  onStage('packing');
  const blob = await pack(() => ensureDocumentTaskActive(signal));
  ensureDocumentTaskActive(signal);
  onStage('saving');
  return save(blob);
}

export function documentErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (error instanceof DocumentTaskCancelled) return error.message;
  if (error instanceof DocumentDownloadError) return error.message;
  if (name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message)) return 'PDF를 불러오는 데 시간이 오래 걸립니다. 잠시 후 다시 시도해 주세요.';
  if (name === 'AbortError') return 'PDF 불러오기를 중단했습니다. 다시 받으려면 PDF 받기를 눌러 주세요.';
  if (/\(429\)/.test(message)) return '원문 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (/Worker Secret|KIPRIS_API_KEY|API 이용 권한|연결 설정/.test(message)) return '원문 조회 연결을 확인해야 합니다. 관리자에게 KIPRIS Plus 연결 설정을 요청해 주세요.';
  if (/경로|정상적인 PDF|다른 형식|응답이 비어|출원번호가 요청과 일치/.test(message)) return 'PDF 원문을 확인할 수 없습니다. 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.';
  if (/허용 크기|32MB/.test(message)) return '원문 파일이 내려받을 수 있는 크기를 넘었습니다. 문헌 검색에서 원문을 확인해 주세요.';
  if (/[가-힣]/.test(message) && /확인해 주세요|선택해 주세요|요청해 주세요|다시 시도해 주세요|저장하지 않았습니다|저장할 수 없습니다/.test(message) && !/Cloudflare|ServiceKey|accessKey|\.jsp|\bHTTP\b|https?:\/\//i.test(message)) return message;
  return 'PDF를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.';
}

/** Keep server diagnostics out of user copy while preserving distinct recovery actions. */
export function documentResponseMessage(status: number, serverMessage: string, kind: DocumentKind) {
  if (status === 400) {
    if (/등록번호 형식/.test(serverMessage)) return '등록번호 형식을 확인해 주세요. 예: 10-2345678';
    if (/13자리/.test(serverMessage)) return '출원번호·공개번호는 숫자 13자리입니다. 문헌번호와 선택한 종류를 확인해 주세요.';
    if (/공개전문|등록공고 전문/.test(serverMessage)) return '받을 공보 종류를 선택해 주세요.';
    return '문헌번호와 입력 번호 종류를 확인한 뒤 다시 받아 주세요.';
  }
  if (status === 401 || status === 403) return '원문을 조회할 권한이 없습니다. 관리자에게 KIPRIS Plus 연결 권한 확인을 요청해 주세요.';
  if (status === 404) {
    if (/일치하는 출원/.test(serverMessage)) return '문헌번호에 맞는 출원을 찾지 못했습니다. 번호와 입력 번호 종류를 확인해 주세요.';
    return `선택한 ${documentKindLabels[kind]} PDF가 제공되지 않습니다. 문헌번호를 확인하거나 문헌 검색에서 원문을 확인해 주세요.`;
  }
  if (status === 408 || status === 504) return 'PDF 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
  if (status === 413) return '원문 파일이 내려받을 수 있는 크기를 넘었습니다. 문헌 검색에서 원문을 확인해 주세요.';
  if (status === 429) return '원문 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (status === 503) return '원문 조회 연결이 준비되지 않았습니다. 관리자에게 KIPRIS Plus 연결 설정을 요청해 주세요.';
  return documentErrorMessage(new Error(serverMessage));
}
