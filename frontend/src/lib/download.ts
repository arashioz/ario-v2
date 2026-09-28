/**
 * Hands a downloaded file to the user:
 * - Uses the native Web Share API on mobile phones (iOS / Android) so it opens directly in Excel, Files, or messengers.
 * - Triggers a standard browser download on desktop.
 */
export async function deliverFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };

  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
