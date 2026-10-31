export type Role = 'admin' | 'examiner' | 'ai';
export type EvaluationUser = { id: string; name: string; bureau: string; division: string; roles: Role[]; active: boolean };
export type EvaluationGroup = { id: string; name: string; deletedAt?: string };
export type InvestigationMethod = { id: string; name: string; kind: 'ai' | 'baseline'; active: boolean; deletedAt?: string };
export const DEFAULT_AI_METHODS: readonly InvestigationMethod[] = [
  { id: 'chatgpt', name: 'ChatGPT', kind: 'ai', active: true },
  { id: 'claude', name: '클로드', kind: 'ai', active: true },
  { id: 'gemini', name: 'Gemini', kind: 'ai', active: false },
  { id: 'perplexity', name: '퍼플렉시티', kind: 'ai', active: false },
  { id: 'grok', name: 'Grok', kind: 'ai', active: false },
];
const DEFAULT_AI_ALIASES: Record<string, readonly string[]> = {
  chatgpt: ['chatgpt'], claude: ['클로드', 'claude'], gemini: ['gemini', '제미나이'],
  perplexity: ['퍼플렉시티', 'perplexity'], grok: ['grok', '그록'],
};

/** Backfill a legacy catalog without replacing IDs, edits, or deletion markers. */
export function withDefaultAIMethods(methods: InvestigationMethod[]) {
  const missing = DEFAULT_AI_METHODS.filter((preset) => !methods.some((method) => method.id === preset.id
    || method.kind === 'ai' && DEFAULT_AI_ALIASES[preset.id].includes(method.name.trim().toLowerCase())));
  return missing.length ? [...methods, ...missing.map((method) => ({ ...method }))] : methods;
}
export type GroupMembership = { userId: string; groupId: string };
export type MonthParticipant = GroupMembership;
export type AIAssignment = { groupId: string; methodId: string; userId: string };
export type Personnel = { memberships: GroupMembership[]; assignments: AIAssignment[] };
export const OPERATION_STAGES = [
  { id: 'selection', label: '대상 건 선정', deadline: 'selectionDeadline' },
  { id: 'result', label: 'AI 검색 결과 입력', deadline: 'resultDeadline' },
  { id: 'evaluation', label: '평가', deadline: 'evaluationDeadline' },
] as const;
export type OperationStage = typeof OPERATION_STAGES[number]['id'];
export type OperationStageStatus = 'pending' | 'running' | 'stopped' | 'closed';
export const OPERATION_STAGE_STATUS_LABELS: Record<OperationStageStatus, string> = { pending: '시작 전', running: '진행', stopped: '중지', closed: '마감' };
export type OperationMonth = {
  // Legacy month-level allocations are retained for migration/audit only.
  // methodIds is retained for old records; assignments and published results determine AI scope.
  id: string; methodIds: string[]; participants: MonthParticipant[]; assignments: AIAssignment[];
  closed: boolean; selectionDeadline: string; resultDeadline: string; evaluationDeadline: string;
  /** Legacy stored field, ignored by selection and removed on settings saves. */
  caseLimit?: number;
  confirmedUserIds: string[];
  stages?: Partial<Record<OperationStage, OperationStageStatus>>;
  defaultDeadlineVersion?: 1;
  defaultStageVersion?: 1;
  archived?: boolean;
};
export type SelectionRow = { applicationNumber: string; cpc: string };
export type EvaluationCase = SelectionRow & {
  id: string; monthId: string; examinerId: string; examinerName: string; bureau: string; division: string;
  groupId: string; groupName: string; status: 'draft' | 'confirmed' | 'cancelled';
};
export type LiteratureDocument = {
  kind: 'patent' | 'non-patent' | 'legacy'; number: string;
  authors?: string; title?: string; publication?: string; publicationPlace?: string;
  publisher?: string; publicationDate?: string; volume?: string; issue?: string; pages?: string;
  acquiredDate?: string; dateNote?: string; url?: string; reportMarkdown?: string;
};
export type AIResult = {
  id: string; caseId: string; methodId: string; draftDocuments: string[]; draftAuthorId: string;
  publishedDocuments: string[]; publishedVersion: number; publishedBy: { id: string; name: string } | null;
  publishedAt: string | null;
  draftDocumentDetails?: LiteratureDocument[]; publishedDocumentDetails?: LiteratureDocument[];
};
export type DocumentEvaluation = { number: string; score: number | null; cited: 'O' | 'X' | null; note: string };
export type MethodEvaluation = { caseId: string; methodId: string; version: number; documents: DocumentEvaluation[]; updatedAt: string };
export type RankValue = 1 | 2 | 3 | 'unranked' | 'excluded' | 'incomparable' | null;
export type QualityRanking = { caseId: string; versions: Record<string, number>; values: Record<string, RankValue>; updatedAt: string; overallComment?: string };
export type EvaluationNotice = { markdown: string; updatedAt: string };
export const NOTICE_MAX_LENGTH = 20_000;
export const LITERATURE_MAX_LENGTH = 2_000;
export const LITERATURE_REPORT_MAX_LENGTH = 30_000;
export const OVERALL_COMMENT_MAX_LENGTH = 4_000;
export type EvaluationState = {
  schemaVersion: 1; users: EvaluationUser[]; groups: EvaluationGroup[]; methods: InvestigationMethod[];
  /** One-time catalog backfill; later administrator edits remain authoritative. */
  defaultAiCatalogVersion?: 1;
  defaultGroupVersion?: 1;
  months: OperationMonth[]; cases: EvaluationCase[]; results: AIResult[]; evaluations: MethodEvaluation[];
  rankings: QualityRanking[]; isDemo: boolean; notice?: EvaluationNotice | null; personnel?: Personnel;
};
export type EvaluationActor = { admin?: boolean; userId?: string };
export type EvaluationAction =
  | { type: 'saveNotice'; markdown: string }
  | { type: 'saveUser'; user: Omit<EvaluationUser, 'id'> & { id?: string } }
  | { type: 'saveExaminer'; user: Omit<EvaluationUser, 'id'> & { id?: string }; groupId: string; responsibilities: { groupId: string; methodId: string }[] }
  | { type: 'saveGroup'; group: { id?: string; name: string } }
  | { type: 'deleteGroup'; groupId: string }
  | { type: 'saveMethod'; method: Omit<InvestigationMethod, 'id'> & { id?: string } }
  | { type: 'deleteMethod'; methodId: string }
  | { type: 'savePersonnel'; personnel: Personnel }
  | { type: 'saveMonth'; month: Omit<OperationMonth, 'confirmedUserIds'> & { confirmedUserIds?: string[] } }
  | { type: 'setMonthClosed'; monthId: string; closed: boolean }
  | { type: 'setMonthStage'; monthId: string; stage: OperationStage; status: OperationStageStatus }
  | { type: 'saveSelection'; monthId: string; rows: SelectionRow[]; confirm: boolean }
  | { type: 'adminAddCase'; monthId: string; examinerId: string; row: SelectionRow }
  | { type: 'cancelCase'; caseId: string }
  | { type: 'saveResult'; caseId: string; methodId: string; documents: string[]; documentDetails?: LiteratureDocument[]; publish: boolean }
  | { type: 'saveEvaluation'; caseId: string; evaluations: { methodId: string; version: number; documents: DocumentEvaluation[] }[]; rankings: Record<string, RankValue>; versions: Record<string, number>; overallComment?: string }
  | { type: 'loadDemo' };

export class EvaluationError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const fail = (message: string, status = 400): never => { throw new EvaluationError(message, status); };
const uid = () => crypto.randomUUID();
const identity = (value: string) => value.replace(/[\s\-.,]/g, '').toUpperCase();
/** Only the original generated placeholders have no real patent documents. */
export function isDemoApplicationNumber(value: string) {
  return /^10202490000[01]\d$/.test(identity(value));
}
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max ? value.trim() : fail('입력한 텍스트의 형식이나 길이를 확인해 주세요.');
const requireAdmin = (actor: EvaluationActor) => { if (!actor.admin) fail('관리자용 진입점에서 처리해 주세요.', 403); };
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.map(identity).sort().every((value, i) => value === b.map(identity).sort()[i]);

