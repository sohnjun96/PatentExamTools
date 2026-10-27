import assert from 'node:assert/strict';
import { literatureLink } from '../app/lib/literature-link.ts';

function patent(input, expected) {
  const result = literatureLink(input);
  assert.equal(result.kind, 'patent', input);
  const url = new URL(result.href);
  assert.equal(url.hostname, 'patents.google.com');
  assert.equal(url.searchParams.get('q'), expected, input);
}

// Only the KIPRIS rights code before a publication year is removed.
patent('KR1020200000000A', 'KR20200000000A');
patent('KR 10-2020-0000000 A1', 'KR20200000000A1');
patent('10-2020-0000000', 'KR20200000000');
patent('1020200000000', 'KR20200000000');
patent('kr10-1999-0123456 a', 'KR19990123456A');
patent('KR20200000000A', 'KR20200000000A');
patent('KR2020000000A', 'KR2020000000A');
patent('KR102345678B1', 'KR102345678B1');
patent('KR1020200000000B1', 'KR1020200000000B1');
patent('10-2345678 B1', 'KR102345678B1');
patent('US 10,123,456 B2', 'US10123456B2');
patent('US20200000001A1', 'US20200000001A1');
patent('US D123456 S1', 'USD123456S1');
patent('WO 2020/123456 A1', 'WO2020123456A1');
patent('EP 1234567 B1', 'EP1234567B1');
patent('JP2020-123456A', 'JP2020123456A');
patent('1234567', '1234567');

const paperTitle = '10 methods for patent retrieval: KR1020200000000A (2020)';
for (const input of [paperTitle, 'Attention Is All You Need', '김연구 외, 문헌 검색 방법, 학술지 12(3), 2020', '2020', 'AI2020123456', 'KR1020200000000A에 관한 연구']) {
  const result = literatureLink(input);
  const url = new URL(result.href);
  assert.equal(result.kind, 'paper', input);
  assert.equal(url.hostname, 'scholar.google.com');
  assert.equal(url.searchParams.get('q'), input);
}
assert.equal(literatureLink('  10.1038/s41586-020-2649-2  ').href, 'https://doi.org/10.1038/s41586-020-2649-2');
assert.equal(literatureLink('doi: 10.1000/182').href, 'https://doi.org/10.1000/182');
assert.equal(literatureLink('DOI:10.1002/(SICI)1234<5>:A?B#C').href, 'https://doi.org/10.1002/(SICI)1234%3C5%3E%3AA%3FB%23C');
assert.equal(literatureLink('10.1038/s41586-020-2649-2').kind, 'paper');
for (const input of ['https://doi.org/10.1000/182', 'https://arxiv.org/abs/1706.03762', 'http://example.org/paper?id=10&year=2020#abstract']) {
  const result = literatureLink(input);
  assert.equal(result.kind, 'url');
  assert.equal(result.href, input);
}
for (const input of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://example.org/paper\n<script>', '//example.org/paper', 'https://', 'https://user:password@example.org/paper']) {
  const result = literatureLink(input);
  const url = new URL(result.href);
  assert.equal(result.kind, 'paper');
  assert.equal(url.hostname, 'scholar.google.com');
  assert.equal(url.searchParams.get('q'), input.trim());
}
assert.equal(new URL(literatureLink('논문 제목 & 다른 제목? #1').href).searchParams.get('q'), '논문 제목 & 다른 제목? #1');
console.log('Literature links passed: Korean publication normalization, registration/foreign preservation, DOI and HTTP(S) links, paper searches and unsafe-input boundaries.');
