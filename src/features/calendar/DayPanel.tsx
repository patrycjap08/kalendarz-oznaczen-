import { useState } from 'react';
import { useApp } from '../../app/context';
import { Dialog } from '../../components/Dialog';
import { fullDate, searchKey } from '../../domain/dates';
import { LabelForm } from '../labels/LabelForm';
import type { Label } from '../../domain/types';
export function DayPanel({ day, onClose }: { day: string; onClose: () => void }) {
  const { view, mutate, toast } = useApp();
  const [query, setQuery] = useState(''), [edit, setEdit] = useState<Label | 'new'>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const snapshot = view.snapshot!;
  const assignments = snapshot.day_labels.filter(d => d.day === day).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const assigned = new Set(assignments.map(d => d.label_id));
  const available = snapshot.labels.filter(l => l.kind === 'reusable' && l.status === 'active' && searchKey(l.name).includes(searchKey(query))).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const add = (label: Label) => run(async () => {
    await mutate('assign_label', { day, label_id: label.id, day_label_id: crypto.randomUUID() });
    toast('Dodano oznaczenie.', () => mutate('unassign_label', { day, label_id: label.id }));
  });
  const remove = (label: Label) => run(async () => {
    await mutate('unassign_label', { day, label_id: label.id });
    toast('Usunięto z dnia.', async () => {
      if (label.kind === 'one_off') await mutate('create_and_assign', { day, label_id: crypto.randomUUID(), day_label_id: crypto.randomUUID(), name: label.name, emoji: label.emoji, color: label.color_hex, kind: 'one_off' });
      else await mutate('assign_label', { day, label_id: label.id, day_label_id: crypto.randomUUID() });
    });
  });
  return <><Dialog title={fullDate(day)} onClose={onClose} className="day-dialog">
    <p className="hint">{assignments.length} oznaczeń · tylko ten dzień</p>
    <h3>W tym dniu</h3>
    {!assignments.length && <p className="empty-inline">Ten dzień jest jeszcze pusty.</p>}
    <div className="label-list">{assignments.map(d => { const l = snapshot.labels.find(l => l.id === d.label_id); return l ? <div className="label-row" key={d.id}>
      <span className="label-sample" style={{ background: l.color_hex }}>{l.emoji}</span><div className="row-title"><strong>{l.name}</strong>{l.kind === 'one_off' && <small>Jednorazowe</small>}{l.status === 'archived' && <small>Archiwalne</small>}</div>
      <button className="icon-button" aria-label={`Edytuj ${l.name}`} onClick={() => setEdit(l)}>⋯</button><button className="icon-button" aria-label={`Usuń ${l.name} z dnia`} disabled={busy} onClick={() => void remove(l)}>−</button>
    </div> : null; })}</div>
    <h3>Dodaj oznaczenie</h3><label className="search-label">Szukaj po nazwie<input type="search" placeholder="Szukaj oznaczenia…" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="label-list">{available.map(l => <button className="label-row add-row" key={l.id} disabled={busy || assigned.has(l.id)} onClick={() => void add(l)}><span className="label-sample" style={{ background: l.color_hex }}>{l.emoji}</span><span className="row-title">{l.name}</span><span className="hint">{assigned.has(l.id) ? 'Dodano' : '+'}</span></button>)}</div>
    {!available.length && <p className="empty-inline">{query ? 'Brak wyników wyszukiwania.' : 'Utwórz pierwsze oznaczenie.'}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary full sticky-actions" onClick={() => setEdit('new')}>＋ Nowe oznaczenie</button>
  </Dialog>{edit && <LabelForm label={edit === 'new' ? undefined : edit} day={day} onClose={() => setEdit(undefined)} />}</>;
}