const literatureFields = ['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote', 'url', 'reportMarkdown'] as const;
const patentIdentifier = /^(?:KR|US|WO|EP|JP|CN|DE|GB|FR|AU|CA|TW|IN|RU|ES|IT|CH|AT|SE|FI|NL|BE|DK|NO|NZ|ZA|BR|MX|IL|SG|HK|MY|TH|ID|PH|VN|AR|CL|CO|PE|PT|PL|CZ|HU|RO|BG|GR|TR|UA|SU|EA|AP|OA|GC)(?:D|RE|PP)?\d{4,16}[A-Z]\d{0,2}$/;
const literatureControls = /[\u0000-\u001f\u007f-\u009f]/;

/** A citation is also the stable association used by existing document evaluations. */
function nonPatentCitation(document: LiteratureDocument) {
  const imprint = [document.publicationPlace, document.publisher].filter(Boolean).join(' : ');
  const date = document.publicationDate || (document.acquiredDate ? `입수일 ${document.acquiredDate}` : '');
  return [document.authors, document.title, document.publication, imprint, date, document.volume,
    document.issue, document.pages, document.acquiredDate && !document.publicationDate ? document.dateNote : ''].filter((part): part is string => Boolean(part))
    .reduce((citation, part) => citation ? `${citation}${/[.!?。]$/.test(citation) ? ' ' : '. '}${part}` : part, '');
}

/** Validate every record before exposing any imported or saved document. */
export function normalizeLiteratureDocuments(values: unknown, allowEmpty = false): LiteratureDocument[] {
  const entries: unknown[] = Array.isArray(values) && values.length <= 7 ? values : fail('출원 1건 × AI 방식 1개당 최대 7문헌을 입력할 수 있습니다.');
  const documents = entries.map((value, index) => {
    const label = `${index + 1}번째 문헌`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}은 문헌 필드를 가진 객체로 입력해 주세요.`);
    const entry = value as Record<string, unknown>;
    if (typeof entry.kind !== 'string' || !['patent', 'non-patent', 'legacy'].includes(entry.kind)) fail(`${label} 종류는 patent 또는 non-patent로 입력해 주세요.`);
    if (Object.keys(entry).some((field) => field !== 'kind' && field !== 'number' && !(literatureFields as readonly string[]).includes(field))) fail(`${label}에 지원하지 않는 필드가 있습니다. 입력 예시의 필드명을 확인해 주세요.`);
    const document: LiteratureDocument = { kind: entry.kind as LiteratureDocument['kind'], number: '' };
    for (const field of literatureFields) {
      const raw = entry[field];
      if (raw === undefined) continue;
      const limit = field === 'reportMarkdown' ? LITERATURE_REPORT_MAX_LENGTH : LITERATURE_MAX_LENGTH;
      const fieldValue = typeof raw === 'string' && raw.length <= limit ? raw.trim() : fail(`${label}의 ${field} 필드는 ${limit.toLocaleString('ko-KR')}자 이내의 텍스트로 입력해 주세요.`);
      if (field === 'url' && typeof raw === 'string' && literatureControls.test(raw)) fail(`${label}의 URL에 제어 문자를 사용할 수 없습니다.`);
      if (fieldValue) document[field] = fieldValue;
    }
    if (entry.number !== undefined && (typeof entry.number !== 'string' || entry.number.length > LITERATURE_MAX_LENGTH)) fail(`${label}의 문헌번호·서지정보는 2,000자 이내의 텍스트로 입력해 주세요.`);
    if (document.kind === 'patent') {
      const number = typeof entry.number === 'string' ? entry.number : '';
      if (literatureControls.test(number)) fail(`${label}의 특허번호 형식을 확인해 주세요.`);
      document.number = number.toUpperCase().replace(/[\s,./-]/g, '');
      if (!patentIdentifier.test(document.number)) fail(`${label}의 특허번호는 KR20100001234A처럼 국가코드·번호·공보종류 기호를 포함해 주세요.`);
      if (literatureFields.some((field) => field !== 'url' && field !== 'reportMarkdown' && Boolean(document[field]))) fail(`${label}의 특허 문헌은 특허번호·URL·보고서만 입력해 주세요.`);
    } else if (document.kind === 'non-patent') {
      if (!document.title) fail(`${label}의 논문명·문서명(title)을 입력해 주세요.`);
      document.number = nonPatentCitation(document);
    } else {
      document.number = typeof entry.number === 'string' ? entry.number.trim() : '';
      if (!document.number) fail(`${label}의 문헌번호·서지정보를 입력해 주세요.`);
    }
    if (document.number.length > LITERATURE_MAX_LENGTH) fail(`${label}의 문헌번호·서지정보는 2,000자 이내로 입력해 주세요.`);
    if (document.url) {
      if (!/^https?:\/\/\S+$/i.test(document.url) || literatureControls.test(document.url)) fail(`${label}의 URL은 http:// 또는 https://로 시작하는 웹 주소를 입력해 주세요.`);
      let url: URL;
      try { url = new URL(document.url); } catch { return fail(`${label}의 URL 형식을 확인해 주세요.`); }
      if (!url.hostname || url.username || url.password) fail(`${label}의 URL은 로그인 정보가 없는 웹 주소를 입력해 주세요.`);
    }
    return document;
  });
  if (!allowEmpty && documents.length === 0) fail('입력 완료하려면 문헌을 한 건 이상 입력해 주세요.');
  if (new Set(documents.map((document) => identity(document.number))).size !== documents.length) fail('같은 AI 결과 안에 중복 문헌이 있습니다.');
  return documents;
}

/** Accept the exact JSON response, including the single code block commonly returned by AI. */
export function parseLiteratureImport(input: string): LiteratureDocument[] {
  if (typeof input !== 'string' || !input.trim()) fail('자동 입력할 JSON 결과를 붙여 넣어 주세요.');
  if (input.length > 600_000) fail('자동 입력 결과가 너무 큽니다. 최대 7문헌, 보고서별 30,000자 이내로 나누어 주세요.');
  const source = input.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { return fail('JSON 형식을 확인해 주세요. 결과 객체 또는 배열만 붙여 넣고, 보고서의 줄바꿈은 \\n으로 작성해 주세요.'); }
  if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'documents') || Object.keys(parsed).some((key) => key !== 'documents'))) fail('자동 입력 결과는 {"documents": [...]} 형식으로 입력해 주세요.');
  const values = Array.isArray(parsed) ? parsed : (parsed as { documents: unknown }).documents;
  if (Array.isArray(values) && values.some((value) => value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'legacy')) fail('자동 입력 문헌 종류는 patent 또는 non-patent로 입력해 주세요.');
  return normalizeLiteratureDocuments(values);
}

/** Old plain citations remain readable without rewriting stored evaluation keys. */
export function literatureDetailsFor(result: AIResult | undefined, scope: 'draft' | 'published' = 'published'): LiteratureDocument[] {
  const numbers = (scope === 'draft' ? result?.draftDocuments : result?.publishedDocuments) ?? [];
  const details = (scope === 'draft' ? result?.draftDocumentDetails : result?.publishedDocumentDetails) ?? [];
  return numbers.map((number) => details.find((document) => document.number === number) ?? { kind: 'legacy', number });
}

