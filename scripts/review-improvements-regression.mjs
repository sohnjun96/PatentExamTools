import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  stdin: { resolveDir: root, contents: `
    export * from './app/lib/claim-version-model';
    export * from './app/lib/search-strategy';
    export * from './app/lib/analysis-input-key';
    export * from './app/lib/analysis-provenance';
    export * from './app/lib/review-readiness';
    export * from './app/lib/evidence-location';
    export * from './app/lib/candidate-documents';
    export * from './app/lib/review-report';
    export * from './app/lib/workspace-preferences';
    export * from './app/lib/examination-model';
  ` },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const change = (claimNumber, code, text, previous = null) => ({
  applicationNumber: '1020240093843', serialNumber: 1, documentNumber: '', claimNumber,
  changeTypeCode: code, changeTypeName: { I: '신규', U: '수정', D: '삭제' }[code],
  claimText: text, previousClaimText: previous, sourceDocumentNumber: null, changeSegments: [],
});
const document = (number, serial, changes) => ({
  documentNumber: number, serialNumber: serial, sourceDocumentNumber: null, isInitialFiling: false,
  changes, statistics: { total: changes.length, inserted: 0, amended: 0, deleted: 0 },
});
const filing = document('filing', 1, [change(1, 'I', '최초 구성 A'), change(2, 'I', '제1항에 있어서, 구성 B')]);
const firstAmendment = document('amend-1', 2, [change(1, 'U', 'A 및 C', '최초 구성 A'), change(2, 'D', '', '제1항에 있어서, 구성 B')]);
const secondAmendment = document('amend-2', 3, [change(1, 'U', 'A, C 및 D', 'A 및 C'), change(3, 'I', '제1항에 있어서, 구성 E')]);
const versions = api.buildDocumentClaimVersions([secondAmendment, filing, firstAmendment], ['filing']);
assert.equal(versions[0].afterComplete, true);
assert.deepEqual(versions[1].before.map(item => item.number), [1, 2]);
assert.deepEqual(versions[1].after, [{number: 1, text: 'A 및 C'}]);
assert(!JSON.stringify(versions[1]).includes('구성 E'), 'later claims must never leak into an earlier snapshot');
assert.equal(versions[2].before[0].text, 'A 및 C');
assert.equal(versions[2].afterComplete, true);
const partial = api.buildDocumentClaimVersions([firstAmendment]);
assert.equal(partial[0].beforeComplete, false);
assert.equal(partial[0].afterComplete, false);
assert.equal(partial[0].before[0].text, '최초 구성 A');
const inconsistent = api.buildDocumentClaimVersions([filing, document('bad', 2, [change(1, 'U', '새 구성', '다른 원문')])], ['filing']);
assert.equal(inconsistent[1].afterComplete, false);

const features = [
  {id:'1A',label:'카메라',text:'영상을 촬영하는 카메라',role:'핵심 검색'},
  {id:'1B',label:'위상 지연',text:'위상 지연을 보상하는 필터',role:'검색 제외'},
  {id:'1C',label:'판정 정확도',text:'판정 정확도 자체 평가',role:'조합 검색'},
];
const source = {title:'인식 시스템',titleEnglish:'Recognition system'};
const expression = api.buildSearchExpression(source, features, ['카메라','위상 지연','판정 정확도']);
assert(expression.includes('카메라') && expression.includes('판정 정확도'));
assert(!expression.includes('위상') && !expression.includes('인식 시스템') && !expression.includes('CPC='));
assert(expression.includes('\nAND\n') && !expression.includes('G1='));
const options = {...api.DEFAULT_SEARCH_OPTIONS,includeTitle:true,cpcCodes:['G06V 10/00']};
assert(api.buildSearchExpression(source,features,[],options).includes('CPC=G06V10/00'));
assert(api.buildSearchExpression(source,features,[],options).includes('인식 시스템'));
assert.equal(api.buildSearchExpression(source,features,[],{...options,useCustomExpression:true,customExpression:''}), '');
assert.equal(api.buildSearchExpression(source,features,[],{...options,customExpression:'TI=(manual)'}), 'TI=(manual)');

