/**
 * Clipboard can be queried quietly. Location and camera must be requested
 * from the button tap itself, or the browser will not show Allow.
 */
export async function requestAppPermissions() {
  if (typeof window === 'undefined') return;
  if (sessionStorage.getItem('ario.permissionsAsked') === '1') return;
  sessionStorage.setItem('ario.permissionsAsked', '1');
  await askClipboard();
}

async function askClipboard() {
  try {
    await navigator.permissions?.query({ name: 'clipboard-write' as PermissionName });
  } catch {
    /* Safari/iOS has no clipboard permission query */
  }
  try {
    await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
  } catch {
    /* ignore */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.permissions?.query({ name: 'clipboard-write' as PermissionName });
      } catch {
        /* ignore */
      }
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
