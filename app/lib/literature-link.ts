export type LiteratureLink = { href: string; title: string; kind: 'patent' | 'paper' | 'url' };

const countryNumber = /^(?:KR|US|WO|EP|JP|CN|DE|GB|FR|AU|CA|TW|IN|RU|ES|IT|CH|AT|SE|FI|NL|BE|DK|NO|NZ|ZA|BR|MX|IL|SG|HK|MY|TH|ID|PH|VN|AR|CL|CO|PE|PT|PL|CZ|HU|RO|BG|GR|TR|UA|SU|EA|AP|OA|GC)(?:D|RE|PP)?\d{4,16}(?:[A-Z]\d{0,2})?$/;
const controls = /[\u0000-\u001f\u007f-\u009f]/;

/** Normalize only a recognizable patent identifier, never a title or citation. */
function patentQuery(value: string): string | null {
  const compact = value.toUpperCase().replace(/[\s,./-]/g, '');
  // Korean publication identifiers in KIPRIS include the rights code 10 before
  // YYYY + seven serial digits; Google Patents omits it for A publications.
  // B/Y registration identifiers retain their rights code, regardless of length.
  const publication = /^(?:KR)?10((?:19|20)\d{2}\d{7})(A\d?)?$/.exec(compact);
  if (publication) return `KR${publication[1]}${publication[2] || ''}`;
  if (countryNumber.test(compact)) return compact;
  // A domestic formatted registration number has an unambiguous KR rights code.
  if (/^(?:10|20)-\d{7}(?:-?0000)?(?:\s*[BY]\d?)?$/i.test(value)) return `KR${compact}`;
  // A bare number can still be searched as a patent, but a year or arbitrary
  // prose must not be mistaken for one. Its jurisdiction is left unspecified.
  return /^\d{7,13}(?:[ABUY]\d?)?$/.test(compact) ? compact : null;
}

/** Keep authored display/storage values intact while choosing their destination. */
export function literatureLink(value: string): LiteratureLink {
  const input = value.trim();
  if (/^https?:\/\/\S+$/i.test(input) && !controls.test(input)) {
    try {
      const url = new URL(input);
      if (url.hostname && !url.username && !url.password) return {
        href: url.href, title: '새 창에서 문헌 원문 열기', kind: 'url',
      };
    } catch { /* A malformed URL is searched as the original citation below. */ }
  }
  const doi = input.replace(/^doi\s*:\s*/i, '');
  if (/^10\.\d{4,9}(?:\.\d+)*\/\S+$/i.test(doi) && !controls.test(doi)) return {
    href: `https://doi.org/${doi.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`,
    title: '새 창에서 DOI 문헌 열기', kind: 'paper',
  };
  const patent = !controls.test(input) ? patentQuery(input) : null;
  if (patent) return {
    href: `https://patents.google.com/?q=${encodeURIComponent(patent)}`,
    title: '새 창에서 특허 문헌 검색', kind: 'patent',
  };
  return {
    href: `https://scholar.google.com/scholar?q=${encodeURIComponent(input)}`,
    title: '새 창에서 논문 검색', kind: 'paper',
  };
}
