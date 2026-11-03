/** Ask the browser for the permissions this app actually uses, once per session. */
export async function requestAppPermissions() {
  if (typeof window === 'undefined') return;
  if (sessionStorage.getItem('ario.permissionsAsked') === '1') return;
  sessionStorage.setItem('ario.permissionsAsked', '1');
  await Promise.allSettled([askClipboard(), askGeo(), askCamera()]);
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

async function askGeo() {
  if (!navigator.geolocation) return;
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

async function askCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* user may deny; camera is requested again when taking a product photo */
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
