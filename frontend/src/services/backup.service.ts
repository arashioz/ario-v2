import { api } from './api';
import type { BackupSettings } from './settings.service';
import { deliverFile } from '../lib/download';

export interface BackupFile {
  name: string;
  kind: 'backup' | 'export';
  size: number;
  createdAt: string;
}

export interface BackupStatus {
  settings: BackupSettings;
  files: BackupFile[];
  lastError: string | null;
}

const SLOW = { timeout: 120_000 };

export const backupService = {
  async status() {
    const res = await api.get<BackupStatus>('/backup');
    return res.data;
  },
  async run() {
    const res = await api.post<BackupFile>('/backup/run', null, SLOW);
    return res.data;
  },
  async download(name: string) {
    const res = await api.get<Blob>(`/backup/files/${encodeURIComponent(name)}`, { ...SLOW, responseType: 'blob' });
    await deliverFile(res.data, name);
  },
  /** CSV of every invoice dated on `ymd` (Gregorian YYYY-MM-DD). */
  async exportDay(ymd: string) {
    const res = await api.get<Blob>('/backup/export', { ...SLOW, params: { date: ymd }, responseType: 'blob' });
    await deliverFile(res.data, `ario-invoices-${ymd}.csv`);
  },
  async remove(name: string) {
    await api.delete(`/backup/files/${encodeURIComponent(name)}`);
  },
};
