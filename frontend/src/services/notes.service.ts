import { api } from './api';

export type NoteColor = 'yellow' | 'mint' | 'pink' | 'sky' | 'lavender' | 'peach';

export interface ShopNote {
  _id: string;
  text: string;
  done: boolean;
  color: NoteColor;
  pinned: boolean;
  sortOrder: number;
  createdBy?: string;
  doneAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const NOTE_STYLES: Record<NoteColor, { card: string; swatch: string }> = {
  yellow: { card: 'bg-amber-100 border-amber-200 text-amber-950', swatch: 'bg-amber-300' },
  mint: { card: 'bg-emerald-100 border-emerald-200 text-emerald-950', swatch: 'bg-emerald-300' },
  pink: { card: 'bg-rose-100 border-rose-200 text-rose-950', swatch: 'bg-rose-300' },
  sky: { card: 'bg-sky-100 border-sky-200 text-sky-950', swatch: 'bg-sky-300' },
  lavender: { card: 'bg-violet-100 border-violet-200 text-violet-950', swatch: 'bg-violet-300' },
  peach: { card: 'bg-orange-100 border-orange-200 text-orange-950', swatch: 'bg-orange-300' },
};

export const notesService = {
  async list(): Promise<ShopNote[]> {
    return (await api.get('/notes')).data;
  },
  async create(data: { text: string; color?: NoteColor; pinned?: boolean }): Promise<ShopNote> {
    return (await api.post('/notes', data)).data;
  },
  async update(id: string, data: Partial<Pick<ShopNote, 'text' | 'color' | 'done' | 'pinned' | 'sortOrder'>>): Promise<ShopNote> {
    return (await api.patch(`/notes/${id}`, data)).data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/notes/${id}`);
  },
  async clearDone(): Promise<{ deleted: number }> {
    return (await api.delete('/notes/done')).data;
  },
};
