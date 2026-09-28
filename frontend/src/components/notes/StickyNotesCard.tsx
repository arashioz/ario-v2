import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Pin, Plus, StickyNote, Trash2 } from 'lucide-react';
import { notesService, NOTE_STYLES } from '../../services/notes.service';
import type { NoteColor, ShopNote } from '../../services/notes.service';
import { Sheet } from '../ui/Sheet';
import { useNotification } from '../../context/NotificationContext';
import { apiErrorMessage } from '../../services/invoices.service';
import { dateToYmd, formatJalali } from '../../lib/jalali';

const COLORS = Object.keys(NOTE_STYLES) as NoteColor[];

const sortNotes = (list: ShopNote[]) =>
  [...list].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(b.pinned) - Number(a.pinned) ||
      a.sortOrder - b.sortOrder ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

/** Dashboard sticky notes: quick add, tick off, recolor, pin, delete. */
export const StickyNotesCard: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const { showNotification } = useNotification();
  const [notes, setNotes] = useState<ShopNote[]>([]);
  const [text, setText] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<ShopNote | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(sortNotes(await notesService.list()));
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const fail = (err: unknown) => showNotification({ title: 'خطا', message: apiErrorMessage(err, 'ذخیره یادداشت ناموفق بود'), type: 'error' });

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      const n = await notesService.create({ text: t, color });
      setNotes((prev) => sortNotes([n, ...prev]));
      setText('');
    } catch (err) {
      fail(err);
    }
  };

  const patch = async (note: ShopNote, data: Partial<ShopNote>) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n._id === note._id ? { ...n, ...data } : n))));
    try {
      const updated = await notesService.update(note._id, data);
      setNotes((prev) => sortNotes(prev.map((n) => (n._id === note._id ? updated : n))));
    } catch (err) {
      fail(err);
      load();
    }
  };

  const remove = async (note: ShopNote) => {
    setNotes((prev) => prev.filter((n) => n._id !== note._id));
    setEditing(null);
    try {
      await notesService.remove(note._id);
    } catch (err) {
      fail(err);
      load();
    }
  };

  const clearDone = async () => {
    try {
      await notesService.clearDone();
      setNotes((prev) => prev.filter((n) => !n.done));
    } catch (err) {
      fail(err);
    }
  };

  const open = notes.filter((n) => !n.done);
  const done = notes.filter((n) => n.done);

  return (
    <div className="bg-white rounded-2xl p-3 border border-amber-100 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <StickyNote className="w-4 h-4 text-amber-500" />
          یادداشت‌ها
          {open.length > 0 && (
            <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">{open.length.toLocaleString('fa-IR')}</span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-4 h-4 rounded-full ${NOTE_STYLES[c].swatch} ${color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="یادداشت جدید… (مثلاً ارسال بار فردا)"
          className={`flex-1 px-3.5 py-2.5 rounded-2xl border text-xs focus:outline-none ${NOTE_STYLES[color].card}`}
        />
        <button
          onClick={add}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-2xl bg-amber-500 disabled:bg-slate-200 text-white flex items-center justify-center active:scale-95 transition"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {open.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {open.map((n) => (
            <NoteTile key={n._id} note={n} onToggle={() => patch(n, { done: true })} onOpen={() => setEditing(n)} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <button onClick={() => setShowDone((v) => !v)} className="text-[11px] text-slate-500 flex items-center gap-1">
              <ChevronDown className={`w-3.5 h-3.5 transition ${showDone ? 'rotate-180' : ''}`} />
              {done.length.toLocaleString('fa-IR')} انجام‌شده
            </button>
            {showDone && (
              <button onClick={clearDone} className="text-[11px] text-rose-500">
                پاک کردن انجام‌شده‌ها
              </button>
            )}
          </div>
          {showDone && (
            <div className="mt-2 space-y-1.5">
              {done.map((n) => (
                <div key={n._id} className="flex items-center gap-2 text-[11px] text-slate-400">
                  <button
                    onClick={() => patch(n, { done: false })}
                    className="w-4 h-4 rounded-md bg-emerald-500 text-white flex items-center justify-center shrink-0"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <span className="line-through flex-1 truncate">{n.text}</span>
                  <button onClick={() => remove(n)} className="p-1 text-slate-300 hover:text-rose-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {notes.length === 0 && <p className="text-[11px] text-slate-400 text-center py-1">یادداشتی ندارید.</p>}

      <EditNoteSheet note={editing} onClose={() => setEditing(null)} onSave={(n, data) => { patch(n, data); setEditing(null); }} onDelete={remove} />
    </div>
  );
};

const NoteTile: React.FC<{ note: ShopNote; onToggle: () => void; onOpen: () => void }> = ({ note, onToggle, onOpen }) => (
  <div className={`relative rounded-2xl border p-3 min-h-[76px] shadow-sm ${NOTE_STYLES[note.color]?.card ?? NOTE_STYLES.yellow.card}`}>
    {note.pinned && <Pin className="absolute top-2 left-2 w-3 h-3 opacity-50" />}
    <button onClick={onOpen} className="block w-full text-right text-[11px] leading-5 whitespace-pre-wrap break-words pl-3">
      {note.text}
    </button>
    <div className="flex items-center justify-between mt-2">
      <span className="text-[9px] opacity-50">{formatJalali(dateToYmd(new Date(note.createdAt)), { year: false })}</span>
      <button
        onClick={onToggle}
        className="w-5 h-5 rounded-md border border-black/10 bg-white/60 flex items-center justify-center active:scale-90"
        aria-label="انجام شد"
      >
        <Check className="w-3 h-3 opacity-40" />
      </button>
    </div>
  </div>
);

const EditNoteSheet: React.FC<{
  note: ShopNote | null;
  onClose: () => void;
  onSave: (n: ShopNote, data: Partial<ShopNote>) => void;
  onDelete: (n: ShopNote) => void;
}> = ({ note, onClose, onSave, onDelete }) => {
  const [text, setText] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!note) return;
    setText(note.text);
    setColor(note.color);
    setPinned(note.pinned);
  }, [note]);

  if (!note) return null;

  return (
    <Sheet
      open
      title="ویرایش یادداشت"
      subtitle={note.createdBy ? `نوشته ${note.createdBy}` : undefined}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={() => onDelete(note)} className="px-4 py-3 rounded-2xl bg-rose-50 text-rose-600 text-sm font-bold">
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            disabled={!text.trim()}
            onClick={() => onSave(note, { text: text.trim(), color, pinned })}
            className="flex-1 py-3 rounded-2xl bg-amber-500 disabled:bg-slate-300 text-white text-sm font-bold"
          >
            ذخیره
          </button>
        </div>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className={`w-full px-3.5 py-3 rounded-2xl border text-sm focus:outline-none resize-none ${NOTE_STYLES[color].card}`}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full ${NOTE_STYLES[c].swatch} ${color === c ? 'ring-2 ring-offset-2 ring-slate-500' : ''}`}
              aria-label={c}
            />
          ))}
        </div>
        <button
          onClick={() => setPinned((v) => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${pinned ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          <Pin className="w-3.5 h-3.5" />
          {pinned ? 'سنجاق شده' : 'سنجاق'}
        </button>
      </div>
    </Sheet>
  );
};
