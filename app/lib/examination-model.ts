export type ClaimLike = {
  number: number;
  text: string;
};

export type ClaimAnalysis = ClaimLike & {
  isIndependent: boolean;
  directReferences: number[];
  multipleDependent: boolean;
  depth: number;
  rootClaims: number[];
  children: number[];
  errors: string[];
};

export type HistoryLike = {
  documentNumber: string;
  date: string;
  title: string;
  status: string;
};

export type ExaminationRound<T extends HistoryLike = HistoryLike> = {
  number: number;
  notice: T;
  opinions: T[];
  amendments: T[];
  decisions: T[];
  otherDocuments: T[];
  connectionStatus: 'linked' | 'needs_confirmation';
  connectionReason: string;
};

export type CaseLifecycle = {
  code:
    | 'initial_review'
    | 'under_examination'
    | 'response_period'
    | 'reexamination_after_amendment'
    | 'registered_closed'
    | 'rejected_closed'
    | 'needs_confirmation';
  label: string;
  reason: string;
  tone: 'information' | 'warning' | 'success' | 'danger' | 'neutral';
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function referencePreamble(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!/^(?:제\s*\d+\s*항|청구항\s*(?:제\s*)?\d+)/.test(normalized)) return '';
  const cue = normalized.search(
    /(?:에\s*있어서|에\s*따른|에\s*기재된|을\s*인용하는|중\s*(?:어느|임의의|선택되는)\s*한\s*항)/,
  );
  return normalized.slice(0, cue >= 0 ? Math.min(cue + 40, 320) : 180);
}

function referencedClaims(text: string) {
  const preamble = referencePreamble(text);
  if (!preamble) return { references: [] as number[], multiple: false };

  const references: number[] = [];
  const rangePattern = /제\s*(\d+)\s*항\s*(?:내지|부터|~|〜|-)\s*(?:제\s*)?(\d+)\s*항/g;
  for (const match of preamble.matchAll(rangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start > 0 && end >= start && end - start <= 100) {
      for (let number = start; number <= end; number += 1) references.push(number);
    }
  }

  for (const match of preamble.matchAll(/(?:제\s*|청구항\s*(?:제\s*)?)(\d+)\s*항?/g)) {
    references.push(Number(match[1]));
  }

  const result = uniqueNumbers(references.filter((number) => Number.isFinite(number)));
  return {
    references: result,
    multiple:
      result.length > 1 ||
      /(?:내지|부터|중\s*(?:어느|임의의|선택되는)\s*한\s*항|각\s*항)/.test(preamble),
  };
}

export function analyzeClaims(claims: ClaimLike[]): ClaimAnalysis[] {
  const ordered = [...claims].sort((left, right) => left.number - right.number);
  const claimNumbers = new Set(ordered.map((claim) => claim.number));
  const references = new Map<number, ReturnType<typeof referencedClaims>>();
  const errors = new Map<number, string[]>();

  for (const claim of ordered) {
    const parsed = referencedClaims(claim.text);
    references.set(claim.number, parsed);
    const claimErrors: string[] = [];
    for (const reference of parsed.references) {
      if (!claimNumbers.has(reference)) claimErrors.push(`인용한 청구항 ${reference}이 없습니다.`);
      if (reference >= claim.number) claimErrors.push(`청구항 ${reference}을 선행항으로 인용할 수 없습니다.`);
    }
    errors.set(claim.number, claimErrors);
  }

  for (const claim of ordered) {
    const parsed = references.get(claim.number)!;
    if (
      parsed.multiple &&
      parsed.references.some((reference) => references.get(reference)?.multiple)
    ) {
      errors.get(claim.number)!.push('다중종속항이 다른 다중종속항을 인용합니다.');
    }
  }

  const depths = new Map<number, number>();
  const roots = new Map<number, number[]>();
  const visit = (number: number, path: number[] = []): { depth: number; roots: number[] } => {
    if (path.includes(number)) {
      errors.get(number)?.push('청구항 인용관계가 순환합니다.');
      return { depth: 0, roots: [] };
    }
    if (depths.has(number)) {
      return { depth: depths.get(number)!, roots: roots.get(number) ?? [] };
    }
    const parsed = references.get(number);
    if (!parsed?.references.length) {
      depths.set(number, 0);
      roots.set(number, [number]);
      return { depth: 0, roots: [number] };
    }
    const validParents = parsed.references.filter(
      (reference) => claimNumbers.has(reference) && reference < number,
    );
    if (!validParents.length) {
      depths.set(number, 1);
      roots.set(number, []);
      return { depth: 1, roots: [] };
    }
    const parents = validParents.map((reference) => visit(reference, [...path, number]));
    const depth = 1 + Math.max(...parents.map((parent) => parent.depth));
    const rootClaims = uniqueNumbers(parents.flatMap((parent) => parent.roots));
    depths.set(number, depth);
    roots.set(number, rootClaims);
    return { depth, roots: rootClaims };
  };

  const children = new Map<number, number[]>();
  for (const claim of ordered) {
    for (const reference of references.get(claim.number)!.references) {
      if (!claimNumbers.has(reference)) continue;
      children.set(reference, [...(children.get(reference) ?? []), claim.number]);
    }
    visit(claim.number);
  }

  return ordered.map((claim) => {
    const parsed = references.get(claim.number)!;
    return {
      ...claim,
      isIndependent: parsed.references.length === 0,
      directReferences: parsed.references,
      multipleDependent: parsed.multiple,
      depth: depths.get(claim.number) ?? 0,
      rootClaims: roots.get(claim.number) ?? [],
      children: uniqueNumbers(children.get(claim.number) ?? []),
      errors: [...new Set(errors.get(claim.number) ?? [])],
    };
  });
}

