import { XMLParser } from 'fast-xml-parser';

export type ClaimChangeSegment = {
  type: 'unchanged' | 'inserted' | 'deleted' | 'lineBreak';
  text: string;
};

export type ClaimChangeItem = {
  applicationNumber: string;
  serialNumber: number;
  documentNumber: string;
  claimNumber: number;
  changeTypeCode: string;
  changeTypeName: string;
  claimText: string;
  previousClaimText: string | null;
  sourceDocumentNumber: string | null;
  changeSegments: ClaimChangeSegment[];
};

export type ClaimChangeDocument = {
  serialNumber: number;
  documentNumber: string;
  sourceDocumentNumber: string | null;
  isInitialFiling: boolean;
  changes: ClaimChangeItem[];
  statistics: {
    total: number;
    inserted: number;
    amended: number;
    deleted: number;
  };
};

export type ClaimChangeHistory = {
  applicationNumber: string;
  documents: ClaimChangeDocument[];
  totalChanges: number;
};

type OrderedNode = Record<string, unknown>;

const orderedParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});

const statusParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNodes(value: unknown): OrderedNode[] {
  return Array.isArray(value) ? value as OrderedNode[] : [];
}

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function collectElements(nodes: OrderedNode[], name: string, result: OrderedNode[][] = []) {
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key === name && Array.isArray(value)) result.push(value as OrderedNode[]);
      if (Array.isArray(value)) collectElements(value as OrderedNode[], name, result);
    }
  }
  return result;
}

function directField(nodes: OrderedNode[], name: string) {
  for (const node of nodes) {
    const value = node[name];
    if (Array.isArray(value)) return value as OrderedNode[];
  }
  return [];
}

function appendSegment(
  segments: ClaimChangeSegment[],
  type: ClaimChangeSegment['type'],
  text: string,
) {
  if (!text) return;
  const previous = segments.at(-1);
  if (type !== 'lineBreak' && previous?.type === type) {
    previous.text += text;
    return;
  }
  segments.push({ type, text });
}

function segmentsFromNodes(
  nodes: OrderedNode[],
  inheritedType: ClaimChangeSegment['type'] = 'unchanged',
  result: ClaimChangeSegment[] = [],
) {
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '#text') {
        appendSegment(result, inheritedType, scalar(value).replace(/\r/g, ''));
      } else if (key.toLowerCase() === 'br') {
        appendSegment(result, 'lineBreak', '\n');
      } else if (Array.isArray(value)) {
        const type = key.toLowerCase() === 'ins'
          ? 'inserted'
          : key.toLowerCase() === 'del'
            ? 'deleted'
            : inheritedType;
        segmentsFromNodes(value as OrderedNode[], type, result);
      }
    }
  }
  return result;
}

