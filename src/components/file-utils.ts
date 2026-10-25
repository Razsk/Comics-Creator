export function readFileAsText(file: File, onLoad: (text: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ''));
  reader.readAsText(file);
}

export function readFileAsDataUrl(file: File, onLoad: (dataUrl: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ''));
  reader.readAsDataURL(file);
}

export function readFilesAsDataUrls(
  files: FileList | File[],
  onLoad: (items: Array<{ dataUrl: string; name: string }>) => void
): void {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return;
  void Promise.all(
    fileArray.map(
      (file) =>
        new Promise<{ dataUrl: string; name: string }>((resolve) => {
          readFileAsDataUrl(file, (dataUrl) => {
            resolve({ dataUrl, name: file.name });
          });
        })
    )
  ).then(onLoad);
}

export function extractClipboardImageAsDataUrl(
  clipboardData: DataTransfer | null,
  onLoad: (dataUrl: string) => void
): boolean {
  if (!clipboardData?.items) return false;
  for (const item of Array.from(clipboardData.items)) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        readFileAsDataUrl(file, onLoad);
        return true;
      }
    }
  }
  return false;
}

export function downloadJsonFile(filename: string, jsonContent: string): void {
  if (typeof window === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return;
  }
  try {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    // Ignore in environments without DOM download support
  }
}
