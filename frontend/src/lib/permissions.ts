/**
 * Location and clipboard prompts only appear if the call happens in the same
 * turn as the tap. Do not await anything before these.
 */

type PermissionRequest = Permissions & {
  request?: (desc: PermissionDescriptor) => Promise<PermissionStatus>;
};

function requestNamed(name: PermissionName) {
  try {
    const permissions = navigator.permissions as PermissionRequest | undefined;
    void permissions?.request?.({ name } as PermissionDescriptor);
  } catch {
    /* this browser shows Allow from the API call itself */
  }
}

/** Ask the system for clipboard access. Call at the start of the copy tap. */
export function requestCopyPermission() {
  requestNamed('clipboard-write' as PermissionName);
  requestNamed('clipboard-read' as PermissionName);
}

/** Ask the system for location. Call at the start of the location tap. */
export function requestLocationPermission() {
  requestNamed('geolocation');
}

function legacyCopy(text: string) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    area.style.fontSize = '16px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  requestCopyPermission();
  if (legacyCopy(text)) return true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* the system dialog was dismissed */
  }
  return false;
}

export async function requestAppPermissions() {
  if (typeof window === 'undefined') return;
  requestCopyPermission();
}