function plainText(nodes: OrderedNode[]) {
  return segmentsFromNodes(nodes)
    .map((segment) => segment.text)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeSegments(segments: ClaimChangeSegment[]) {
  return segments
    .map((segment) => ({ ...segment, text: segment.text.replace(/\r/g, '') }))
    .filter((segment) => segment.type === 'lineBreak' || segment.text.length > 0);
}

function resultStatus(xml: string) {
  const parsed = asRecord(statusParser.parse(xml));
  const response = asRecord(parsed.response);
  const header = asRecord(response.header);
  return {
    code: scalar(header.resultCode),
    message: scalar(header.resultMsg),
  };
}

export function parseClaimChangeHistoryXml(xml: string): ClaimChangeHistory {
  const status = resultStatus(xml);
  if (status.code && status.code !== '00') {
    throw new Error(status.message || `KIPRIS Plus 오류 코드 ${status.code}`);
  }

  const ordered = asNodes(orderedParser.parse(xml));
  const itemNodes = collectElements(ordered, 'amendmentHistoryDetailInfo');
  const rawItems = itemNodes.map((nodes) => {
    const applicationNumber = plainText(directField(nodes, 'applicationNumber')).replace(/\D/g, '');
    const serialNumber = Number(plainText(directField(nodes, 'receiptSendSerialNumber')) || 0);
    const documentNumber = plainText(directField(nodes, 'receiptSendNumber')).replace(/\D/g, '');
    const claimNumber = Number(plainText(directField(nodes, 'petitionclauseNumber')) || 0);
    const changeTypeCode = plainText(directField(nodes, 'changeTypeCode')).toUpperCase();
    const changeTypeName = plainText(directField(nodes, 'changeTypeName'));
    const claimText = plainText(directField(nodes, 'petitionclause'));
    const sourceDocumentNumber = plainText(directField(nodes, 'transferReceiptDocNumber')).replace(/\D/g, '');
    const changeSegments = normalizeSegments(
      segmentsFromNodes(directField(nodes, 'transferPetitionclause')),
    );
    return {
      applicationNumber,
      serialNumber,
      documentNumber,
      claimNumber,
      changeTypeCode,
      changeTypeName,
      claimText,
      sourceDocumentNumber,
      changeSegments,
    };
  }).filter((item) => item.documentNumber && item.claimNumber > 0);

  rawItems.sort((left, right) =>
    left.serialNumber - right.serialNumber ||
    left.claimNumber - right.claimNumber ||
    left.documentNumber.localeCompare(right.documentNumber));

  const versionByDocumentAndClaim = new Map<string, string>();
  const latestClaimVersion = new Map<number, { text: string; documentNumber: string }>();
  const normalizedItems: ClaimChangeItem[] = rawItems.map((item) => {
    const transferredText = item.sourceDocumentNumber
      ? versionByDocumentAndClaim.get(`${item.sourceDocumentNumber}:${item.claimNumber}`)
      : undefined;
    const latestVersion = latestClaimVersion.get(item.claimNumber);
    const previousClaimText = transferredText ?? latestVersion?.text ?? null;
    const effectiveSourceDocumentNumber = item.sourceDocumentNumber
      || latestVersion?.documentNumber
      || null;
    let changeSegments = item.changeSegments;

    if (!changeSegments.length && item.changeTypeCode === 'D' && previousClaimText) {
      changeSegments = [{ type: 'deleted', text: previousClaimText }];
    } else if (!changeSegments.length && item.changeTypeCode === 'I' && item.claimText) {
      changeSegments = [{ type: 'inserted', text: item.claimText }];
    } else if (!changeSegments.length && item.claimText) {
      changeSegments = [{ type: 'unchanged', text: item.claimText }];
    }

    if (item.changeTypeCode === 'D') {
      latestClaimVersion.delete(item.claimNumber);
    } else if (item.claimText) {
      latestClaimVersion.set(item.claimNumber, {
        text: item.claimText,
        documentNumber: item.documentNumber,
      });
      versionByDocumentAndClaim.set(`${item.documentNumber}:${item.claimNumber}`, item.claimText);
    }

    return {
      ...item,
      previousClaimText,
      sourceDocumentNumber: effectiveSourceDocumentNumber,
      changeSegments,
    };
  });

  const grouped = new Map<string, ClaimChangeItem[]>();
  for (const item of normalizedItems) {
    grouped.set(item.documentNumber, [...(grouped.get(item.documentNumber) ?? []), item]);
  }

  const documents = [...grouped.entries()]
    .map(([documentNumber, changes]) => ({ documentNumber, changes }))
    .sort((left, right) =>
      left.changes[0].serialNumber - right.changes[0].serialNumber ||
      left.documentNumber.localeCompare(right.documentNumber))
    .map(({ documentNumber, changes }, index, documentsInOrder): ClaimChangeDocument => {
      const sourceDocumentNumber = changes.find((item) => item.sourceDocumentNumber)?.sourceDocumentNumber
        ?? documentsInOrder[index - 1]?.documentNumber
        ?? null;
      return {
        serialNumber: changes[0].serialNumber,
        documentNumber,
        sourceDocumentNumber,
        isInitialFiling: index === 0,
        changes,
        statistics: {
          total: changes.length,
          inserted: changes.filter((item) => item.changeTypeCode === 'I').length,
          amended: changes.filter((item) => item.changeTypeCode === 'A').length,
          deleted: changes.filter((item) => item.changeTypeCode === 'D').length,
        },
      };
    });

  return {
    applicationNumber: normalizedItems[0]?.applicationNumber ?? '',
    documents,
    totalChanges: normalizedItems.length,
  };
}
