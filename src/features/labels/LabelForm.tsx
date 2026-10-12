import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { ColorPicker } from '../../components/ColorPicker';
import { Confirm, Dialog } from '../../components/Dialog';
import { EMOJI_CHOICES, nameKey, validateLabel, validateName } from '../../domain/validation';
import type { Label } from '../../domain/types';
export function LabelForm({ label, day, onClose }: { label?: Label; day?: string; onClose: () => void }) {
  const { mutate, view, toast, setDirty } = useApp();
  const initial = { name: label?.name || '', emoji: label?.emoji || '🌿', color: label?.color_hex || '#8AAE92', reusable: label ? label.kind === 'reusable' : !day };
  const [form, setForm] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => { const stop = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', stop); return () => window.removeEventListener('beforeunload', stop); }, [dirty]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  const existing = view.snapshot?.labels.find(l => l.id !== label?.id && l.kind === 'reusable' && nameKey(l.name) === nameKey(form.name));
  const duplicateOneOff = day && !form.reusable && view.snapshot?.day_labels.some(d => d.day === day && view.snapshot?.labels.some(l => l.id === d.label_id && l.id !== label?.id && nameKey(l.name) === nameKey(form.name)));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const name = validateName(form.name); validateLabel({ name, emoji: form.emoji, color_hex: form.color });
      const payload = { label_id: label?.id || crypto.randomUUID(), name, emoji: form.emoji, color: form.color.toUpperCase() };
      if (label) await mutate('update_label', { ...payload, promote: label.kind === 'one_off' && form.reusable });
      else if (day) await mutate('create_and_assign', { ...payload, kind: form.reusable ? 'reusable' : 'one_off', day, day_label_id: crypto.randomUUID() });
      else await mutate('create_label', payload);
      toast('Zapisano na urządzeniu.'); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się zapisać.'); } finally { setBusy(false); }
  };
  return <><Dialog title={label ? 'Edytuj oznaczenie' : 'Nowe oznaczenie'} onClose={close}>
    <form onSubmit={save} className="stack">
      {label?.kind === 'reusable' && <p className="hint">Zmiana obejmie wszystkie dni z tym oznaczeniem.</p>}
      <label>Nazwa<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
      <label>Emotka<input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} required aria-describedby="emoji-help" /></label>
      <p id="emoji-help" className="hint">Wybierz jedną emotkę lub wklej ją z klawiatury.</p>
      <div className="emoji-picker">{EMOJI_CHOICES.map(emoji => <button type="button" key={emoji} aria-label={`Wybierz ${emoji}`} aria-pressed={form.emoji === emoji} onClick={() => setForm({ ...form, emoji })}>{emoji}</button>)}</div>
      <ColorPicker value={form.color} onChange={color => setForm({ ...form, color })} />
      {(day || label?.kind === 'one_off') && <label className="check"><input type="checkbox" checked={form.reusable} disabled={label?.kind === 'reusable'} onChange={e => setForm({ ...form, reusable: e.target.checked })} />Zapisz także na liście oznaczeń</label>}
      {duplicateOneOff && <p className="notice">W tym dniu istnieje oznaczenie o tej nazwie. Możesz utworzyć kolejne, osobne oznaczenie.</p>}
      {form.reusable && existing?.status === 'archived' && <div className="notice">Ta nazwa istnieje w archiwum. <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await mutate('set_label_status', { label_id: existing.id, status: 'active' }); if (day) await mutate('assign_label', { label_id: existing.id, day, day_label_id: crypto.randomUUID() }); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Przywróć istniejące oznaczenie</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions sticky-actions"><button type="button" onClick={close} disabled={busy}>Anuluj</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz oznaczenie'}</button></div>
    </form>
  </Dialog>{discard && <Confirm title="Niezapisane zmiany" message="Odrzucić zmiany w formularzu?" action="Odrzuć zmiany" cancel="Wróć" onConfirm={onClose} onClose={() => setDiscard(false)} />}</>;
}
