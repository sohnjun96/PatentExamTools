import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's native TypeScript test runner requires the .ts extension.
import { parseDocumentRequest, validatedDocumentUrl, assertPdfBytes, createPatentDocumentService } from '../app/lib/patent-document.ts';

const fileUrl = 'https://plus.kipris.or.kr/openapi/fileToss.jsp?arg=opaque';
const request = { number: '1020200093844', numberType: 'application', kind: 'publication' } as const;
const metadata = `<response><header><resultCode>00</resultCode></header><body><items><item><docName>original.pdf</docName><path>${fileUrl.replace('&', '&amp;')}</path></item></items></body></response>`;

test('number type is explicit; KR kind codes and formatted numbers are normalized', () => {
  assert.throws(() => parseDocumentRequest(new URLSearchParams({ documentNumber: '10-2022-0014141' })), /선택/);
  assert.deepEqual(parseDocumentRequest(new URLSearchParams({ documentNumber: 'KR 10-2022-0014141 A1', numberType: 'publication' })),
    { number: '1020220014141', numberType: 'publication', kind: 'publication' });
  assert.equal(parseDocumentRequest(new URLSearchParams({ documentNumber: 'KR 10-2345678 B1', numberType: 'registration', kind: 'registration' })).number, '1023456780000');
  assert.throws(() => parseDocumentRequest(new URLSearchParams({ applicationNumber: 'US12345678901' })), /한국/);
});

test('upstream file URLs are restricted to exact KIPRIS host and file proxy paths', () => {
  assert.equal(validatedDocumentUrl(fileUrl.replace('https:', 'http:')), fileUrl);
  for (const url of ['https://evil.test/openapi/fileToss.jsp?arg=x', 'https://plus.kipris.or.kr.evil.test/openapi/fileToss.jsp?arg=x',
    'https://plus.kipris.or.kr/other?arg=x', 'https://user:password@plus.kipris.or.kr/openapi/fileToss.jsp?arg=x',
    'https://plus.kipris.or.kr:8443/openapi/fileToss.jsp?arg=x']) {
    assert.throws(() => validatedDocumentUrl(url), /허용되지/);
  }
});

test('actual PDF signature is required, even when the upstream advertises PDF', () => {
  assert.doesNotThrow(() => assertPdfBytes(new TextEncoder().encode('%PDF-1.7\ncontent')));
  assert.throws(() => assertPdfBytes(new TextEncoder().encode('<error>not authorized</error>')), /다른 형식/);
});

test('publication download uses the PDF operation, access key stays upstream, redirects are rejected', async () => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  const service = createPatentDocumentService({ accessKey: 'test-secret', fetcher: (async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return calls.length === 1 ? new Response(metadata) : new Response('%PDF-1.7\nverified');
  }) as typeof fetch });
  const result = await service.download(request);
  assert.equal(result.fileName, '1020200093844_publication.pdf');
  assert.match(calls[0].url, /getPubFullTextInfoSearch/);
  assert.match(calls[0].url, /\/kipo-api\/kipi\/patUtiModInfoSearchSevice\//);
  assert.match(calls[0].url, /ServiceKey=test-secret/);
  assert.equal(calls[1].url, fileUrl);
  assert.equal(calls[1].init?.redirect, 'manual');
  assert.equal(new TextDecoder().decode(result.bytes), '%PDF-1.7\nverified');
});

test('registration download uses the distinct grant PDF operation', async () => {
  let operation = '';
  const service = createPatentDocumentService({ accessKey: 'test', fetcher: (async input => {
    const url = String(input);
    if (url.includes('InfoSearch')) { operation = url; return new Response(metadata); }
    return new Response('%PDF-1.6\n');
  }) as typeof fetch });
  await service.download({ ...request, kind: 'registration' });
  assert.match(operation, /getAnnFullTextInfoSearch/);
});

test('unavailable PDF, incorrect application and XML masquerading as PDF fail clearly', async () => {
  const absent = createPatentDocumentService({ accessKey: 'test', fetcher: (async () => new Response('<response><body><items/></body></response>')) as typeof fetch });
  await assert.rejects(() => absent.download(request), /제공되지/);
  const wrong = createPatentDocumentService({ accessKey: 'test', fetcher: (async () => new Response(metadata.replace('<docName>', '<applicationNumber>1020200099999</applicationNumber><docName>'))) as typeof fetch });
  await assert.rejects(() => wrong.download(request), /일치하지/);
  let call = 0;
  const xml = createPatentDocumentService({ accessKey: 'test', fetcher: (async () => new Response(++call === 1 ? metadata : '<error/>', { headers: { 'Content-Type': 'application/pdf' } })) as typeof fetch });
  await assert.rejects(() => xml.download(request), /다른 형식/);
});

test('publication lookup uses the documented request and PascalCase response fields', async () => {
  const payload = `<response><body><items><PatentUtilityInfo><ApplicationNumber>1020200093844</ApplicationNumber><OpeningNumber>1020220014141</OpeningNumber></PatentUtilityInfo><PatentUtilityInfo><ApplicationNumber>1020200000000</ApplicationNumber><OpeningNumber>1020220099999</OpeningNumber></PatentUtilityInfo></items></body></response>`;
  let requestUrl = '';
  const service = createPatentDocumentService({ accessKey: 'test', fetcher: (async input => { requestUrl = String(input); return new Response(payload); }) as typeof fetch });
  assert.equal(await service.resolveApplicationNumber({ number: '1020220014141', numberType: 'publication', kind: 'publication' }), '1020200093844');
  assert.match(requestUrl, /\/openapi\/rest\//);
  assert.match(requestUrl, /docsStart=1/);
  assert.match(requestUrl, /openNumber=1020220014141/);
  await assert.rejects(() => service.resolveApplicationNumber({ number: '1020220014142', numberType: 'publication', kind: 'publication' }), /정확히 일치/);
});

test('registration lookup uses registerNumber and RegistrationNumber from official schema', async () => {
  const service = createPatentDocumentService({ accessKey: 'test', fetcher: (async input => {
    assert.match(String(input), /registerNumber=1023456780000/);
    return new Response('<response><body><items><PatentUtilityInfo><ApplicationNumber>1020200093844</ApplicationNumber><RegistrationNumber>1023456780000</RegistrationNumber></PatentUtilityInfo></items></body></response>');
  }) as typeof fetch });
  assert.equal(await service.resolveApplicationNumber({ number: '1023456780000', numberType: 'registration', kind: 'registration' }), '1020200093844');
});

test('PDF download is bounded when Content-Length is oversized or absent', async () => {
  for (const announced of [true, false]) {
    let call = 0;
    const service = createPatentDocumentService({ accessKey: 'test', fetcher: (async () => {
      if (++call === 1) return new Response(metadata);
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array(33 * 1024 * 1024)); controller.close();
      } }), announced ? { headers: { 'Content-Length': String(33 * 1024 * 1024) } } : undefined);
    }) as typeof fetch });
    await assert.rejects(() => service.download(request), /허용 크기/);
  }
});

test('raw upstream errors cannot leak the key to a client', async () => {
  const service = createPatentDocumentService({ accessKey: 'test-secret', fetcher: (async () => new Response('<response><header><resultCode>99</resultCode><resultMsg>accessKey=test-secret</resultMsg></header></response>')) as typeof fetch });
  await assert.rejects(() => service.download(request), error => error instanceof Error && !error.message.includes('test-secret'));
});