const historyItem = (documentNumber, date, title) => ({documentNumber,date,title,status:''});
const noticeDocument = historyItem('952025000000001', '2025.01.01', '의견제출통지서');
const amendment = historyItem('112025000000002','2025.02.01','[명세서 등]보정서');
const extra = historyItem('112025000000003','2025.02.02','[명세서 등]보정서');
const procedural = historyItem('112025000000004','2025.02.03','[출원서 등 보완]보정서');
const history = [extra,procedural,amendment,noticeDocument];
const automatic = api.buildExaminationRounds(history);
assert.equal(automatic[0].connectionStatus,'needs_confirmation');
const links = [{noticeNumber:noticeDocument.documentNumber,opinionNumbers:[],amendmentNumbers:[amendment.documentNumber],decisionNumbers:[],historyKey:api.caseHistoryKey(history)}];
const rounds = api.buildExaminationRounds(history, undefined, new Set(), links);
assert.equal(rounds[0].connectionStatus,'linked');
assert.equal(rounds[0].connectionOrigin,'user');
assert.deepEqual(rounds[0].amendments.map(item=>item.documentNumber),[amendment.documentNumber]);
assert(!rounds[0].amendments.some(item=>item.documentNumber===procedural.documentNumber));

const documents = [document(amendment.documentNumber,2,[change(1,'U','A + C','A')])];
const summary = {oneLine:'진보성 거절',rejectionGrounds:[{provision:'제29조제2항',claimNumbers:[1],reason:'차별 구성 확인 필요'}],allowableClaims:[2],keyIssues:[],affectedClaims:[],citedReferences:['D1'],deadlines:[],requiredActions:[],cautions:[]};
const notices = {[noticeDocument.documentNumber]:{summary,basisStatus:'current',markdown:'[심사결과]\n| 제29조제2항 | 청구항 1 |\n\n## 구체적인 거절이유\n1. 제29조제2항\n청구항 제1항의 구성 C는 인용발명 1에 기재된 구성과 동일하고 통상의 기술자가 쉽게 도출할 수 있으므로 차별성 확인이 필요합니다.',tableWarnings:[]}};
const resolutions = {[noticeDocument.documentNumber]:{summary:{headline:'추가 한정 검토 필요',legalGroundResults:[{provision:'제29조제2항',originalClaimNumbers:[1],summary:'일부 해소'}],cautions:[]},inputKey:api.amendmentInputKey(summary,documents)}};
const technical = {summary:{oneLine:'영상 인식',technicalProblem:'- 판정 오류 감소\n- 불명 결과 처리',solution:'정확도 평가',effects:['오인식 감소'],keyElements:['평가 장치'],operationFlow:['촬영','인식']},sourceBasis:{caseHistoryKey:api.caseHistoryKey(history),fullTextHash:'hash-v1'}};
const readiness = {history,fullTextHash:'hash-v1',summary:technical,rounds,notices,resolutions,documents,changeSummary:{summary:{},inputKey:api.claimChangesInputKey(documents)}};
assert.equal(api.reviewReadiness(readiness).complete,true);
assert.equal(api.reviewReadiness({...readiness,fullTextHash:'hash-v2'}).complete,false);
assert.equal(api.reviewReadiness({...readiness,notices:{[noticeDocument.documentNumber]:{...notices[noticeDocument.documentNumber],basisStatus:'changed'}}}).complete,false);
assert.equal(api.reviewReadiness({...readiness,documents:[document(amendment.documentNumber,2,[change(1,'U','NEW WORDING','A')])]}).complete,false, 'same document ID with different wording must invalidate analyses');
assert.equal(api.reviewReadiness({...readiness,rounds:automatic}).complete,false);
const target = api.noticeGroundTarget(notices[noticeDocument.documentNumber].markdown,'제29조제2항',[1],noticeDocument.documentNumber);
assert(target.excerpt.includes('구성 C') && !target.excerpt.startsWith('|'));
assert.equal(api.noticeGroundTarget('| 제29조제2항 | 청구항 1 |','제29조제2항',[1],noticeDocument.documentNumber).excerpt,'');
const multipleLaws='구체적인 거절이유\n제29조제2항\n청구항 제1항의 구성 C는 인용발명으로부터 통상의 기술자가 쉽게 도출할 수 있으며 차이점을 확인할 수 없어 진보성이 인정되지 않습니다.\n제42조제4항\n청구항 제1항의 문언은 기재가 불명확하여 구성 관계와 권리범위를 판단할 수 없으므로 해당 사항을 명확히 보정할 필요가 있습니다.';
assert(api.noticeGroundTarget(multipleLaws,'제29조제2항',[1],'notice').excerpt.includes('구성 C'));
assert(api.noticeGroundTarget(multipleLaws,'제42조제4항',[1],'notice').excerpt.includes('불명확'));
assert.equal(api.noticeGroundTarget('구체적인 거절이유\n제42조제4항\n청구항 제1항의 문언은 기재가 불명확하여 구성 관계와 권리범위를 판단할 수 없으므로 해당 사항을 명확히 보정할 필요가 있습니다.','제29조제2항',[1],'notice').excerpt,'','do not substitute a different legal ground');

