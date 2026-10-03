import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { MockAgent } from 'undici';
import { createHash } from 'node:crypto';

// In-memory Worker/D1 only. No real API keys and no outbound network allowed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applicationNumber = '1020240093843';
const sendNumber = '952025083599412';
const amendmentNumber = '112025100848978';
const mock = new MockAgent();
mock.disableNetConnect();
const kipris = mock.get('https://plus.kipris.or.kr');
let metadataCalls = 0;
let pdfCalls = 0;
let openAiCalls = 0;
const pdfBytes = '%PDF-1.7\nfixture\n%%EOF';
const legacyNoticeVersion = 'notice-markdown-2026-08-29-v4';
const noticeSourceHash = legacyNoticeVersion + ':' + createHash('sha256').update(legacyNoticeVersion).update(pdfBytes).digest('hex');
mock.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(() => {
  openAiCalls += 1;
  return {statusCode:200,data:JSON.stringify({status:'completed',output_text:'{"ok":true}',usage:{input_tokens:10,output_tokens:5}})};
}).delay(60).persist();
const xml = `<?xml version="1.0" encoding="UTF-8"?><patent><invention-title>동위상 전압 보상 장치</invention-title><abstract><p>전압 보상</p></abstract><description><technical-field><p num="0001">기술 분야<br/>개행 보존</p></technical-field><description-of-embodiments><p num="0048">위상 지연을 보상한다.</p></description-of-embodiments></description><claims><claim num="0001"><claim-text>필터를 포함하는 장치.</claim-text></claim><claim num="0002"><claim-text>제 <claim-ref idref="claim-0001">1</claim-ref> 항에 있어서, 위상 지연을 보상하는 장치.</claim-text></claim></claims></patent>`;
kipris.intercept({ path: /\/openapi\/rest\/patUtiModInfoSearchSevice\/patentFullTextFileInfo\?/, method: 'GET' }).reply(() => {
  metadataCalls += 1;
  return { statusCode: 200, data: '<response><resultCode>00</resultCode><fullTextFileInfo><docName>test.xml</docName><path>https://plus.kipris.or.kr/openapi/fileToss.jsp?arg=xml-fixture</path></fullTextFileInfo></response>' };
}).persist();
kipris.intercept({ path: '/openapi/fileToss.jsp?arg=xml-fixture', method: 'GET' }).reply(200, xml).persist();
kipris.intercept({ path: /\/openapi\/rest\/IntermediateDocumentOPService\/pdfInfoV2\?/, method: 'GET' }).reply(() => {
  pdfCalls += 1;
  return { statusCode: 200, data: `<response><resultCode>00</resultCode><pdfInfoV2><applicationNumber>${applicationNumber}</applicationNumber><sendNumber>${sendNumber}</sendNumber><fileName>notice.pdf</fileName><filePath>https://plus.kipris.or.kr/openapi/fileToss.jsp?arg=pdf-fixture</filePath></pdfInfoV2></response>` };
}).persist();
kipris.intercept({ path: '/openapi/fileToss.jsp?arg=pdf-fixture', method: 'GET' }).reply(200, pdfBytes).persist();

