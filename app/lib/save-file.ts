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

export function cleanFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);
}

// Call from a click handler to preserve browser user activation.
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
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
  }
  const name = window.prompt('저장할 파일명을 입력하세요. 저장 위치는 브라우저 다운로드 설정을 따릅니다.', cleanFilename(filename));
  if (name === null || !name.trim()) return null;
  const safe = cleanFilename(name.trim());
  return { handle: null, filename: safe.toLowerCase().endsWith('.' + extension) ? safe : safe + '.' + extension };
}

export async function writeChosenFile(
  destination: NonNullable<Awaited<ReturnType<typeof chooseSaveFile>>>, blob: Blob,
): Promise<SaveFileResult> {
  if (destination.handle) {
    const writer = await destination.handle.createWritable();
    try {
      await writer.write(blob);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => undefined);
      throw error;
    }
    return `선택한 폴더에 ${destination.filename} 저장 완료 (브라우저는 전체 경로를 공개하지 않습니다)`;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = destination.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return `${destination.filename} 다운로드 요청 완료 · 실제 저장 위치와 덮어쓰기는 브라우저 다운로드 설정을 확인해 주세요`;
}