const candidate = api.normalizeCandidate({country:'KR',number:'10-2018-0012345',publicationDate:'2018-01-31',title:'인식 장치'},'2024.07.15');
assert.equal(candidate.eligible,true);
assert.equal(candidate.relevance,'미평가');
assert.equal(api.normalizeCandidate({number:'10-2018-0012345'},'2024.07.15').eligible,null);
assert.throws(()=>api.normalizeCandidate({number:'10-2018-0012345',publicationDate:'2024-02-30'},''),/유효한/);
assert.throws(()=>api.normalizeCandidate({number:'10-2018-0012345',sourceUrl:'javascript:alert(1)'},''),/HTTPS/);
assert.throws(()=>api.normalizeCandidate({number:'10-2018-0012345',sourceUrl:'https://user:password@example.com'},''),/HTTPS/);
const caseBase={status:'',registrationStatus:'',registrationNumber:'',registrationDate:'',examinationRequestDate:'2024.01.01',history:[]};
assert.equal(api.classifyCaseLifecycle({...caseBase,history:[noticeDocument,historyItem('opinion','2025.02.01','의견서')]}).code,'response_received');
assert.equal(api.classifyCaseLifecycle({...caseBase,history:[noticeDocument,amendment]}).code,'reexamination_after_amendment');
assert.equal(api.classifyCaseLifecycle({...caseBase,history:[historyItem('decision','2025.02.01','특허결정')]}).code,'allowed_pending_registration');
assert.equal(api.classifyCaseLifecycle({...caseBase,registrationNumber:'1012345670000'}).code,'registered_closed');

const report = api.createReviewReport({
  data:{applicationNumber:'10-2024-0093843',applicationNumberRaw:'1020240093843',title:'<script>alert(1)</script>',applicant:'출원인',applicationDate:'2024.07.15',publicationNumber:'',registrationNumber:'',updatedAt:'2026.10.03',history,claims:[]},
  lifecycleLabel:'보정 후 재심사',basisStatus:'current',technical,rounds,notices,resolutions,
  claimChanges:{documents},changeSummary:{oneLine:'구성 C 추가',searchRecommendation:{status:'optional',reason:'심사관 선택'}},
  evidenceItems:[{label:'정확도 평가',sourceRefs:[{locator:'[0048]',sourceId:'paragraph-0048',excerpt:'평가 장치',sourceType:'specification'}]}],
  candidates:[candidate],searchExpression:expression,
});
for(const text of ['해결하고자 하는 과제','판정 오류 감소','제29조제2항','추가 한정 검토 필요','보정 전:','원문 근거','[0048]','후보문헌']) assert(report.markdown.includes(text),text);
assert(report.html.includes('&lt;script&gt;') && !report.html.includes('<script>'));
const preferences = api.parseWorkspacePreferences(JSON.stringify({version:1,view:'strategy',selectedClaim:1,searchOptions:{1:{includeTitle:false,cpcCodes:[],customExpression:'',useCustomExpression:true}},claimKeywords:{1:['카메라'],2:['필터']}}));
assert.equal(preferences.searchOptions[1].useCustomExpression,true);
assert.deepEqual(preferences.claimKeywords[2],['필터']);
console.log('Review improvements passed: chronological/partial claims, exclusion-safe editable searches, stale analyses, manual rounds, substantive evidence, report contents/escaping, candidate dates and case status.');
