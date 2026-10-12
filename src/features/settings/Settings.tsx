import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Confirm, Dialog } from '../../components/Dialog';
import { DayCell } from '../../components/markers/DayCell';
import { authFunction, supabase } from '../../data/client';
import { monthDays } from '../../domain/dates';
import { project } from '../../domain/operations';
import { DEFAULT_PREFERENCES, type Backup, type Label, type Operation, type Preferences, type Snapshot } from '../../domain/types';
import { remapBackup, validateBackup, validatePassword } from '../../domain/validation';
const examples: Label[] = ['#8AAE92', '#E7B082', '#819FC8', '#D7A1B6', '#FFFFFF', '#18221C', '#B3ABDB', '#E8CF87', '#98C5C3'].map((color, i) => ({ id: `sample-${i}`, name: i === 3 ? 'Bardzo długa nazwa przykładowego oznaczenia' : `Przykład ${i + 1}`, emoji: ['🌿', '📚', '🏋️', '👩🏽‍💻', '☀️', '🌙', '🎨', '🫶', '🍵'][i], color_hex: color, kind: 'reusable', status: 'active', created_at: '', updated_at: '' }));
const choices = {
  background: [['plain', 'Gładkie'], ['warm', 'Ciepły papier'], ['mist', 'Mgła'], ['sage', 'Szałwia'], ['dots', 'Drobne punkty']],
  calendar_style: [['simple', 'Prosty'], ['soft', 'Miękki'], ['editorial', 'Klasyczny'], ['mono', 'Geometryczny']],
  theme_mode: [['light', 'Jasny'], ['dark', 'Ciemny'], ['system', 'Zgodny z urządzeniem']],
  marker_mode: [['dots', 'Kropki'], ['horizontal', 'Pasy poziome'], ['vertical', 'Pasy pionowe']],
  dot_size: [['small', 'Małe'], ['medium', 'Średnie'], ['auto', 'Automatyczne']],
  horizontal_emoji_position: [['top', 'U góry'], ['left', 'Po lewej']], vertical_emoji_position: [['top', 'U góry'], ['left', 'Po lewej']],
};
function Select({ field, title, value, change }: { field: keyof typeof choices; title: string; value: string; change: (value: string) => void }) {
  return <label>{title}<select value={value} onChange={e => change(e.target.value)}>{choices[field].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
function exportBackup(snapshot: Snapshot): Backup { return { schema_version: 1, exported_at: new Date().toISOString(), labels: snapshot.labels, day_labels: snapshot.day_labels, preferences: snapshot.preferences }; }
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Settings() {
  const { repository, view, mutate, toast, setDirty } = useApp(); const saved = view.snapshot!.preferences;
  const [draft, setDraft] = useState(saved), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [modal, setModal] = useState<'reset' | 'password' | 'delete' | 'logout'>(), [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [imported, setImported] = useState<Backup>(), [emergency, setEmergency] = useState<{ snapshot: Snapshot; operations: Operation[]; failures: Map<string, string> }>();
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => { const stop = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', stop); return () => window.removeEventListener('beforeunload', stop); }, [dirty]);
  const change = (key: keyof Preferences, value: string | boolean) => setDraft({ ...draft, [key]: value });
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const exportData = async () => {
    const fresh = await repository.refreshOnline(); download('moj-kalendarz.json', exportBackup(fresh)); toast('Wyeksportowano kopię kalendarza.');
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw new Error('Maksymalny rozmiar kopii wynosi 20 MB.');
    if (!view.online || view.queue.length) throw new Error('Import wymaga internetu i pustej kolejki.');
    const content = JSON.parse(await file.text());
    if (content.mode === 'offline_emergency') {
      const base = validateBackup(content.confirmed_snapshot);
      if (!Array.isArray(content.pending_operations)) throw new Error('Uszkodzona kolejka w pliku awaryjnym.');
      const snapshot: Snapshot = { ...base, revision: '0', profile: { username: '' } };
      const operations: Operation[] = content.pending_operations.map((op: Operation) => ({ ...op, user_id: repository.userId }));
      for (const op of operations) if (!['create_label', 'update_label', 'set_label_status', 'assign_label', 'unassign_label', 'create_and_assign', 'promote_label', 'update_preferences'].includes(op.type)) throw new Error('Nieobsługiwana operacja w pliku awaryjnym.');
      const result = project(snapshot, operations);
      if (result.failures.size) setEmergency({ snapshot, operations, failures: result.failures });
      else setImported(validateBackup(exportBackup(result.snapshot)));
    } else setImported(validateBackup(content));
  };
  const skipEmergency = (id: string) => {
    if (!emergency) return;
    const operations = emergency.operations.filter(op => op.id !== id), result = project(emergency.snapshot, operations);
    if (result.failures.size) setEmergency({ ...emergency, operations, failures: result.failures });
    else { setImported(validateBackup(exportBackup(result.snapshot))); setEmergency(undefined); }
  };
  return <section className="page settings-page"><header className="page-header"><p className="eyebrow">PO TWOJEMU</p><h1>Ustawienia</h1><p>Twój kalendarz, Twój styl.</p></header>
    <div className={`settings-preview bg-${draft.background} theme-${draft.theme_mode}`}><div className="preview-heading"><strong>Podgląd · październik 2026</strong><small>Dane przykładowe</small></div><div className={`preview-grid style-${draft.calendar_style}`}>{monthDays(2026, 9).map((day, i) => <DayCell preview key={day} day={day} today={day === '2026-10-12'} outside={!day.startsWith('2026-10')} preferences={draft} labels={examples.slice(0, ({ 4: 1, 9: 2, 13: 4, 18: 6, 24: 9 } as Record<number, number>)[i] || 0)} />)}</div></div>
    <div className="settings-section stack"><h2>Wygląd</h2><Select field="background" title="Tło" value={draft.background} change={v => change('background', v)} /><Select field="calendar_style" title="Styl kalendarza" value={draft.calendar_style} change={v => change('calendar_style', v)} /><Select field="theme_mode" title="Tryb jasności" value={draft.theme_mode} change={v => change('theme_mode', v)} /><Select field="marker_mode" title="Sposób wyświetlania" value={draft.marker_mode} change={v => change('marker_mode', v)} />
      <label className="check"><input type="checkbox" checked={draft.show_emoji} onChange={e => change('show_emoji', e.target.checked)} />Pokaż emotki</label>
      {draft.marker_mode === 'dots' && <Select field="dot_size" title="Rozmiar kropek" value={draft.dot_size} change={v => change('dot_size', v)} />}
      {draft.marker_mode !== 'dots' && draft.show_emoji && <Select field={draft.marker_mode === 'horizontal' ? 'horizontal_emoji_position' : 'vertical_emoji_position'} title="Pozycja emotki na pasie" value={draft[draft.marker_mode === 'horizontal' ? 'horizontal_emoji_position' : 'vertical_emoji_position']} change={v => change(draft.marker_mode === 'horizontal' ? 'horizontal_emoji_position' : 'vertical_emoji_position', v)} />}
      <div className="marker-examples">{[1, 2, 4, 6, 9].map(count => <div key={count}><DayCell preview day="2026-10-12" labels={examples.slice(0, count)} preferences={draft} /><small>{count} oznaczeń</small></div>)}</div>
      <div className="actions"><button disabled={!dirty || busy} onClick={() => setDraft(saved)}>Anuluj</button><button className="primary" disabled={!dirty || busy} onClick={() => void run(async () => { await mutate('update_preferences', draft); toast('Ustawienia zapisano na urządzeniu.'); })}>Zapisz ustawienia</button></div>
      <button className="text-button" onClick={() => setModal('reset')}>Przywróć domyślny wygląd</button>
    </div>
    <div className="settings-section"><h2>Synchronizacja</h2><p>{view.queue.length ? `${view.queue.length} zmian oczekuje na synchronizację.` : 'Wszystkie zmiany potwierdzone przez serwer.'}</p><p className="hint">Zmiany zapisane wyłącznie offline mogą zostać utracone po usunięciu pamięci urządzenia.</p><button disabled={busy || !view.online} onClick={() => void repository.sync()}>Synchronizuj teraz</button></div>
    <div className="settings-section stack"><h2>Kopie JSON</h2><button disabled={busy || !view.online || view.queue.length > 0} onClick={() => void run(exportData)}>Eksportuj kalendarz</button><button disabled={busy} onClick={() => { if (!view.confirmed) return; download('moj-kalendarz-niesynchronizowany.json', { mode: 'offline_emergency', schema_version: 1, exported_at: new Date().toISOString(), confirmed_snapshot: exportBackup(view.confirmed), pending_operations: view.queue.map(({ id, type, payload, created_at, state }) => ({ id, type, payload, created_at, state })) }); }}>Awaryjny eksport danych lokalnych</button>
      <p className="hint">Eksport awaryjny zawiera osobno stan serwera i oczekujące operacje. Nie jest kopią zsynchronizowanego kalendarza.</p><label>Importuj kopię (do 20 MB)<input type="file" accept="application/json,.json" disabled={busy || !view.online || view.queue.length > 0} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void run(() => loadFile(file)); }} /></label>
    </div>
    <div className="settings-section"><h2>Na ekranie iPhone’a</h2><p>Otwórz w Safari, wybierz Udostępnij, a następnie Do ekranu początkowego.</p><p className="hint">W zainstalowanej aplikacji może być potrzebne ponowne zalogowanie.</p></div>
    <div className="settings-section stack"><h2>Konto · {view.snapshot!.profile.username}</h2><button disabled={!view.online} onClick={() => { setCurrentPassword(''); setNewPassword(''); setModal('password'); }}>Zmień hasło</button><button onClick={() => setModal('logout')}>Wyloguj</button><button className="text-danger" disabled={!view.online || view.queue.length > 0} onClick={() => { setCurrentPassword(''); setConfirmation(''); setModal('delete'); }}>Usuń konto</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {modal === 'reset' && <Confirm title="Przywrócić wygląd?" message="Reset obejmie wyłącznie wygląd. Oznaczenia i historia pozostaną." action="Przywróć domyślny wygląd" onClose={() => setModal(undefined)} onConfirm={() => { setDraft(DEFAULT_PREFERENCES); setModal(undefined); }} />}
    {modal === 'logout' && <Dialog title="Wylogowanie" onClose={() => setModal(undefined)}>{view.queue.length ? <><p>Masz oczekujące zmiany. Nie usuniemy ich bez Twojej decyzji.</p><button className="primary full" disabled={busy || !view.online} onClick={() => void run(async () => { await repository.sync(); if (repository.view.queue.length) throw new Error('Nie wszystkie zmiany zostały potwierdzone.'); await repository.logout(); })}>Synchronizuj i wyloguj</button><button className="full" onClick={() => setModal(undefined)}>Wróć</button><button className="danger full" disabled={busy} onClick={() => void run(() => repository.logout(true))}>Odrzuć lokalne zmiany i wyloguj</button></> : <button className="primary full" disabled={busy} onClick={() => void run(() => repository.logout())}>Wyloguj</button>}{error && <p className="error" role="alert">{error}</p>}</Dialog>}
    {(modal === 'password' || modal === 'delete') && <Dialog title={modal === 'password' ? 'Zmiana hasła' : 'Usunięcie konta'} onClose={() => { if (!busy) setModal(undefined); }}><form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => {
      if (modal === 'delete') { await authFunction('delete-account', { current_password: currentPassword, confirmation }); await repository.logout(true); return; }
      validatePassword(newPassword); const result = await authFunction('login', { username: view.snapshot!.profile.username, password: currentPassword });
      const session = result.session as { access_token: string; refresh_token: string; user: { id: string } };
      if (session.user.id !== repository.userId) throw new Error('Niepoprawne konto.');
      const login = await supabase.auth.setSession(session); if (login.error) throw new Error('Nie udało się potwierdzić sesji.');
      const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) throw new Error('Nie udało się zmienić hasła. Spróbuj ponownie.'); toast('Hasło zmieniono.'); setModal(undefined);
    }); }}>
      <label>Bieżące hasło<input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></label>
      {modal === 'password' ? <label>Nowe hasło<input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /><small>12–128 znaków. Spacje są dozwolone.</small></label> : <><p className="error">Usuniesz całe konto i historię kalendarza. Operacji nie można cofnąć w aplikacji. Kopie administracyjne mogą zawierać dane do końca retencji.</p><label>Wpisz USUŃ KONTO<input value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></label></>}
      {error && <p className="error" role="alert">{error}</p>}<button className={modal === 'delete' ? 'danger' : 'primary'} disabled={busy} type="submit">{modal === 'delete' ? 'Usuń konto i kalendarz' : 'Zmień hasło'}</button>
    </form></Dialog>}
    {imported && <Dialog title="Zastąpić kalendarz?" onClose={() => setImported(undefined)}><p>{imported.labels.length} oznaczeń · {new Set(imported.day_labels.map(d => d.day)).size} dni · {imported.day_labels.length} wpisów</p><p className="error">Zastąpi cały obecny kalendarz i ustawienia.</p><button className="full" disabled={busy} onClick={() => void run(exportData)}>Najpierw eksportuj obecny stan</button><div className="actions"><button onClick={() => setImported(undefined)}>Anuluj</button><button className="danger" disabled={busy} onClick={() => void run(async () => { await mutate('replace_from_backup', remapBackup(imported) as unknown as Record<string, unknown>); setImported(undefined); toast('Import oczekuje na potwierdzenie serwera.'); })}>Zastąp kalendarz</button></div>{error && <p className="error" role="alert">{error}</p>}</Dialog>}
    {emergency && <Dialog title="Rozwiąż operacje z kopii" onClose={() => setEmergency(undefined)}><p>Te zmiany nie mogą zostać zastosowane. Zdecyduj o każdej przed zastąpieniem kalendarza.</p>{[...emergency.failures].map(([id, message]) => <div className="notice" key={id}><p>{emergency.operations.find(op => op.id === id)?.type}: {message}</p><button onClick={() => skipEmergency(id)}>Pomiń tę zmianę</button></div>)}</Dialog>}
  </section>;
}