function sameLiteratureDetails(previous: LiteratureDocument[], next: LiteratureDocument[]) {
  const canonical = (documents: LiteratureDocument[]) => documents.map((document) => JSON.stringify([
    identity(document.number), document.kind,
    ...literatureFields.map((field) => document[field] ?? ''),
  ])).sort();
  const a = canonical(previous); const b = canonical(next);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export const LITERATURE_REPORT_TABLE_TEMPLATE = '| 청구항 구성 | 선행문헌 대응 내용 | 근거 위치 |\n| --- | --- | --- |\n| 구성요소 1 | 대응 내용 | 문단·페이지 |\n| 구성요소 2 | 대응 내용 | 문단·페이지 |';

export const LITERATURE_IMPORT_EXAMPLE = JSON.stringify({ documents: [
  { kind: 'patent', number: 'KR20100001234A', url: 'https://example.com/patent', reportMarkdown: `## 관련성\n핵심 구성과 대응 부분을 설명합니다.\n\n## 구성 대비표\n\n${LITERATURE_REPORT_TABLE_TEMPLATE}` },
  { kind: 'non-patent', authors: '저자명', title: '논문명 또는 문서명', publication: '간행물명', publicationPlace: '발행장소', publisher: '발행처', publicationDate: '2020-03', volume: '제10권', issue: '제2호', pages: 'pp 101-110', acquiredDate: '', dateNote: '', url: 'https://example.com/paper', reportMarkdown: '## 관련성\n대상 발명과의 공통점과 차이점을 설명합니다.\n\n## 근거\n페이지·절 번호를 기재합니다.' },
] }, null, 2);

export const LITERATURE_FORMAT_PROMPT = `검색 결과는 설명 없이 다음 구조의 유효한 JSON 객체 하나로 출력하세요: {"documents":[...]}. 문헌은 최대 7건, 중복 없이 반환합니다.
특허: {"kind":"patent","number":"KR20100001234A","url":"https://...","reportMarkdown":"마크다운 보고서"}. number는 공백·하이픈 없이 국가코드+번호+공보종류 기호로 표기합니다.
비특허: {"kind":"non-patent","authors":"저자명","title":"논문명·문서명","publication":"간행물명","publicationPlace":"발행장소","publisher":"발행처","publicationDate":"발행연월일","volume":"제10권 또는 Vol. 10","issue":"제2호 또는 No. 2","pages":"pp 101-110","acquiredDate":"입수일","dateNote":"발행일 불명 등 입수일 기재 사유","url":"https://...","reportMarkdown":"마크다운 보고서"}.
비특허의 title은 필수이며 확인되지 않은 선택 필드는 빈 문자열로 두고 추측하지 마세요. 발행연월일은 간행물에 기재된 범위까지만 쓰고(예: 2020-03), 발행일이 불명하여 입수일을 대신 쓰면 acquiredDate와 dateNote에 그 사유를 기재하세요. 페이지는 통권페이지를 우선하고 불명하면 해당 호 페이지 앞에 pp를 붙이세요. 외국어 간행물은 원어 표기를 유지하세요.
각 문헌의 url은 확인한 원문·공보의 HTTP(S) 주소, reportMarkdown은 관련성·구성 대응·차이점과 청구항/문단/페이지 등 확인 가능한 근거를 담은 마크다운 텍스트로 작성하세요(최대 30,000자). 구성 대응은 GFM 마크다운 표로 작성할 수 있습니다. 예: | 청구항 구성 | 선행문헌 대응 내용 | 근거 위치 | 다음 줄에 | --- | --- | --- | 구분선을 넣고 각 구성의 행을 작성하세요. 표 앞뒤에는 빈 줄을 넣고 표를 코드 블록으로 감싸지 마세요. JSON 문자열 안의 줄바꿈은 \\n, 큰따옴표는 \\"로 이스케이프하세요.`;

export function currentOperationMonth(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now).replace('/', '-');
}

function newMonthStageStatuses(): Record<OperationStage, OperationStageStatus> {
  return { selection: 'pending', result: 'pending', evaluation: 'pending' };
}

export function emptyMonth(id: string): OperationMonth {
  return { id, methodIds: [], participants: [], assignments: [], closed: false, ...defaultOperationDeadlines(id), defaultDeadlineVersion: 1, defaultStageVersion: 1, confirmedUserIds: [], stages: newMonthStageStatuses() };
}

export function defaultOperationDeadlines(id: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(id)) return { selectionDeadline: '', resultDeadline: '', evaluationDeadline: '' };
  const firstDay = new Date(`${id}-01T00:00:00.000Z`);
  const friday = 1 + (5 - firstDay.getUTCDay() + 7) % 7;
  const date = (week: number) => `${id}-${String(friday + week * 7).padStart(2, '0')}`;
  return { selectionDeadline: date(0), resultDeadline: date(1), evaluationDeadline: date(2) };
}

export const DEFAULT_OPERATION_MONTHS = ['2026-11', '2026-12', '2027-01'] as const;
const ARCHIVED_OPERATION_MONTHS = new Set(['2026-10']);
const defaultGroups = (): EvaluationGroup[] => [{ id: 'group-1', name: '그룹 1' }, { id: 'group-2', name: '그룹 2' }];

export function listedOperationMonths(months: OperationMonth[]) {
  return months.filter(month => !month.archived);
}

export function withDefaultOperationMonths(state: EvaluationState): EvaluationState {
  const missing = DEFAULT_OPERATION_MONTHS.filter((id) => !state.months.some((month) => month.id === id));
  const needsDefaults = state.months.some(month => month.defaultDeadlineVersion !== 1 || month.defaultStageVersion !== 1 || (ARCHIVED_OPERATION_MONTHS.has(month.id) && (!month.archived || !month.closed)));
  if (!missing.length && !needsDefaults) return state;
  const months = state.months.map(month => {
    const defaults = defaultOperationDeadlines(month.id);
    const oldUnusedDefaults = month.defaultStageVersion !== 1 && !month.closed && !state.cases.some(item => item.monthId === month.id)
      && (DEFAULT_OPERATION_MONTHS as readonly string[]).includes(month.id)
      && (!month.stages || ((month.stages.selection === 'pending' || month.stages.selection === 'running')
        && month.stages.result === 'stopped' && month.stages.evaluation === 'stopped'));
    return { ...month,
      ...(month.defaultDeadlineVersion !== 1 ? { selectionDeadline: month.selectionDeadline || defaults.selectionDeadline, resultDeadline: month.resultDeadline || defaults.resultDeadline, evaluationDeadline: month.evaluationDeadline || defaults.evaluationDeadline } : {}),
      ...(oldUnusedDefaults ? { stages: newMonthStageStatuses() } : {}),
      ...(ARCHIVED_OPERATION_MONTHS.has(month.id) ? { archived: true, closed: true } : {}),
      defaultDeadlineVersion: 1 as const, defaultStageVersion: 1 as const };
  });
  return { ...state, months: [...months, ...missing.map(emptyMonth)] };
}

export function createInitialState(monthId?: string): EvaluationState {
  return { schemaVersion: 1, defaultAiCatalogVersion: 1, defaultGroupVersion: 1, users: [], groups: defaultGroups(), methods: [
    ...DEFAULT_AI_METHODS.map((method) => ({ ...method })),
    { id: 'baseline', name: '선행기술조사', kind: 'baseline', active: true },
  ], months: (monthId ? [monthId] : DEFAULT_OPERATION_MONTHS).map(emptyMonth), cases: [], results: [], evaluations: [], rankings: [], isDemo: false, notice: null, personnel: { memberships: [], assignments: [] } };
}

/** Existing records keep their snapshots; newest month wins only for each shared allocation. */
export function personnelOf(state: EvaluationState): Personnel {
  if (state.personnel) return state.personnel;
  const memberships = new Map<string, GroupMembership>();
  const assignments = new Map<string, AIAssignment>();
  for (const month of [...state.months].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const entry of month.participants ?? []) memberships.set(entry.userId, { ...entry });
    for (const entry of month.assignments ?? []) assignments.set(`${entry.groupId}:${entry.methodId}`, { ...entry });
  }
  return { memberships: [...memberships.values()], assignments: [...assignments.values()] };
}

export function normalizeEvaluationState(state: EvaluationState): EvaluationState {
  if (state.defaultAiCatalogVersion !== 1) state = { ...state, defaultAiCatalogVersion: 1, methods: withDefaultAIMethods(state.methods) };
  if (state.defaultGroupVersion !== 1) state = { ...state, defaultGroupVersion: 1, groups: state.groups.length ? state.groups : defaultGroups() };
  return state.personnel ? state : { ...state, personnel: personnelOf(state) };
}

export function currentGroups(state: EvaluationState) {
  return state.groups.filter((group) => !group.deletedAt);
}

export function operationGroups(state: EvaluationState, monthId: string) {
  const historicalIds = new Set(state.cases.filter((item) => item.monthId === monthId && item.status === 'confirmed').map((item) => item.groupId));
  return state.groups.filter((group) => !group.deletedAt || historicalIds.has(group.id));
}

export function preferredOperationMonth(months: OperationMonth[], current = currentOperationMonth()): string {
  const sorted = listedOperationMonths(months).sort((a, b) => b.id.localeCompare(a.id));
  const running = sorted.filter(month => operationMonthStatus(month) === 'running');
  return running.find(month => month.id === current)?.id
    ?? running.find(month => month.id < current)?.id
    ?? [...running].reverse()[0]?.id
    ?? sorted.find(month => month.id === current && operationMonthStatus(month) === 'pending')?.id
    ?? [...sorted].reverse().find(month => month.id > current && operationMonthStatus(month) === 'pending')?.id
    ?? sorted.find(month => operationMonthStatus(month) === 'pending')?.id ?? sorted[0]?.id ?? '';
}

function monthOf(state: EvaluationState, monthId: string) {
  return state.months.find((month) => month.id === monthId) ?? fail('운영월이 없습니다.');
}

