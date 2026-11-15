import { useCallback, useState } from 'react';
import {
  clipboardService,
  copyToClipboard,
  readFromClipboard,
  type ClipboardResult,
} from '../services/clipboard';

export interface UseClipboardResult {
  writeSupported: boolean;
  readSupported: boolean;
  lastText: string | null;
  busy: boolean;
  /** Call from a click handler. */
  copy: (text: string) => Promise<ClipboardResult>;
  /** Call from a click handler. */
  paste: () => Promise<ClipboardResult>;
  /** Copies the current page URL. Call from a click handler. */
  copyUrl: () => Promise<ClipboardResult>;
}

export function useClipboard(): UseClipboardResult {
  const [lastText, setLastText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const result = await copyToClipboard(text);
      if (result.ok) setLastText(text);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const paste = useCallback(async () => {
    setBusy(true);
    try {
      const result = await readFromClipboard();
      if (result.ok && result.text !== undefined) setLastText(result.text);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const copyUrl = useCallback(async () => {
    setBusy(true);
    try {
      const result = await clipboardService.copyUrl();
      if (result.ok && result.text !== undefined) setLastText(result.text);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    writeSupported: clipboardService.isWriteSupported(),
    readSupported: clipboardService.isReadSupported(),
    lastText,
    busy,
    copy,
    paste,
    copyUrl,
  };
}
