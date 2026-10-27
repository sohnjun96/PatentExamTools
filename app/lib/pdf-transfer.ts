export type PdfTransferStage = 'choosing' | 'loading' | 'saving';
export type PdfTransferDestination = { handle: unknown | null; filename: string };
export type PdfTransferResult = { status: 'saved' | 'requested'; message: string } | { status: 'cancelled'; message: string };

export class PdfTransferFailure extends Error {
  stage: PdfTransferStage;
  originalError: unknown;
  constructor(stage: PdfTransferStage, originalError: unknown) {
    super('PDF transfer failed');
    this.name = 'PdfTransferFailure';
    this.stage = stage;
    this.originalError = originalError;
  }
}

/** Shared fetch validation for individual buttons and bulk PDF collection. */
export async function fetchPdfResponse(url: string, options: {
  signal?: AbortSignal;
  responseError: (status: number, message: string) => Error;
  invalidPdfError: () => Error;
}) {
  const response = await fetch(url, { signal: options.signal ?? AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    throw options.responseError(response.status, typeof payload?.error === 'string' ? payload.error : '');
  }
  const blob = await response.blob();
  const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== '%PDF-') throw options.invalidPdfError();
  return blob;
}

/** Keep choosing within the original user gesture, and never fetch after cancellation. */
export async function transferPdf<T extends PdfTransferDestination>(options: {
  choose: () => Promise<T | null>;
  fetch: () => Promise<Blob>;
  save: (destination: T, blob: Blob) => Promise<string | null>;
  onStage: (stage: PdfTransferStage) => void;
  isActive: () => boolean;
}): Promise<PdfTransferResult> {
  let stage: PdfTransferStage = 'choosing';
  const cancelled: PdfTransferResult = { status: 'cancelled', message: '다운로드를 취소했습니다.' };
  try {
    options.onStage(stage);
    const destination = await options.choose();
    if (!destination || !options.isActive()) return cancelled;
    stage = 'loading'; options.onStage(stage);
    const blob = await options.fetch();
    if (!options.isActive()) return cancelled;
    stage = 'saving'; options.onStage(stage);
    const message = await options.save(destination, blob);
    if (!options.isActive()) return cancelled;
    return { status: destination.handle ? 'saved' : 'requested', message: message ?? '' };
  } catch (error) {
    if (!options.isActive() || (stage === 'choosing' && error instanceof Error && error.name === 'AbortError')) return cancelled;
    throw new PdfTransferFailure(stage, error);
  }
}