function actorUser(state: EvaluationState, actor: EvaluationActor) {
  return state.users.find((user) => user.id === actor.userId && user.active) ?? fail('활성 사용자를 선택해 주세요.', 403);
}

/** Missing statuses belong to legacy months and preserve their existing open workflow. */
export function operationStageStatus(month: OperationMonth, stage: OperationStage): OperationStageStatus {
  return month.stages?.[stage] ?? 'running';
}

export function isOperationStageOpen(month: OperationMonth, stage: OperationStage) {
  return !month.archived && !month.closed && operationStageStatus(month, stage) === 'running';
}

export const OPERATION_MONTH_STATUS_LABELS = { pending: '운영 전', running: '운영 중', closed: '운영 종료' } as const;
export function operationMonthStatus(month: OperationMonth): keyof typeof OPERATION_MONTH_STATUS_LABELS {
  if (month.archived || month.closed) return 'closed';
  if (OPERATION_STAGES.some(stage => isOperationStageOpen(month, stage.id))) return 'running';
  return OPERATION_STAGES.every(stage => operationStageStatus(month, stage.id) === 'closed') ? 'closed' : 'pending';
}

export function operationStageBlockReason(month: OperationMonth, stage: OperationStage) {
  if (month.archived) return '운영 목록에서 제외된 월입니다.';
  if (month.closed) return '마감한 운영월입니다. 관리자 재개방 후 수정할 수 있습니다.';
  const status = operationStageStatus(month, stage);
  if (status === 'running') return null;
  const label = OPERATION_STAGES.find(entry => entry.id === stage)!.label;
  if (status === 'pending') return `${label} 단계가 아직 시작되지 않았습니다. 관리자에게 진행 상태로 변경을 요청해 주세요.`;
  return `${label} 단계가 ${status === 'closed' ? '마감' : '중지'}되었습니다. 관리자에게 단계 시작을 요청해 주세요.`;
}

function editable(month: OperationMonth, stage?: OperationStage) {
  if (month.archived) fail('운영 목록에서 제외된 월입니다.', 409);
  if (month.closed) fail('마감한 운영월입니다. 관리자 재개방 후 수정할 수 있습니다.', 409);
  if (stage) {
    const reason = operationStageBlockReason(month, stage);
    if (reason) fail(reason, 409);
  }
}

export function aiMethods(state: EvaluationState, monthId: string) {
  monthOf(state, monthId);
  const caseIds = new Set(state.cases.filter((item) => item.monthId === monthId).map((item) => item.id));
  const historicalIds = new Set(state.results.filter((result) => caseIds.has(result.caseId)).map((result) => result.methodId));
  return state.methods.filter((method) => method.kind === 'ai' && (!method.deletedAt || historicalIds.has(method.id)));
}

export function caseMethods(state: EvaluationState, item: EvaluationCase) {
  const publishedIds = new Set(state.results.filter((result) => result.caseId === item.id && result.publishedVersion > 0 && result.publishedDocuments.length > 0).map((result) => result.methodId));
  return state.methods.filter((method) => method.kind === 'baseline' || method.kind === 'ai' && publishedIds.has(method.id));
}

export function assignedCaseMethods(state: EvaluationState, item: EvaluationCase) {
  const assignedIds = new Set(personnelOf(state).assignments.filter((entry) => entry.groupId === item.groupId).map((entry) => entry.methodId));
  return aiMethods(state, item.monthId).filter((method) => assignedIds.has(method.id) && (!method.deletedAt || Boolean(resultFor(state, item.id, method.id))));
}

export function resultFor(state: EvaluationState, caseId: string, methodId: string) {
  return state.results.find((result) => result.caseId === caseId && result.methodId === methodId);
}

export function canInputResult(state: EvaluationState, actor: EvaluationActor, item: EvaluationCase, methodId: string) {
  const user = state.users.find((candidate) => candidate.id === actor.userId && candidate.active && candidate.roles.includes('ai'));
  return Boolean(user && item.status === 'confirmed' && assignedCaseMethods(state, item).some((method) => method.id === methodId) && personnelOf(state).assignments.some((assignment) => assignment.groupId === item.groupId && assignment.methodId === methodId && assignment.userId === user.id));
}

export function validEvaluation(state: EvaluationState, caseId: string, methodId: string) {
  const result = resultFor(state, caseId, methodId);
  return state.evaluations.find((evaluation) => evaluation.caseId === caseId && evaluation.methodId === methodId && evaluation.version === result?.publishedVersion);
}

export function rankingIsCurrent(state: EvaluationState, item: EvaluationCase, ranking?: QualityRanking) {
  if (!ranking) return false;
  return caseMethods(state, item).filter((method) => method.kind === 'ai').every((method) => (ranking.versions[method.id] ?? 0) === resultFor(state, item.id, method.id)?.publishedVersion);
}

export function rankingComplete(state: EvaluationState, item: EvaluationCase, values: Record<string, RankValue>) {
  const available = caseMethods(state, item).filter((method) => method.kind === 'baseline' || (resultFor(state, item.id, method.id)?.publishedVersion ?? 0) > 0);
  if (!available.some((method) => method.kind === 'ai')) return false;
  if (available.some((method) => values[method.id] == null)) return false;
  const compared = available.filter((method) => values[method.id] !== 'excluded');
  if (compared.length === 0) return false;
  if (compared.length === 1) return values[compared[0].id] === 'incomparable';
  const ranks = compared.map((method) => values[method.id]).filter((value): value is 1 | 2 | 3 => typeof value === 'number').sort();
  const expected = Math.min(3, compared.length);
  return ranks.length === expected && ranks.every((value, i) => value === i + 1) && compared.every((method) => typeof values[method.id] === 'number' || (compared.length > 3 && values[method.id] === 'unranked'));
}

export function caseStatus(state: EvaluationState, item: EvaluationCase) {
  const methods = caseMethods(state, item).filter((method) => method.kind === 'ai');
  const inputComplete = methods.length > 0 && assignedCaseMethods(state, item).every((method) => (resultFor(state, item.id, method.id)?.publishedVersion ?? 0) > 0);
  const stale = methods.some((method) => {
    const evaluation = state.evaluations.find((entry) => entry.caseId === item.id && entry.methodId === method.id);
    return evaluation && evaluation.version !== resultFor(state, item.id, method.id)?.publishedVersion;
  }) || state.rankings.some((ranking) => ranking.caseId === item.id && !rankingIsCurrent(state, item, ranking));
  const allDocuments = methods.every((method) => {
    const result = resultFor(state, item.id, method.id);
    const evaluation = validEvaluation(state, item.id, method.id);
    return result && result.publishedDocuments.length > 0 && result.publishedDocuments.every((number) => evaluation?.documents.some((document) => identity(document.number) === identity(number) && document.score !== null && document.cited !== null));
  });
  const ranking = state.rankings.find((entry) => entry.caseId === item.id);
  const complete = methods.length > 0 && !stale && allDocuments && rankingIsCurrent(state, item, ranking) && rankingComplete(state, item, ranking?.values ?? {});
  const started = state.evaluations.some((entry) => entry.caseId === item.id) || Boolean(ranking);
  return { inputComplete, evaluationStatus: complete ? '평가 완료' : stale ? '재확인 필요' : started ? '평가 중' : '미평가', complete, stale };
}

function selectionRows(rows: SelectionRow[]) {
  if (!Array.isArray(rows) || rows.length > 500) fail('대상 출원 목록을 확인해 주세요.');
  const result = rows.map((row) => ({ applicationNumber: text(row.applicationNumber, 40), cpc: text(row.cpc, 100) }));
  if (result.some((row) => !/^[\d\s-]+$/.test(row.applicationNumber) || !/^(10|20)\d{11}$/.test(row.applicationNumber.replace(/[\s-]/g, '')))) fail('특허·실용신안 출원번호 13자리를 입력해 주세요. 숫자·공백·하이픈만 사용할 수 있습니다.');
  if (new Set(result.map((row) => identity(row.applicationNumber))).size !== result.length) fail('같은 선정 목록에 중복된 출원이 있습니다.');
  return result;
}

function createCase(state: EvaluationState, month: OperationMonth, user: EvaluationUser, row: SelectionRow, status: EvaluationCase['status']): EvaluationCase {
  const participant = personnelOf(state).memberships.find((entry) => entry.userId === user.id) ?? fail('심사관 관리에서 소속 그룹을 먼저 배정해 주세요.');
  const group = currentGroups(state).find((entry) => entry.id === participant.groupId) ?? fail('심사관 관리에서 소속 그룹을 다시 배정해 주세요.');
  return { ...row, id: uid(), monthId: month.id, examinerId: user.id, examinerName: user.name, bureau: user.bureau, division: user.division, groupId: group.id, groupName: group.name, status };
}

