import { documentErrorMessage, ensureDocumentTaskActive } from './document-jobs';

export type PublicationOutcome = { applicationNumber: string; success: boolean; message: string };

/** AI methods and different examiners can share a target; include each application once. */
export function uniquePublicationTargets(numbers: string[]) {
  return [...new Map(numbers.map(number => [number.replace(/[\s-]/g, ''), number])).values()];
}

export async function collectTargetPublications(options: {
  applicationNumbers: string[];
  signal: AbortSignal;
  fetchPdf: (number: string, signal: AbortSignal) => Promise<Blob>;
  addFile: (filename: string, blob: Blob) => void;
  onProgress: (completed: number, total: number) => void;
}) {
  const targets = uniquePublicationTargets(options.applicationNumbers);
  const outcomes: PublicationOutcome[] = [];
  for (const number of targets) {
    ensureDocumentTaskActive(options.signal);
    try {
      const blob = await options.fetchPdf(number, options.signal);
      ensureDocumentTaskActive(options.signal);
      const canonical = number.replace(/[\s-]/g, '');
      if (!/^(10|20)\d{11}$/.test(canonical)) throw new Error('문헌번호를 확인해 주세요.');
      options.addFile(`${canonical}_공개공보.pdf`, blob);
      outcomes.push({ applicationNumber: number, success: true, message: '' });
    } catch (error) {
      ensureDocumentTaskActive(options.signal);
      outcomes.push({ applicationNumber: number, success: false, message: documentErrorMessage(error) });
    }
    options.onProgress(outcomes.length, targets.length);
  }
  return outcomes;
}
