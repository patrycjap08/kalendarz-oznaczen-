import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Confirm, Dialog } from '../../components/Dialog';
import { validateName } from '../../domain/validation';
import { LEGACY_CALENDAR_ID, type CalendarDefinition } from '../../domain/types';
function CalendarForm({ calendar, onClose }: { calendar?: CalendarDefinition; onClose: () => void }) {
  const { repository, mutate, toast, setDirty } = useApp();
  const [name, setName] = useState(calendar?.name || ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
  const dirty = name !== (calendar?.name || '');
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => { const stop = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', stop); return () => window.removeEventListener('beforeunload', stop); }, [dirty]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  return <><Dialog title={calendar ? 'Zmień nazwę kalendarza' : 'Nowy kalendarz'} onClose={close} className="compact"><form className="stack" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const id = calendar?.id || crypto.randomUUID();
      await mutate(calendar ? 'rename_calendar' : 'create_calendar', { calendar_id: id, name: validateName(name) });
      if (!calendar) await repository.selectCalendar(id);
      toast(calendar ? 'Zmieniono nazwę kalendarza.' : 'Utworzono kalendarz.'); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}><label>Nazwa kalendarza<input autoFocus value={name} onChange={event => setName(event.target.value)} required aria-describedby="calendar-name-help" /></label><small id="calendar-name-help">1–60 znaków, np. „Osobisty” lub „Praca”.</small>{!calendar && <p className="hint">Nowy kalendarz będzie miał własne oznaczenia i wpisy.</p>}{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button type="button" disabled={busy} onClick={close}>Anuluj</button><button className="primary" disabled={busy} type="submit">{busy ? 'Zapisywanie…' : calendar ? 'Zapisz nazwę' : 'Utwórz kalendarz'}</button></div></form></Dialog>{discard && <Confirm title="Niezapisana nazwa" message="Odrzucić wpisaną nazwę kalendarza?" action="Odrzuć zmiany" cancel="Wróć" onClose={() => setDiscard(false)} onConfirm={onClose} />}</>;
}
export function CalendarSelector() {
  const { view, calendarId, repository, toast } = useApp();
  const [form, setForm] = useState<CalendarDefinition | 'new'>();
  const calendars = view.snapshot!.calendars;
  const selected = calendars.find(c => c.id === calendarId);
  return <div className="calendar-selector"><label>Wybrany kalendarz<select aria-label="Wybierz kalendarz" value={calendarId} onChange={event => void repository.selectCalendar(event.target.value).catch(e => toast(e.message))}>{calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="icon-button" aria-label="Nowy kalendarz" onClick={() => setForm('new')}>＋</button><button className="icon-button" aria-label="Zmień nazwę kalendarza" disabled={!selected || selected.id === LEGACY_CALENDAR_ID} onClick={() => setForm(selected)}>✎</button>{form && <CalendarForm calendar={form === 'new' ? undefined : form} onClose={() => setForm(undefined)} />}</div>;
}
