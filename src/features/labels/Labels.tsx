import { useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { Confirm } from '../../components/Dialog';
import { searchKey } from '../../domain/dates';
import type { Label } from '../../domain/types';
import { LabelForm } from './LabelForm';
export function Labels() {
  const { calendarView: view, mutate, repository, toast } = useApp();
  const [archive, setArchive] = useState(false), [search, setSearch] = useState(''), [edit, setEdit] = useState<Label | 'new'>(), [remove, setRemove] = useState<{ label: Label; count: number }>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const usage = useMemo(() => { const map = new Map<string, number>(); for (const d of view.snapshot?.day_labels || []) map.set(d.label_id, (map.get(d.label_id) || 0) + 1); return map; }, [view.snapshot]);
  const labels = (view.snapshot?.labels || []).filter(l => l.kind === 'reusable' && l.status === (archive ? 'archived' : 'active') && searchKey(l.name).includes(searchKey(search))).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const prepareDelete = (label: Label) => run(async () => { const fresh = await repository.refreshOnline(); const l = fresh.labels.find(l => l.id === label.id); if (!l) throw new Error('Oznaczenie już nie istnieje.'); setRemove({ label: l, count: fresh.day_labels.filter(d => d.label_id === l.id).length }); });
  return <section className="page"><header className="page-header"><p className="eyebrow">TWOJA MAŁA LEGENDA</p><h1>Oznaczenia</h1><p>Nazwij to, co ma dla Ciebie znaczenie.</p></header>
    <div className="segmented"><button aria-pressed={!archive} onClick={() => setArchive(false)}>Aktywne</button><button aria-pressed={archive} onClick={() => setArchive(true)}>Archiwum</button></div>
    <label className="search-label">Szukaj po nazwie<input type="search" placeholder="Szukaj oznaczenia…" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {!view.snapshot ? <p>Najpierw pobierz historię.</p> : <><div className="label-list">{labels.map(l => <div className="label-card" key={l.id}><div className="label-row"><span className="label-sample" style={{ background: l.color_hex }}>{l.emoji}</span><div className="row-title"><strong>{l.name}</strong><small>{usage.get(l.id) || 0} dni użycia</small></div></div><div className="label-actions"><button disabled={busy} onClick={() => setEdit(l)}>Edytuj</button><button disabled={busy} onClick={() => void run(async () => { await mutate('set_label_status', { label_id: l.id, status: archive ? 'active' : 'archived' }); toast(archive ? 'Przywrócono oznaczenie.' : 'Zarchiwizowano oznaczenie.'); })}>{archive ? 'Przywróć' : 'Archiwizuj'}</button><button className="text-danger" disabled={busy || !view.online || view.queue.length > 0} onClick={() => void prepareDelete(l)}>Usuń wszędzie</button></div></div>)}</div>
    {!labels.length && <div className="empty-state"><span className="empty-icon">✿</span><h2>{search ? 'Brak wyników' : archive ? 'Archiwum jest puste' : 'Twoja lista oznaczeń'}</h2><p>{archive ? 'Archiwizacja zachowuje wszystkie oznaczone dni.' : 'Dodaj kolor i emotkę. Potem używaj ich w dowolnych dniach.'}</p></div>}
    {!archive && <button className="primary full" onClick={() => setEdit('new')}>＋ Dodaj oznaczenie</button>}</>}
    {error && <p className="error" role="alert">{error}</p>}
    {edit && <LabelForm label={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />}
    {remove && <Confirm title="Usunąć oznaczenie?" message={`Usunąć oznaczenie «${remove.label.name}» i jego wpisy w ${remove.count} dniach? Tej operacji nie można cofnąć w aplikacji.`} action="Usuń wszędzie" destructive onClose={() => setRemove(undefined)} onConfirm={() => { const id = remove.label.id; setRemove(undefined); void run(async () => { await mutate('delete_label', { label_id: id }); toast('Usunięcie oczekuje na potwierdzenie serwera.'); }); }} />}
  </section>;
}
