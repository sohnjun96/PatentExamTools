export type CandidateDocument = {
  id: string; country: string; number: string; title: string;
  applicationDate: string; publicationDate: string; applicant: string;
  relevance: '높음' | '보통' | '낮음' | '미평가'; wording: '직접' | '유사' | '미확인';
  eligible: boolean | null; matches: string[]; role: 'D1 후보' | 'D2 후보' | '보류';
  sourceUrl?: string; notes?: string;
};
export function normalizeCandidate(input: Partial<CandidateDocument>, referenceDate: string): CandidateDocument {
  const number = (input.number ?? '').trim().toUpperCase();
  const country = (input.country ?? 'KR').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z0-9 .\/-]{4,60}$/u.test(number) || number.replace(/\D/g, '').length < 4) throw new Error('문헌번호와 국가 코드를 확인해 주세요.');
  const date = (value: string | undefined) => {
    if (!value) return '';
    const normalized = value.replace(/\D/g, '');
    if (!/^\d{8}$/.test(normalized)) throw new Error('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
    const actual = new Date(`${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6)}T00:00:00Z`);
    if (Number.isNaN(actual.getTime()) || actual.toISOString().slice(0, 10).replace(/-/g, '') !== normalized) throw new Error('유효한 날짜를 입력해 주세요.');
    return normalized;
  };
  const publicationDate = date(input.publicationDate);
  const cutoff = referenceDate.replace(/\D/g, '');
  let sourceUrl = '';
  if (input.sourceUrl?.trim()) {
    if (input.sourceUrl.length > 2000) throw new Error('원문 링크는 2,000자 이내로 입력해 주세요.');
    const url = new URL(input.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('원문 링크는 HTTPS 주소를 입력해 주세요.');
    sourceUrl = url.toString();
  }
  return {
    id: `${country}:${number.replace(/[^A-Z0-9]/g, '')}`, country, number,
    title: (input.title ?? '').trim().slice(0, 500) || '명칭 미입력',
    applicationDate: date(input.applicationDate), publicationDate,
    applicant: (input.applicant ?? '').trim().slice(0, 300),
    relevance: '미평가', wording: '미확인',
    eligible: publicationDate && cutoff.length === 8 ? publicationDate <= cutoff : null,
    matches: Array.isArray(input.matches) ? input.matches.filter((id) => /^\d+[A-Z]+$/.test(id)).slice(0, 40) : [],
    role: ['D1 후보', 'D2 후보', '보류'].includes(input.role ?? '') ? input.role! : '보류',
    sourceUrl, notes: (input.notes ?? '').trim().slice(0, 4000),
  };
}