function cancelEvaluationCase(state: EvaluationState, item: EvaluationCase) {
  item.status = 'cancelled';
  if (state.groups.some(group => group.id === item.groupId && group.deletedAt) && !state.cases.some(entry => entry.groupId === item.groupId && entry.status === 'confirmed')) {
    const personnel = personnelOf(state);
    state.personnel = { ...personnel, assignments: personnel.assignments.filter(entry => entry.groupId !== item.groupId) };
  }
}

function documentsFrom(values: string[], allowEmpty: boolean) {
  if (!Array.isArray(values) || values.length > 7) fail('출원 1건 × AI 방식 1개당 최대 7문헌을 입력할 수 있습니다.');
  const documents = values.map((value) => {
    if (typeof value !== 'string' || value.length > LITERATURE_MAX_LENGTH) fail('문헌은 특허번호, 논문 제목·서지정보, DOI 또는 URL을 2,000자 이내의 텍스트로 입력해 주세요.');
    return value.trim();
  }).filter(Boolean);
  if (!allowEmpty && documents.length === 0) fail('입력 완료하려면 문헌을 한 건 이상 입력해 주세요.');
  if (new Set(documents.map(identity)).size !== documents.length) fail('같은 AI 결과 안에 중복 문헌이 있습니다.');
  return documents;
}