const result = await build({
  stdin: { resolveDir: root, contents: `
    import { GET as fulltext } from './app/api/patent/fulltext/route';
    import { GET as pdf } from './app/api/patent/pdf/route';
    import { GET as notice, POST as analyze } from './app/api/patent/notice-analysis/route';
    import { POST as resolution } from './app/api/patent/amendment-resolution/route';
    import { GET as changes } from './app/api/patent/claim-changes/route';
    import { GET as summary } from './app/api/patent/summary/route';
    import { appDatabase, savePatentCase, saveClaimChangeHistory, WORKSPACE_USER_ID } from './app/lib/db';
    import { saveDocument, readDocument } from './app/lib/document-cache';
    import { documentHash } from './app/lib/document-cache-core';
    import { caseHistoryKey } from './app/lib/analysis-provenance';
    import { syncCaseReviewFoundation } from './app/lib/review-store';
    import { GET as roundLinks, PUT as saveLinks } from './app/api/patent/round-links/route';
    import { GET as candidates, POST as saveCandidate, DELETE as removeCandidate } from './app/api/patent/candidates/route';
    import { requestStructuredOpenAi } from './app/lib/openai-response';
    import { apiProtectionSnapshot } from './app/lib/api-protection';
    import { errorResponse } from './app/lib/http';
    export default { async fetch(request) {
      const url = new URL(request.url);
      Object.defineProperty(request, 'nextUrl', {value:url});
      if(url.pathname==='/seed') {
        const fixture = await request.json();
        const db = await appDatabase();
        await db.prepare('INSERT INTO notice_analyses (user_id, application_number, send_number, parser, model, source_hash, markdown_text, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(WORKSPACE_USER_ID,fixture.applicationNumber,fixture.sendNumber,'openai-pdf','fixture',fixture.noticeSourceHash,fixture.markdown,JSON.stringify(fixture.summary)).run();
        await savePatentCase(WORKSPACE_USER_ID,fixture.applicationNumber,fixture.patentCase,'2026-08-28T11:23:35.285Z');
        await saveClaimChangeHistory(WORKSPACE_USER_ID,fixture.applicationNumber,'fixture',fixture.changes,'2026-08-28T11:23:35.285Z');
        await syncCaseReviewFoundation(WORKSPACE_USER_ID,fixture.applicationNumber,fixture.patentCase);
        await db.prepare('INSERT INTO patent_summaries (user_id, application_number, summary_type, model, source_hash, content_json) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(WORKSPACE_USER_ID,fixture.applicationNumber,'examination_overview_v8','fixture','fixture',JSON.stringify({oneLine:'위상 지연 보상',_sourceBasis:{caseHistoryKey:caseHistoryKey(fixture.patentCase.history),caseFetchedAt:'2026-08-28T11:23:35.285Z',fullTextHash:fixture.fullTextHash,fullTextFetchedAt:fixture.fullTextFetchedAt,sourceFileName:'test.xml',claimNumbers:[1,2]}})).run();
        return Response.json({ok:true});
      }
      if(url.pathname==='/change-case') {
        await savePatentCase(WORKSPACE_USER_ID,'${applicationNumber}',{history:[{documentNumber:'999999999999999',date:'2026.10.02',title:'새 통지서'}]},'2026-10-02T00:00:00Z');
        return Response.json({ok:true});
      }
      if(url.pathname==='/workflow-case') {
        const fixture=await request.json();
        await savePatentCase(WORKSPACE_USER_ID,'${applicationNumber}',fixture.patentCase,new Date().toISOString());
        await saveClaimChangeHistory(WORKSPACE_USER_ID,'${applicationNumber}','workflow-fixture',fixture.changes,new Date().toISOString());
        return Response.json({ok:true});
      }
      if(url.pathname==='/chunks') {
        const bytes = new Uint8Array(3_100_001).map((_,index)=>index%251);
        const sourceHash = await documentHash(bytes);
        await saveDocument('test-chunks','${applicationNumber}',{bytes,sourceHash,fileName:'chunks.pdf',mimeType:'application/pdf',fetchedAt:new Date().toISOString(),metadata:{fixture:true}});
        const cached = await readDocument('test-chunks');
        return Response.json({length:cached?.bytes.length,hash:cached?.sourceHash,expected:sourceHash,last:cached?.bytes.at(-1)});
      }
      if(url.pathname==='/budget') return Response.json(await apiProtectionSnapshot());
      if(url.pathname==='/ai-fixture') {
        try {
          const result = await requestStructuredOpenAi({apiKey:'fixture-not-a-key',body:{model:'fixture',store:false,input:url.searchParams.get('input')},label:'시험',timeoutMs:1000,maxOutputTokens:50,retryMaxOutputTokens:100});
          return Response.json(result);
        } catch(error) { return errorResponse(error); }
      }
      const route = { '/fulltext':fulltext,'/pdf':pdf,'/notice':request.method==='POST'?analyze:notice,'/resolution':resolution,'/changes':changes,'/summary':summary,
        '/round-links':request.method==='PUT'?saveLinks:roundLinks, '/candidates':request.method==='POST'?saveCandidate:request.method==='DELETE'?removeCandidate:candidates }[url.pathname];
      return route ? route(request) : new Response('Not found',{status:404});
    }};
  ` },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  alias: { '@': root }, external: ['cloudflare:workers'],
  plugins: [{ name: 'next-response-shim', setup(builder) {
    builder.onResolve({filter:/^next\/server$/}, () => ({path:'next/server',namespace:'test-next'}));
    builder.onLoad({filter:/.*/,namespace:'test-next'}, () => ({contents:'export class NextResponse extends Response { static json(body,init){return Response.json(body,init);} }',loader:'js'}));
  } }],
});
const worker = new Miniflare({ modules: true, script: result.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { KIPRIS_API_KEY: 'fixture-not-a-key', KIPRIS_DAILY_LIMIT:'3', OPENAI_DAILY_LIMIT:'2' }, fetchMock: mock });
const parameters = `applicationNumber=${applicationNumber}`;
const call = (route, options) => worker.dispatchFetch(`http://localhost${route}`, options);
try {
  const coldResponses = await Promise.all(Array.from({length:3},()=>call(`/fulltext?${parameters}`)));
  const firstResponse = coldResponses[0];
  assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
  const first = await firstResponse.json();
  assert.equal(first.cached, false);
  assert.equal(first.usage.total, 1);
  assert((await Promise.all(coldResponses.slice(1).map((response)=>response.json()))).every((item)=>item.sourceHash===first.sourceHash && item.usage.total===1));
  assert.equal(first.sections[0].paragraphs[0].text, '기술 분야\n개행 보존');
  assert.deepEqual(first.claims[1].referenceNumbers, [1]);
  const repeated = await Promise.all(Array.from({length:4},async()=> (await call(`/fulltext?${parameters}`)).json()));
  assert(repeated.every((item)=>item.cached && item.sourceHash===first.sourceHash && item.usage.total===1));
  assert.equal(metadataCalls, 1);
  assert.equal(await (await call(`/fulltext?${parameters}&raw=true`)).text(), xml);
  assert.equal(metadataCalls, 1);
  const refreshed = await (await call(`/fulltext?${parameters}&refresh=true`)).json();
  assert.equal(refreshed.cached, false);
  assert.equal(refreshed.usage.total, 2);
  assert.equal(metadataCalls, 2);

  const firstPdf = await call(`/pdf?${parameters}&sendNumber=${sendNumber}`);
  assert.equal(firstPdf.status, 200, await firstPdf.clone().text());
  assert.equal(firstPdf.headers.get('X-Document-Cached'), 'false');
  assert((await firstPdf.text()).startsWith('%PDF-'));
  const secondPdf = await call(`/pdf?${parameters}&sendNumber=${sendNumber}`);
  assert.equal(secondPdf.headers.get('X-Document-Cached'), 'true');
  assert.equal(secondPdf.headers.get('X-KIPRIS-API-Calls-Total'), '3');
  assert.equal(pdfCalls, 1);

  const missing = await call('/changes?applicationNumber=1020240093845&cachedOnly=true');
  assert.equal(missing.status, 404);
  const procedural = { documentNumber:amendmentNumber,date:'2025.09.02',title:'[출원서 등 보완]보정서' };
  const noticeDocument = { documentNumber:sendNumber,date:'2025.09.01',title:'의견제출통지서' };
  const summary = { oneLine:'청구항 1-7 진보성 거절',rejectionGrounds:[{provision:'제29조제2항',claimNumbers:[1,2,3,4,5,6,7],reason:'인용발명으로 용이하게 도출됨'}],allowableClaims:[],keyIssues:['위상 지연 보상 구성','지정기간 연장 안내'],affectedClaims:['청구항 1-7'],citedReferences:['KR 10-1862615'],deadlines:['4개월 이내 연장'],requiredActions:['보정 문언 확인','별지 제24호 서식으로 제출'],cautions:['개인정보 기재에 유의'] };
  const documents = [{documentNumber:amendmentNumber,date:'2025.09.02',changes:[{number:1,status:'amended',beforeText:'기존 문언',afterText:'수정 문언'}]}];
  const seeded = await call('/seed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({applicationNumber,sendNumber,noticeSourceHash,summary,fullTextHash:first.sourceHash,fullTextFetchedAt:first.fetchedAt,markdown:'[서지사항]\n[심사결과]\n| 구성 | 출원 | 인용 | 비고 |\n|---|---|---|---|\n| 1 | 변압기\n교류 계통 | 동일 |\n<< 안내 >>\n지정기간연장 안내',patentCase:{bibliography:{claims:first.claims,applicationDate:'2024.07.15'},history:[procedural,noticeDocument],notices:[noticeDocument]},changes:{applicationNumber,documents}})});
  assert.equal(seeded.status, 200, await seeded.clone().text());
  for (const method of ['GET','POST']) {
    const response = await call(`/notice?${parameters}&sendNumber=${sendNumber}`,{method});
    assert.equal(response.status,200,await response.clone().text());
    const analysis = await response.json();
    assert.equal(analysis.cached,true);
    assert(analysis.markdown.includes('변압기<br/>교류 계통'));
    assert(!analysis.markdown.includes('서지사항') && !analysis.markdown.includes('지정기간'));
    assert.equal(analysis.tableWarnings.length,1);
    assert.deepEqual(analysis.summary.deadlines,[]);
    assert.deepEqual(analysis.summary.keyIssues,['위상 지연 보상 구성']);
    assert.deepEqual(analysis.summary.requiredActions,['보정 문언 확인']);
    assert.deepEqual(analysis.summary.cautions,[]);
    assert.equal(analysis.basisStatus,method==='GET'?'unverified':'current','legacy analysis is verified against actual cached PDF bytes on explicit POST');
  }
  assert.equal((await (await call(`/notice?${parameters}&sendNumber=${sendNumber}`)).json()).basisStatus,'current');
  const rejected = await call(`/resolution?${parameters}&sendNumber=${sendNumber}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({noticeSummary:summary,documents})});
  assert.equal(rejected.status,409,await rejected.clone().text());
  const db = await worker.getD1Database('DB');
  const version = await db.prepare('SELECT source_document_number FROM claim_versions WHERE is_current=1').first();
  assert.equal(version.source_document_number,null,'bibliography version must not inherit the procedural amendment number');
  const round = await db.prepare('SELECT documents_json FROM examination_rounds').first();
  assert.equal(JSON.parse(round.documents_json).amendments.length,0);
  assert.equal(JSON.parse(round.documents_json).otherAmendments.length,1);
  const invalidLink = await call(`/round-links?${parameters}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({noticeNumber:sendNumber,opinionNumbers:[],amendmentNumbers:[amendmentNumber],decisionNumbers:[],historyKey:JSON.stringify([[amendmentNumber,'20250902',procedural.title],[sendNumber,'20250901',noticeDocument.title]].sort((a,b)=>a.join('|').localeCompare(b.join('|'))))})});
  assert.equal(invalidLink.status,400,'manual linking must still reject procedural amendments');
  const links = await call(`/round-links?${parameters}`);
  assert.equal(links.status,200);
  assert.deepEqual((await links.json()).links,[]);
  const candidateInput={country:'KR',number:'10-2018-0012345',title:'인식 장치',publicationDate:'2018-01-31',role:'D1 후보',matches:['1A'],notes:'심사관 입력'};
  const candidate = await call(`/candidates?${parameters}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidateInput)});
  assert.equal(candidate.status,200,await candidate.clone().text());
  const savedCandidate=(await candidate.json()).candidates[0];
  assert.equal(savedCandidate.eligible,true);
  assert.equal(savedCandidate.relevance,'미평가');
  assert.equal((await (await call(`/candidates?${parameters}`)).json()).candidates.length,1);
  const excluded=await call(`/candidates?${parameters}&id=${encodeURIComponent(savedCandidate.id)}`,{method:'DELETE'});
  assert.equal((await excluded.json()).candidates.length,0);
  const restored=await call(`/candidates?${parameters}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidateInput)});
  assert.equal((await restored.json()).candidates.length,1,'same number restores soft-excluded candidate');
  const foreign = await call(`/candidates?${parameters}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify(candidateInput)});
  assert.equal(foreign.status,403);
  const budgetBlocked=await call(`/fulltext?${parameters}&refresh=true`);
  assert.equal(budgetBlocked.status,429,await budgetBlocked.clone().text());
  assert.equal((await (await call(`/fulltext?${parameters}&cachedOnly=true`)).json()).usage.total,3,'quota rejection is not counted as a KIPRIS call');
  const aiResponses=await Promise.all(Array.from({length:3},()=>call('/ai-fixture?input=identical')));
  assert(aiResponses.every(response=>response.status===200),'concurrent identical AI requests must share one result');
  assert.equal(openAiCalls,1);
  assert.equal((await call('/ai-fixture?input=identical')).status,409,'D1 cooldown prevents sequential duplicate model calls');
  assert.equal((await call('/ai-fixture?input=second')).status,200);
  const aiBlocked=await call('/ai-fixture?input=third');
  assert.equal(aiBlocked.status,429,await aiBlocked.clone().text());
  assert.equal(openAiCalls,2);
  const budget=await (await call('/budget')).json();
  assert.equal(budget.kipris.used,3);
  assert.equal(budget.openai.used,2);
  const currentSummary = await (await call(`/summary?${parameters}`)).json();
  assert.equal(currentSummary.basisStatus,'current');
  const firstAmendment={documentNumber:'112025000000002',date:'2025.09.02',title:'[명세서 등]보정서',status:''};
  const secondAmendment={documentNumber:'112025000000003',date:'2025.09.03',title:'[명세서 등]보정서',status:''};
  const workflowHistory=[noticeDocument,firstAmendment,secondAmendment,procedural];
  const changeItem={applicationNumber,serialNumber:2,documentNumber:firstAmendment.documentNumber,claimNumber:1,changeTypeCode:'A',changeTypeName:'수정',claimText:'보정 후 문언',previousClaimText:'보정 전 문언',sourceDocumentNumber:null,changeSegments:[]};
  const changeDocument={documentNumber:firstAmendment.documentNumber,serialNumber:2,isInitialFiling:false,sourceDocumentNumber:null,changes:[changeItem],statistics:{total:1,amended:1,deleted:0,inserted:0}};
  assert.equal((await call('/workflow-case',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({patentCase:{bibliography:{claims:first.claims},history:workflowHistory,notices:[noticeDocument]},changes:{applicationNumber,documents:[changeDocument],totalChanges:1}})})).status,200);
  const historyKey=JSON.stringify(workflowHistory.map(item=>[item.documentNumber,item.date.replace(/\D/g,''),item.title]).sort((a,b)=>a.join('|').localeCompare(b.join('|'))));
  const manual=await call(`/round-links?${parameters}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({noticeNumber:sendNumber,opinionNumbers:[],amendmentNumbers:[firstAmendment.documentNumber],decisionNumbers:[],historyKey})});
  assert.equal(manual.status,200,await manual.clone().text());
  assert.deepEqual((await manual.json()).links[0].amendmentNumbers,[firstAmendment.documentNumber]);
  assert.equal((await (await call(`/round-links?${parameters}`)).json()).links.length,1,'manual link persists in D1');
  const partialReview=await call(`/resolution?${parameters}&sendNumber=${sendNumber}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({noticeSummary:summary,documents:[]})});
  assert.equal(partialReview.status,409,'missing linked amendment data must prevent a complete resolution review');
  const changedNoticeReview=await call(`/resolution?${parameters}&sendNumber=${sendNumber}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({noticeSummary:{...summary,allowableClaims:[999]},documents:[changeDocument]})});
  assert.equal(changedNoticeReview.status,409,'client-supplied changed notice summaries must not bypass server provenance');
  const changeResponse=await call(`/changes?${parameters}&cachedOnly=true`);
  assert.equal(changeResponse.status,200,await changeResponse.clone().text());
  const claimVersions=(await changeResponse.json()).versions;
  assert.equal(claimVersions[0].beforeComplete,false);
  assert.equal(claimVersions[0].after[0].text,'보정 후 문언');
  const snapshot=await db.prepare("SELECT claims_json FROM claim_versions WHERE version_key=?").bind(`document-${firstAmendment.documentNumber}-before`).first();
  assert.equal(JSON.parse(snapshot.claims_json).complete,false,'partial snapshots must not become full claim trees');
  assert.equal((await call('/change-case',{method:'POST'})).status,200);
  assert.equal((await (await call(`/round-links?${parameters}`)).json()).links.length,0,'old manual links are not applied after reception history changes');
  const changedSummary = await (await call(`/summary?${parameters}`)).json();
  assert.equal(changedSummary.basisStatus,'changed');
  assert.equal(changedSummary.generatedAt,currentSummary.generatedAt,'checking provenance must not change AI generation time');
  const chunkResponse = await call('/chunks');
  assert.equal(chunkResponse.status,200,await chunkResponse.clone().text());
  const chunk = await chunkResponse.json();
  assert.equal(chunk.length,3_100_001);
  assert.equal(chunk.hash,chunk.expected);
  assert.equal(chunk.last,3_100_000%251);
  assert.equal(metadataCalls,2);
  assert.equal(pdfCalls,1);
  console.log('API/D1 integration passed: cached originals, legacy PDF provenance, candidate persistence/restore, safe linkage, same-origin checks, daily quotas, AI single-flight/cooldown, 3.1MB roundtrip. No real API calls.');
} finally {
  await worker.dispose();
  await mock.close();
}
