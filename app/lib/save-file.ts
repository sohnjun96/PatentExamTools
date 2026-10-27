export type SaveFileResult = string | null;
type FileHandle = {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
};
type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileHandle>;
};
export class SaveFileError extends Error {
  constructor(message: string) { super(message); this.name = 'SaveFileError'; }
}
export function cleanFilename(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180); }
export function fileErrorMessage(error: unknown) {
  if (error instanceof SaveFileError) return error.message;
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') return '파일을 저장할 공간이 부족합니다. 저장 공간을 확보한 뒤 다시 시도해 주세요.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '선택한 위치에 파일을 저장할 수 없습니다. 다른 폴더를 선택해 다시 시도해 주세요.';
  return '파일을 저장하지 못했습니다. 저장 위치와 사용 가능한 공간을 확인한 뒤 다시 시도해 주세요.';
}

// The picker is called before any fetch/import to keep browser user activation.
export async function chooseSaveFile(filename: string, mime: string, extension: string) {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: cleanFilename(filename),
        types: [{ description: extension.toUpperCase() + ' 파일', accept: { [mime]: ['.' + extension] } }],
      });
      return { handle, filename: handle.name };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return null;
      // Embedded browsers can expose a picker but disallow it in this context.
      if (!['SecurityError', 'NotAllowedError', 'NotSupportedError'].includes(name)) throw new SaveFileError(fileErrorMessage(error));
    }
  }
  const name = window.prompt('저장할 파일명을 입력해 주세요. 저장 위치는 브라우저의 다운로드 설정에 따라 정해집니다.', cleanFilename(filename));
  if (name === null || !name.trim()) return null;
  const safe = cleanFilename(name.trim());
  return { handle: null, filename: safe.toLowerCase().endsWith('.' + extension) ? safe : safe + '.' + extension };
}

export async function writeChosenFile(destination: NonNullable<Awaited<ReturnType<typeof chooseSaveFile>>>, blob: Blob): Promise<SaveFileResult> {
  if (destination.handle) {
    let writer: Awaited<ReturnType<FileHandle['createWritable']>> | undefined;
    try {
      writer = await destination.handle.createWritable();
      await writer.write(blob);
      await writer.close();
    } catch (error) {
      await writer?.abort().catch(() => undefined);
      throw new SaveFileError(fileErrorMessage(error));
    }
    return `선택한 폴더에 ${destination.filename} 파일을 저장했습니다.`;
  }
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = destination.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) { throw new SaveFileError(fileErrorMessage(error)); }
  return `${destination.filename} 다운로드를 요청했습니다. 브라우저의 다운로드 목록에서 저장 결과와 위치를 확인해 주세요.`;
}