function validateMonth(state: EvaluationState, value: OperationMonth) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.id)) fail('운영월은 YYYY-MM 형식이어야 합니다.');
  if (value.stages !== undefined && (!value.stages || typeof value.stages !== 'object' || Array.isArray(value.stages) || Object.entries(value.stages).some(([stage, status]) => !OPERATION_STAGES.some(entry => entry.id === stage) || !['pending', 'running', 'stopped', 'closed'].includes(status)))) fail('단계 운영 상태를 확인해 주세요.');
  for (const date of [value.selectionDeadline, value.resultDeadline, value.evaluationDeadline]) {
    if (typeof date !== 'string') fail('기한 날짜를 확인해 주세요.');
    if (date) {
      const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00.000Z`) : NaN;
      if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) fail('기한 날짜를 확인해 주세요.');
    }
  }
}

function validatePersonnel(state: EvaluationState, value: Personnel) {
  if (!value || !Array.isArray(value.memberships) || !Array.isArray(value.assignments)) fail('심사관 배정 형식을 확인해 주세요.');
  if (value.memberships.some((entry) => !entry || typeof entry.userId !== 'string' || typeof entry.groupId !== 'string') || value.assignments.some((entry) => !entry || typeof entry.userId !== 'string' || typeof entry.groupId !== 'string' || typeof entry.methodId !== 'string')) fail('심사관 배정 형식을 확인해 주세요.');
  if (new Set(value.memberships.map((entry) => entry.userId)).size !== value.memberships.length) fail('심사관의 소속 그룹은 한 개만 배정할 수 있습니다.');
  for (const entry of value.memberships) {
    if (!state.users.some((user) => user.id === entry.userId) || !currentGroups(state).some((group) => group.id === entry.groupId)) fail('심사관 또는 소속 그룹을 확인해 주세요.');
  }
  if (new Set(value.assignments.map((assignment) => `${assignment.groupId}:${assignment.methodId}`)).size !== value.assignments.length) fail('그룹·AI 종류별 담당자는 한 명이어야 합니다.');
  for (const assignment of value.assignments) {
    if (!state.users.some((user) => user.id === assignment.userId && user.roles.includes('ai')) || !state.groups.some((group) => group.id === assignment.groupId) || !state.methods.some((method) => method.id === assignment.methodId && method.kind === 'ai')) fail('AI 담당 배정을 확인해 주세요.');
    if (state.methods.find(method => method.id === assignment.methodId)?.deletedAt && !personnelOf(state).assignments.some(old => old.methodId === assignment.methodId && old.groupId === assignment.groupId && old.userId === assignment.userId)) fail('삭제된 AI 종류에는 담당자를 새로 배정할 수 없습니다.');
  }
}

function upsertUser(state: EvaluationState, user: Omit<EvaluationUser, 'id'> & { id?: string }) {
  const roles: Role[] = [...new Set(user.roles ?? [])];
  if (!roles.length || roles.some((role) => !['admin', 'examiner', 'ai'].includes(role))) fail('역할을 한 개 이상 선택해 주세요.');
  const record: EvaluationUser = { id: user.id || uid(), name: text(user.name), bureau: text(user.bureau), division: text(user.division), roles, active: Boolean(user.active) };
  if (!record.name) fail('이름을 입력해 주세요.');
  const index = state.users.findIndex((entry) => entry.id === record.id);
  if (index < 0) state.users.push(record); else state.users[index] = record;
  return record;
}

export function applyAction(input: EvaluationState, actor: EvaluationActor, action: EvaluationAction, now = new Date()): EvaluationState {
  const state = structuredClone(normalizeEvaluationState(input));
  switch (action.type) {
    case 'loadDemo': {
      requireAdmin(actor);
      if (state.cases.length || state.users.length || state.groups.some(group => group.deletedAt || !defaultGroups().some(initial => initial.id === group.id && initial.name === group.name))) fail('운영 자료가 있는 상태에는 가상 자료를 추가할 수 없습니다.');
      return { ...createDemoState(listedOperationMonths(state.months)[0]?.id ?? DEFAULT_OPERATION_MONTHS[0]), notice: state.notice ?? null };
    }
    case 'saveNotice': {
      requireAdmin(actor);
      if (typeof action.markdown !== 'string' || action.markdown.length > NOTICE_MAX_LENGTH) fail('공지사항은 20,000자 이내의 텍스트로 입력해 주세요.');
      const markdown = action.markdown.trim();
      state.notice = markdown ? { markdown, updatedAt: now.toISOString() } : null;
      return state;
    }
    case 'saveUser': {
      requireAdmin(actor);
      upsertUser(state, action.user);
      return state;
    }
    case 'saveExaminer': {
      requireAdmin(actor);
      const groupId = text(action.groupId);
      if (groupId && !currentGroups(state).some((group) => group.id === groupId)) fail('소속 그룹을 다시 선택해 주세요.');
      if (!Array.isArray(action.responsibilities) || action.responsibilities.length > 5000 || action.responsibilities.some((entry) => !entry || typeof entry.groupId !== 'string' || typeof entry.methodId !== 'string')) fail('담당 AI 배정 형식을 확인해 주세요.');
      const keys = action.responsibilities.map((entry) => JSON.stringify([entry.groupId, entry.methodId]));
      if (new Set(keys).size !== keys.length) fail('담당 AI가 중복 지정되어 있습니다.');
      const original = personnelOf(state);
      const record = upsertUser(state, action.user);
      const responsibilities = record.roles.includes('ai') ? action.responsibilities : [];
      for (const entry of responsibilities) {
        const group = state.groups.find((group) => group.id === entry.groupId);
        if (!group || (group.deletedAt && !state.cases.some((item) => item.groupId === group.id && item.status === 'confirmed'))) fail('담당 AI의 그룹을 확인해 주세요.');
        if (!record.active && !original.assignments.some((old) => old.userId === record.id && old.groupId === entry.groupId && old.methodId === entry.methodId)) fail('비활성 계정에는 담당 AI를 새로 배정할 수 없습니다.');
      }
      const selected = new Set(responsibilities.map((entry) => JSON.stringify([entry.groupId, entry.methodId])));
      const personnel: Personnel = {
        memberships: original.memberships.filter((entry) => entry.userId !== record.id),
        assignments: original.assignments.filter((entry) => entry.userId !== record.id && !selected.has(JSON.stringify([entry.groupId, entry.methodId]))),
      };
      if (groupId) personnel.memberships.push({ userId: record.id, groupId });
      personnel.assignments.push(...responsibilities.map(({ groupId, methodId }) => ({ groupId, methodId, userId: record.id })));
      validatePersonnel(state, { memberships: personnel.memberships.filter((entry) => entry.userId === record.id), assignments: personnel.assignments.filter((entry) => entry.userId === record.id) });
      state.personnel = personnel;
      return state;
    }
    case 'saveGroup': {
      requireAdmin(actor);
      const record = { id: action.group.id || uid(), name: text(action.group.name) };
      if (!record.name) fail('그룹 이름을 입력해 주세요.');
      const index = state.groups.findIndex((entry) => entry.id === record.id);
      if (index >= 0 && state.groups[index].deletedAt) fail('삭제된 그룹은 수정할 수 없습니다.', 409);
      if (index < 0) state.groups.push(record); else state.groups[index] = record;
      return state;
    }
    case 'deleteGroup': {
      requireAdmin(actor);
      const group = state.groups.find((entry) => entry.id === action.groupId) ?? fail('그룹을 찾을 수 없습니다.', 404);
      if (group.deletedAt) return state;
      group.deletedAt = now.toISOString();
      const original = personnelOf(state);
      const hasConfirmedCases = state.cases.some((item) => item.groupId === group.id && item.status === 'confirmed');
      state.personnel = {
        memberships: original.memberships.filter((entry) => entry.groupId !== group.id),
        assignments: original.assignments.filter((entry) => entry.groupId !== group.id || hasConfirmedCases),
      };
      return state;
    }
    case 'saveMethod': {
      requireAdmin(actor);
      if (!['ai', 'baseline'].includes(action.method.kind)) fail('조사 방식 유형을 확인해 주세요.');
      const record = { ...action.method, id: action.method.id || uid(), name: text(action.method.name), active: Boolean(action.method.active) };
      delete record.deletedAt;
      if (!record.name) fail('조사 방식 이름을 입력해 주세요.');
      const index = state.methods.findIndex((entry) => entry.id === record.id);
      if (index < 0) state.methods.push(record); else {
        if (state.methods[index].deletedAt) fail('삭제된 AI 종류는 수정할 수 없습니다.', 409);
        if (state.methods[index].kind !== record.kind && state.results.some((result) => result.methodId === record.id)) fail('검색 결과가 있는 조사 방식의 유형을 바꿀 수 없습니다.');
        state.methods[index] = record;
      }
      return state;
    }
    case 'deleteMethod': {
      requireAdmin(actor);
      const method = state.methods.find(entry => entry.id === action.methodId) ?? fail('AI 종류를 찾을 수 없습니다.', 404);
      if (method.kind !== 'ai') fail('AI 종류만 삭제할 수 있습니다.');
      if (method.deletedAt) return state;
      method.deletedAt = now.toISOString();
      method.active = false;
      const historicalMonths = new Set(state.results.filter(result => result.methodId === method.id).map(result => state.cases.find(item => item.id === result.caseId)?.monthId));
      for (const month of state.months) if (!historicalMonths.has(month.id)) month.methodIds = month.methodIds.filter(id => id !== method.id);
      const personnel = personnelOf(state);
      state.personnel = { ...personnel, assignments: personnel.assignments.filter(entry => entry.methodId !== method.id || state.cases.some(item => historicalMonths.has(item.monthId) && item.groupId === entry.groupId && item.status === 'confirmed')) };
      return state;
    }
    case 'savePersonnel': {
      requireAdmin(actor);
      validatePersonnel(state, action.personnel);
      state.personnel = { memberships: action.personnel.memberships.map(({ userId, groupId }) => ({ userId, groupId })), assignments: action.personnel.assignments.map(({ userId, groupId, methodId }) => ({ userId, groupId, methodId })) };
      return state;
    }
    case 'saveMonth': {
      requireAdmin(actor);
      const old = state.months.find((entry) => entry.id === action.month.id);
      if (old?.archived) fail('운영 목록에서 제외된 월입니다.', 409);
      for (const key of ['participants', 'assignments'] as const) {
        if (action.month[key] && JSON.stringify(action.month[key]) !== JSON.stringify(old?.[key] ?? [])) fail('심사관·AI 담당 배정은 심사관 관리에서 저장해 주세요.');
      }
      const month: OperationMonth = { ...action.month, defaultDeadlineVersion: 1, defaultStageVersion: 1, archived: old?.archived, methodIds: old?.methodIds ?? [], participants: old?.participants ?? [], assignments: old?.assignments ?? [], closed: old?.closed ?? false, confirmedUserIds: old?.confirmedUserIds ?? [] };
      delete month.caseLimit;
      // Ordinary settings saves, including older clients, cannot reopen stopped stages.
      if (old) {
        if (old.stages) month.stages = { ...old.stages }; else delete month.stages;
      }
      validateMonth(state, month);
      if (!old) month.stages = { ...newMonthStageStatuses(), ...month.stages };
      if (old) state.months[state.months.indexOf(old)] = month; else state.months.push(month);
      return state;
    }
    case 'setMonthClosed': {
      requireAdmin(actor);
      const month = monthOf(state, action.monthId);
      if (month.archived) fail('운영 목록에서 제외된 월입니다.', 409);
      month.closed = Boolean(action.closed);
      return state;
    }
    case 'setMonthStage': {
      requireAdmin(actor);
      if (!OPERATION_STAGES.some(entry => entry.id === action.stage) || !['pending', 'running', 'stopped', 'closed'].includes(action.status)) fail('단계와 운영 상태를 확인해 주세요.');
      const month = monthOf(state, action.monthId);
      if (month.archived) fail('운영 목록에서 제외된 월입니다.', 409);
      month.defaultStageVersion = 1;
      if (month.closed) {
        month.closed = false;
        month.stages = { selection: 'closed', result: 'closed', evaluation: 'closed' };
      }
      month.stages = { ...month.stages, [action.stage]: action.status };
      return state;
    }
    case 'saveSelection': {
      const user = actorUser(state, actor);
      if (!user.roles.includes('examiner')) fail('심사관 역할이 필요합니다.', 403);
      const month = monthOf(state, action.monthId);
      editable(month, 'selection');
      const previous = state.cases.filter(entry => entry.monthId === month.id && entry.examinerId === user.id && entry.status === 'confirmed');
      const submitted = month.confirmedUserIds.includes(user.id) || previous.length > 0;
      if (submitted && !action.confirm) fail('선정 확정한 목록은 수정 사항 저장으로 반영해 주세요.', 409);
      const rows = selectionRows(action.rows);
      if (action.confirm && !rows.length && !submitted) fail('확정할 출원을 한 건 이상 입력해 주세요.');
      state.cases = state.cases.filter((entry) => !(entry.monthId === month.id && entry.examinerId === user.id && entry.status === 'draft'));
      if (submitted) {
        const retained = new Set<string>();
        for (const row of rows) {
          const existing = previous.find(entry => identity(entry.applicationNumber) === identity(row.applicationNumber));
          if (existing) {
            existing.applicationNumber = row.applicationNumber;
            existing.cpc = row.cpc;
            retained.add(existing.id);
          } else state.cases.push(createCase(state, month, user, row, 'confirmed'));
        }
        // Removed/replaced applications retain their original results and evaluations for history.
        for (const item of previous) if (!retained.has(item.id)) cancelEvaluationCase(state, item);
      } else state.cases.push(...rows.map((row) => createCase(state, month, user, row, action.confirm ? 'confirmed' : 'draft')));
      if (action.confirm && !month.confirmedUserIds.includes(user.id)) month.confirmedUserIds.push(user.id);
      return state;
    }
    case 'adminAddCase': {
      requireAdmin(actor);
      const month = monthOf(state, action.monthId);
      editable(month);
      const user = state.users.find((entry) => entry.id === action.examinerId && entry.roles.includes('examiner')) ?? fail('담당 심사관을 확인해 주세요.');
      const [row] = selectionRows([action.row]);
      if (state.cases.some((entry) => entry.monthId === month.id && entry.examinerId === user.id && entry.status !== 'cancelled' && identity(entry.applicationNumber) === identity(row.applicationNumber))) fail('같은 월·심사관에 중복 출원이 있습니다.');
      state.cases.push(createCase(state, month, user, row, 'confirmed'));
      if (!month.confirmedUserIds.includes(user.id)) month.confirmedUserIds.push(user.id);
      return state;
    }
    case 'cancelCase': {
      requireAdmin(actor);
      const item = state.cases.find((entry) => entry.id === action.caseId) ?? fail('출원이 없습니다.');
      editable(monthOf(state, item.monthId));
      cancelEvaluationCase(state, item);
      return state;
    }
    case 'saveResult': {
      const user = actorUser(state, actor);
      const item = state.cases.find((entry) => entry.id === action.caseId && entry.status === 'confirmed') ?? fail('확정 출원이 없습니다.');
      const month = monthOf(state, item.monthId);
      editable(month, 'result');
      if (!canInputResult(state, actor, item, action.methodId)) fail('배정받은 그룹과 AI 조사 방식만 입력할 수 있습니다.', 403);
      const documents = documentsFrom(action.documents, !action.publish);
      let result = resultFor(state, item.id, action.methodId);
      const details = action.documentDetails === undefined
        ? documents.map((number) => literatureDetailsFor(result, 'draft').find((document) => document.number === number)
          ?? literatureDetailsFor(result).find((document) => document.number === number) ?? { kind: 'legacy' as const, number })
        : normalizeLiteratureDocuments(action.documentDetails, !action.publish);
      if (details.length !== documents.length || details.some((document) => !documents.includes(document.number))) fail('문헌 목록과 문헌 상세정보가 일치하지 않습니다. 자동 입력 결과를 다시 확인해 주세요.');
      const orderedDetails = documents.map((number) => details.find((document) => document.number === number)!);
      if (!result) { result = { id: uid(), caseId: item.id, methodId: action.methodId, draftDocuments: [], draftAuthorId: user.id, publishedDocuments: [], publishedVersion: 0, publishedBy: null, publishedAt: null }; state.results.push(result); }
      result.draftDocuments = documents;
      result.draftDocumentDetails = structuredClone(orderedDetails);
      result.draftAuthorId = user.id;
      if (action.publish) {
        if (!sameSet(result.publishedDocuments, documents) || !sameLiteratureDetails(literatureDetailsFor(result), orderedDetails)) result.publishedVersion += 1;
        result.publishedDocuments = documents;
        result.publishedDocumentDetails = structuredClone(orderedDetails);
        result.publishedBy = { id: user.id, name: user.name };
        result.publishedAt = now.toISOString();
      }
      return state;
    }
    case 'saveEvaluation': {
      const user = actorUser(state, actor);
      const item = state.cases.find((entry) => entry.id === action.caseId && entry.status === 'confirmed') ?? fail('확정 출원이 없습니다.');
      if (item.examinerId !== user.id || !user.roles.includes('examiner')) fail('본인이 선정한 출원만 평가할 수 있습니다.', 403);
      const month = monthOf(state, item.monthId);
      editable(month, 'evaluation');
      if (action.overallComment !== undefined && (typeof action.overallComment !== 'string' || action.overallComment.length > OVERALL_COMMENT_MAX_LENGTH)) fail('총평은 4,000자 이내의 텍스트로 입력해 주세요.');
      const overallComment = action.overallComment === undefined
        ? state.rankings.find((entry) => entry.caseId === item.id)?.overallComment ?? ''
        : action.overallComment.trim();
      if (!Array.isArray(action.evaluations)) fail('평가 내용을 확인해 주세요.');
      if (new Set(action.evaluations.map((entry) => entry.methodId)).size !== action.evaluations.length) fail('조사 방식별 평가는 한 번씩 저장해 주세요.');
      for (const entry of action.evaluations) {
        const result = resultFor(state, item.id, entry.methodId) ?? fail('공개한 AI 결과만 평가할 수 있습니다.');
        if (!result.publishedVersion) fail('공개한 AI 결과만 평가할 수 있습니다.');
        if (!caseMethods(state, item).some((method) => method.kind === 'ai' && method.id === entry.methodId)) fail('공개한 AI 결과만 평가할 수 있습니다.');
        if (entry.version !== result.publishedVersion) fail('AI 결과가 변경되었습니다. 최신 결과를 확인해 주세요.', 409);
        if (!Array.isArray(entry.documents) || entry.documents.length > 7 || new Set(entry.documents.map((document) => identity(document.number))).size !== entry.documents.length) fail('문헌별 평가 내용을 확인해 주세요.');
        const documents = entry.documents.map((document) => {
          if (document.score !== null && (!Number.isInteger(document.score) || document.score < 0 || document.score > 5)) fail('점수는 미선택 또는 0~5 정수여야 합니다.');
          if (document.cited !== null && !['O', 'X'].includes(document.cited)) fail('인용여부는 미선택·O·X 중 선택해 주세요.');
          if (!result.publishedDocuments.some((number) => identity(number) === identity(document.number))) fail('현재 공개 결과에 없는 문헌입니다.');
          return { number: document.number, score: document.score, cited: document.cited, note: text(document.note, 4000) };
        });
        const evaluation: MethodEvaluation = { caseId: item.id, methodId: entry.methodId, version: entry.version, documents, updatedAt: now.toISOString() };
        state.evaluations = state.evaluations.filter((old) => !(old.caseId === item.id && old.methodId === entry.methodId));
        state.evaluations.push(evaluation);
      }
      const values = action.rankings;
      if (!values || typeof values !== 'object' || Array.isArray(values)) fail('품질 순위를 확인해 주세요.');
      const selectedRanks: number[] = [];
      for (const [methodId, rank] of Object.entries(values)) {
        const method = caseMethods(state, item).find((entry) => entry.id === methodId) ?? fail('현재 출원에 공개된 AI 결과 또는 선행기술조사 보고서만 비교할 수 있습니다.');
        if (![null, 1, 2, 3, 'unranked', 'excluded', 'incomparable'].includes(rank)) fail('품질 순위 값을 확인해 주세요.');
        if (rank !== null && method.kind === 'ai' && !resultFor(state, item.id, method.id)?.publishedVersion) fail('대기 중인 AI의 순위는 선택할 수 없습니다.');
        if (typeof rank === 'number') selectedRanks.push(rank);
      }
      if (new Set(selectedRanks).size !== selectedRanks.length) fail('품질 순위는 동순위를 허용하지 않습니다.');
      const hasRank = Object.values(values).some((value) => value !== null);
      if (hasRank) {
        if (!caseMethods(state, item).some((method) => method.kind === 'ai')) fail('공개된 AI 검색 결과가 있어야 품질 순위를 매길 수 있습니다.');
        for (const method of caseMethods(state, item).filter((method) => method.kind === 'ai')) {
          if ((action.versions[method.id] ?? 0) !== (resultFor(state, item.id, method.id)?.publishedVersion ?? 0)) fail('AI 결과가 변경되어 품질 순위를 다시 확인해야 합니다.', 409);
        }
      }
      const ranking: QualityRanking = { caseId: item.id, versions: Object.fromEntries(caseMethods(state, item).filter((method) => method.kind === 'ai').map((method) => [method.id, resultFor(state, item.id, method.id)!.publishedVersion])), values, updatedAt: now.toISOString(), overallComment };
      state.rankings = state.rankings.filter((old) => old.caseId !== item.id);
      state.rankings.push(ranking);
      return state;
    }
    default: return fail('지원하지 않는 동작입니다.');
  }
}

export function visibleState(state: EvaluationState, actor: EvaluationActor): EvaluationState {
  state = normalizeEvaluationState(state);
  if (actor.admin) return state;
  const user = state.users.find((candidate) => candidate.id === actor.userId && candidate.active);
  const visibleCases = state.cases.filter((item) => user && (item.examinerId === user.id || assignedCaseMethods(state, item).some((method) => canInputResult(state, actor, item, method.id))));
  const ids = new Set(visibleCases.map((item) => item.id));
  return {
    ...state,
    users: state.users.filter((entry) => entry.active || entry.id === user?.id),
    cases: visibleCases,
    results: state.results.filter((result) => {
      if (!ids.has(result.caseId)) return false;
      const item = visibleCases.find((entry) => entry.id === result.caseId)!;
      return item.examinerId === user?.id || canInputResult(state, actor, item, result.methodId);
    }).map((result) => {
      const item = visibleCases.find((entry) => entry.id === result.caseId)!;
      return canInputResult(state, actor, item, result.methodId) ? result : { ...result, draftDocuments: [], draftDocumentDetails: [], draftAuthorId: '' };
    }),
    evaluations: state.evaluations.filter((evaluation) => visibleCases.some((item) => item.id === evaluation.caseId && item.examinerId === user?.id)),
    rankings: state.rankings.filter((ranking) => visibleCases.some((item) => item.id === ranking.caseId && item.examinerId === user?.id)),
    months: state.months.map((month) => ({ ...month, confirmedUserIds: month.confirmedUserIds.filter((id) => id === user?.id) })),
  };
}

export function getStatistics(state: EvaluationState, monthId: string, groupId = '', examinerId = '') {
  const month = state.months.find((entry) => entry.id === monthId);
  const cases = state.cases.filter((item) => item.monthId === monthId && item.status === 'confirmed' && (!groupId || item.groupId === groupId) && (!examinerId || item.examinerId === examinerId));
  const personnel = personnelOf(state);
  const participants = (month ? personnel.memberships : []).filter((entry) => state.users.some((user) => user.id === entry.userId && user.active && user.roles.includes('examiner')) && (!groupId || entry.groupId === groupId) && (!examinerId || entry.userId === examinerId));
  const assignments = personnel.assignments.filter((entry) => cases.some((item) => item.groupId === entry.groupId && assignedCaseMethods(state, item).some((method) => method.id === entry.methodId)));
  const rows = cases.flatMap((item) => caseMethods(state, item).filter((method) => method.kind === 'ai').flatMap((method) => {
    const result = resultFor(state, item.id, method.id);
    const evaluation = validEvaluation(state, item.id, method.id);
    return (result?.publishedDocuments ?? []).map((number) => {
      const document = evaluation?.documents.find((entry) => identity(entry.number) === identity(number));
      const documentDetails = literatureDetailsFor(result).find((entry) => entry.number === number)!;
      const stale = state.evaluations.some((entry) => entry.caseId === item.id && entry.methodId === method.id && entry.version !== result?.publishedVersion);
      return { caseId: item.id, applicationNumber: item.applicationNumber, cpc: item.cpc, examinerId: item.examinerId, examinerName: item.examinerName, groupId: item.groupId, groupName: item.groupName, authorName: result?.publishedBy?.name ?? '', methodId: method.id, methodName: method.name, number, documentDetails, url: documentDetails.url ?? '', reportMarkdown: documentDetails.reportMarkdown ?? '', score: document?.score ?? null, cited: document?.cited ?? null, note: document?.note ?? '', status: stale ? '재확인 필요' : document?.score != null && document?.cited != null ? '평가 완료' : '미평가' };
    });
  }));
  const availableIds = new Set(month ? aiMethods(state, month.id).map((method) => method.id) : []);
  const methods = (month ? state.methods.filter((method) => method.kind === 'baseline' || availableIds.has(method.id)) : []).map((method) => {
    const documents = rows.filter((row) => row.methodId === method.id);
    const scores = documents.filter((row) => row.score !== null);
    const citations = documents.filter((row) => row.cited !== null);
    const completed = method.kind === 'ai' ? cases.filter((item) => resultFor(state, item.id, method.id)?.publishedVersion).length : 0;
    const target = method.kind === 'ai' ? cases.filter((item) => assignedCaseMethods(state, item).some((assigned) => assigned.id === method.id) || Boolean(resultFor(state, item.id, method.id)?.publishedVersion)).length : 0;
    return { id: method.id, name: method.name, kind: method.kind, target, completed, pending: target - completed, documents: documents.length, averageScore: scores.length ? scores.reduce((sum, row) => sum + row.score!, 0) / scores.length : null, citationRate: citations.length ? citations.filter((row) => row.cited === 'O').length / citations.length : null, firstPlace: cases.filter((item) => { const ranking = state.rankings.find((entry) => entry.caseId === item.id); return rankingIsCurrent(state, item, ranking) && rankingComplete(state, item, ranking?.values ?? {}) && ranking?.values[method.id] === 1; }).length };
  });
  const statuses = cases.map((item) => ({ ...item, ...caseStatus(state, item), documentCount: rows.filter((row) => row.caseId === item.id).length }));
  const summary = { participants: participants.length, unselected: participants.filter((participant) => !month?.confirmedUserIds.includes(participant.userId)).length, cases: cases.length, inputComplete: statuses.filter((item) => item.inputComplete).length, inputPending: statuses.filter((item) => !item.inputComplete).length, unevaluated: statuses.filter((item) => item.evaluationStatus === '미평가').length, inProgress: statuses.filter((item) => item.evaluationStatus === '평가 중').length, complete: statuses.filter((item) => item.complete).length, recheck: statuses.filter((item) => item.stale).length, documents: rows.length, inputRate: cases.length ? statuses.filter((item) => item.inputComplete).length / cases.length : null, evaluationRate: cases.length ? statuses.filter((item) => item.complete).length / cases.length : null };
  const groups = operationGroups(state, monthId).filter((group) => !groupId || group.id === groupId).map((group) => {
    const items = statuses.filter((item) => item.groupId === group.id);
    return { id: group.id, name: group.name, participants: participants.filter((entry) => entry.groupId === group.id).length, cases: items.length, inputComplete: items.filter((item) => item.inputComplete).length, complete: items.filter((item) => item.complete).length, documents: rows.filter((row) => row.groupId === group.id).length, completionRate: items.length ? items.filter((item) => item.complete).length / items.length : null };
  });
  const accounts = state.users.filter((user) => (!examinerId || user.id === examinerId) && (statuses.some((item) => item.examinerId === user.id) || participants.some((entry) => entry.userId === user.id) || assignments.some((entry) => entry.userId === user.id && (!groupId || entry.groupId === groupId)))).map((user) => {
    const items = statuses.filter((item) => item.examinerId === user.id);
    const assigned = cases.flatMap((item) => assignments.filter((assignment) => assignment.groupId === item.groupId && assignment.userId === user.id));
    const aiCompleted = cases.reduce((total, item) => total + assignments.filter((assignment) => assignment.groupId === item.groupId && assignment.userId === user.id && resultFor(state, item.id, assignment.methodId)?.publishedVersion).length, 0);
    return { id: user.id, name: user.name, division: user.division, cases: items.length, complete: items.filter((item) => item.complete).length, aiTarget: assigned.length, aiCompleted };
  });
  return { summary, cases: statuses, rows, methods, groups, accounts };
}

export function createDemoState(monthId = currentOperationMonth()): EvaluationState {
  const state = createInitialState(monthId);
  state.isDemo = true;
  state.groups = [{ id: 'group-a', name: '가상 1그룹' }, { id: 'group-b', name: '가상 2그룹' }];
  state.users = Array.from({ length: 10 }, (_, index) => ({ id: `demo-user-${index + 1}`, name: `가상 심사관 ${index + 1}`, bureau: '가상 심사국', division: index < 5 ? '가상 심사1과' : '가상 심사2과', roles: (index === 0 || index === 1 || index === 5 || index === 6 ? ['examiner', 'ai'] : ['examiner']) as Role[], active: true }));
  const month = state.months[0];
  month.methodIds = state.methods.filter((method) => method.active).map((method) => method.id);
  // Completed demonstration data represents a workflow whose stages already started.
  month.stages = { selection: 'running', result: 'running', evaluation: 'running' };
  state.personnel = { memberships: state.users.map((user, index) => ({ userId: user.id, groupId: index < 5 ? 'group-a' : 'group-b' })), assignments: [ { groupId: 'group-a', methodId: 'chatgpt', userId: 'demo-user-1' }, { groupId: 'group-a', methodId: 'claude', userId: 'demo-user-2' }, { groupId: 'group-b', methodId: 'chatgpt', userId: 'demo-user-6' }, { groupId: 'group-b', methodId: 'claude', userId: 'demo-user-7' } ] };
  month.confirmedUserIds = state.users.map((user) => user.id);
  state.users.forEach((user, index) => {
    for (let n = 0; n < 2; n++) {
      const item = createCase(state, month, user, { applicationNumber: `10-2024-${String(9000000 + index * 2 + n).padStart(7, '0')}`, cpc: 'G06N 20/00' }, 'confirmed');
      state.cases.push(item);
      ['chatgpt', 'claude'].forEach((methodId, methodIndex) => {
        const author = state.users.find((entry) => entry.id === personnelOf(state).assignments.find((assignment) => assignment.groupId === item.groupId && assignment.methodId === methodId)?.userId)!;
        const documents = Array.from({ length: 7 }, (_, documentIndex) => `KR10${20200000000 + index * 100 + n * 20 + methodIndex * 7 + documentIndex}A`);
        state.results.push({ id: uid(), caseId: item.id, methodId, draftDocuments: [...documents], draftAuthorId: author.id, publishedDocuments: documents, publishedVersion: 1, publishedBy: { id: author.id, name: author.name }, publishedAt: new Date().toISOString() });
        state.evaluations.push({ caseId: item.id, methodId, version: 1, documents: documents.map((number, i) => ({ number, score: [5,4,3,2,1,0,5][i], cited: i < 2 ? 'O' : 'X', note: '' })), updatedAt: new Date().toISOString() });
      });
      state.rankings.push({ caseId: item.id, versions: { chatgpt: 1, claude: 1 }, values: { chatgpt: 1, baseline: 2, claude: 3 }, updatedAt: new Date().toISOString() });
    }
  });
  return state;
}