function historyOrder<T extends HistoryLike>(left: T, right: T) {
  return (
    digits(left.date).localeCompare(digits(right.date)) ||
    left.documentNumber.localeCompare(right.documentNumber)
  );
}

function isNotice(item: HistoryLike) {
  return /의견제출통지서/.test(item.title);
}

function isOpinion(item: HistoryLike) {
  return /의견서|답변서|소명서/.test(item.title) && !isNotice(item);
}

function isAmendment(item: HistoryLike) {
  return /보정서/.test(item.title);
}

function isDecision(item: HistoryLike) {
  return /거절결정|특허결정|등록결정|심결|결정서/.test(item.title);
}

export function buildExaminationRounds<T extends HistoryLike>(
  history: T[],
  notices: T[] = history.filter(isNotice),
): ExaminationRound<T>[] {
  const orderedHistory = [...history].sort(historyOrder);
  const orderedNotices = [...notices].sort(historyOrder);

  return orderedNotices.map((notice, index) => {
    const nextNotice = orderedNotices[index + 1];
    const noticeDate = digits(notice.date);
    const nextDate = nextNotice ? digits(nextNotice.date) : null;
    const documents = orderedHistory.filter((item) => {
      if (item.documentNumber === notice.documentNumber || isNotice(item)) return false;
      const date = digits(item.date);
      return date >= noticeDate && (!nextDate || date < nextDate);
    });
    const opinions = documents.filter(isOpinion);
    const amendments = documents.filter(isAmendment);
    const decisions = documents.filter(isDecision);
    const classified = new Set([...opinions, ...amendments, ...decisions].map((item) => item.documentNumber));
    const otherDocuments = documents.filter((item) => !classified.has(item.documentNumber));
    const ambiguous = opinions.length > 1 || amendments.length > 1;
    const hasResponse = opinions.length > 0 || amendments.length > 0 || decisions.length > 0;

    return {
      number: index + 1,
      notice,
      opinions,
      amendments,
      decisions,
      otherDocuments,
      connectionStatus: hasResponse && !ambiguous ? 'linked' : 'needs_confirmation',
      connectionReason: !hasResponse
        ? '통지 이후 연결할 의견서·보정서·결정이 확인되지 않았습니다.'
        : ambiguous
          ? '같은 회차 범위에 복수의 의견서 또는 보정서가 있어 연결 확인이 필요합니다.'
          : '문서일자 범위와 문서 종류를 기준으로 연결했습니다.',
    };
  });
}

export function classifyCaseLifecycle(
  patentCase: {
    status: string;
    registrationNumber: string;
    registrationDate: string;
    registrationStatus: string;
    examinationRequestDate: string;
    history: HistoryLike[];
  },
): CaseLifecycle {
  const ordered = [...patentCase.history].sort(historyOrder);
  const latest = ordered.at(-1);
  const combinedStatus = `${patentCase.status} ${patentCase.registrationStatus}`;
  const hasRegistrationIdentifier = digits(patentCase.registrationNumber).length >= 7;
  const hasRegistrationDate = digits(patentCase.registrationDate).length === 8;

  if (
    hasRegistrationIdentifier ||
    hasRegistrationDate ||
    /특허결정|등록결정|설정등록|등록종결/.test(combinedStatus) ||
    ordered.some((item) => /특허결정|등록결정|설정등록/.test(item.title))
  ) {
    return {
      code: 'registered_closed',
      label: '등록 종결',
      reason: '등록번호·등록일 또는 등록 결정 이력이 확인됩니다.',
      tone: 'success',
    };
  }
  if (
    /거절결정|거절종결|최종거절|포기|취하/.test(combinedStatus) ||
    ordered.some((item) => /거절결정|포기서|취하서/.test(item.title))
  ) {
    return {
      code: 'rejected_closed',
      label: '거절 종결',
      reason: '거절 결정 또는 출원 포기·취하 이력이 확인됩니다.',
      tone: 'danger',
    };
  }

  const latestNotice = [...ordered].reverse().find(isNotice);
  if (latestNotice) {
    const noticeDate = digits(latestNotice.date);
    const afterNotice = ordered.filter(
      (item) => digits(item.date) >= noticeDate && item.documentNumber !== latestNotice.documentNumber,
    );
    const hasResponse = afterNotice.some((item) => isOpinion(item) || isAmendment(item));
    if (!hasResponse && (!latest || digits(latest.date) <= noticeDate)) {
      return {
        code: 'response_period',
        label: '의견제출기간',
        reason: '최근 의견제출통지 이후 의견서 또는 보정서가 확인되지 않습니다.',
        tone: 'warning',
      };
    }
    if (hasResponse) {
      return {
        code: 'reexamination_after_amendment',
        label: '보정 후 재심사',
        reason: '최근 통지 이후 의견서 또는 보정서가 접수되었습니다.',
        tone: 'information',
      };
    }
  }

  if (/심사\s*(진행|중)|심사착수/.test(combinedStatus)) {
    return {
      code: 'under_examination',
      label: '심사 진행 중',
      reason: '서지정보에서 심사 진행 상태가 확인됩니다.',
      tone: 'information',
    };
  }
  if (digits(patentCase.examinationRequestDate).length === 8 || ordered.some((item) => /심사청구/.test(item.title))) {
    return {
      code: 'initial_review',
      label: '최초심사 준비',
      reason: '심사청구가 확인되며 아직 의견제출통지 이력이 없습니다.',
      tone: 'neutral',
    };
  }
  return {
    code: 'needs_confirmation',
    label: '상태 확인 필요',
    reason: '현재 상태를 확정할 충분한 서지·이력 정보가 없습니다.',
    tone: 'warning',
  };
}
