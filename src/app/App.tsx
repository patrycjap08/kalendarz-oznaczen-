import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '@supabase/supabase-js';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { supabase } from '../data/client';
import { Repository } from '../data/repository';
import { AppContext } from './context';
import { Auth } from '../features/auth/Auth';
import { Calendar } from '../features/calendar/Calendar';
import { Labels } from '../features/labels/Labels';
import { Settings } from '../features/settings/Settings';
import { Confirm, Dialog } from '../components/Dialog';
import { LEGACY_CALENDAR_ID, type OperationType, type Payload } from '../domain/types';
import { calendarSnapshot } from '../domain/calendars';
const originalUrl = location.href;
const callback = /[?&](code|access_token|error_description)=/.test(originalUrl) || /#access_token=/.test(originalUrl);
const recovering = /[?&#]type=recovery(?:&|$)/.test(originalUrl);
function readRoute() { const route = location.hash.replace(/^#\//, '').split('?')[0]; return ['calendar', 'labels', 'settings', 'login', 'register', 'recovery'].includes(route) ? route : 'calendar'; }
function CalendarApp({ userId, route, navigate }: { userId: string; route: string; navigate: (route: string) => void }) {
  const repository = useMemo(() => new Repository(userId), [userId]);
  const view = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const calendarId = view.selected_calendar_id;
  const calendarView = useMemo(() => ({ ...view, snapshot: calendarSnapshot(view.snapshot, calendarId), confirmed: calendarSnapshot(view.confirmed, calendarId) }), [view, calendarId]);
  const [month, setMonth] = useState<[number, number]>(() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; });
  const [toastState, setToast] = useState<{ message: string; undo?: () => Promise<void> }>(), [dirty, setDirty] = useState(false), [pendingRoute, setPendingRoute] = useState<string>();
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => { void repository.start(); return () => repository.dispose(); }, [repository]);
  useEffect(() => { if (!toastState) return; const timer = setTimeout(() => setToast(undefined), 5000); return () => clearTimeout(timer); }, [toastState]);
  const toast = useCallback((message: string, undo?: () => Promise<void>) => setToast({ message, undo }), []);
  const mutate = useCallback(async (type: OperationType, payload: Payload) => {
    const scoped = ['create_label', 'update_label', 'set_label_status', 'delete_label', 'assign_label', 'unassign_label', 'create_and_assign', 'promote_label'].includes(type);
    await repository.enqueue(type, scoped && calendarId && calendarId !== LEGACY_CALENDAR_ID ? { calendar_id: calendarId, ...payload } : payload);
  }, [repository, calendarId]);
  const changeRoute = (next: string) => { if (dirty) setPendingRoute(next); else navigate(next); };
  useEffect(() => { const block = (event: Event) => { const next = (event as CustomEvent<string>).detail; if (dirtyRef.current && next !== route) { event.preventDefault(); history.replaceState(null, '', `#/` + route); setPendingRoute(next); } }; window.addEventListener('calendar:hash-navigation', block); return () => window.removeEventListener('calendar:hash-navigation', block); }, [route]);
  const p = view.snapshot?.preferences;
  const conflicts = view.queue.filter(op => op.state === 'conflict');
  const conflict = conflicts[0];
  const serverLabel = conflict && view.confirmed?.labels.find(l => l.id === conflict.payload.label_id);
  const localLabel = conflict && view.snapshot?.labels.find(l => l.id === conflict.payload.label_id);
  const status = view.error ? view.error : view.syncing ? 'Synchronizacja…' : view.queue.length ? `Zapisano na urządzeniu — ${view.queue.length} zmian oczekuje na synchronizację` : view.confirmed ? 'Zapisano · zsynchronizowano' : view.online ? 'Pobieranie historii…' : 'Offline · historia nie została pobrana';
  return <AppContext.Provider value={{ repository, view, calendarView, calendarId, mutate, toast, setDirty }}><div className={`app bg-${p?.background || 'plain'} theme-${p?.theme_mode || 'system'}`}>
    <div className="app-top"><span className="brand-small">▦ <strong>Mój kalendarz</strong></span><span className={`connection-dot ${view.online ? 'online' : ''}`} aria-label={view.online ? 'Online' : 'Offline'} /></div>
    <div className={`sync-status ${view.error || conflicts.length ? 'sync-warning' : ''}`} role="status">{!view.online && 'Offline · '}{status}{view.error && <button onClick={() => void repository.sync()}>Ponów</button>}</div>
    <main>{route === 'labels' ? <Labels key={calendarId} /> : route === 'settings' && view.snapshot ? <Settings /> : <Calendar key={calendarId} month={month} setMonth={setMonth} />}</main>
    <nav className="bottom-nav" aria-label="Główna nawigacja">{[['calendar', '▦', 'Kalendarz'], ['labels', '◉', 'Oznaczenia'], ['settings', '⚙', 'Ustawienia']].map(([key, icon, text]) => <button key={key} aria-current={route === key ? 'page' : undefined} onClick={() => changeRoute(key)}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{text}</span></button>)}</nav>
    {toastState && createPortal(<div className="toast" role="status"><span>{toastState.message}</span>{toastState.undo && <button onClick={async () => { const undo = toastState.undo!; setToast(undefined); try { await undo(); toast('Cofnięto zmianę.'); } catch (e) { toast((e as Error).message); } }}>Cofnij</button>}</div>, document.querySelector('dialog[open]:last-of-type') || document.querySelector('.app') || document.body)}
    {pendingRoute && <Confirm title="Niezapisane ustawienia" message="Odrzucić niezapisane zmiany i przejść dalej?" action="Odrzuć zmiany" cancel="Wróć" onClose={() => setPendingRoute(undefined)} onConfirm={() => { setDirty(false); navigate(pendingRoute); setPendingRoute(undefined); }} />}
    {needRefresh && <div className="update-banner">Dostępna nowa wersja <button disabled={dirty} onClick={async () => { try { await repository.reload(); if (repository.view.failures.size) { toast('Najpierw rozwiąż oczekujące zmiany.'); return; } await updateServiceWorker(true); } catch { toast('Nie udało się sprawdzić pamięci urządzenia. Aktualizacja została wstrzymana.'); } }}>Odśwież</button>{dirty && <small>Najpierw zapisz formularz.</small>}</div>}
    {conflict && <Dialog title="Zmiana wymaga decyzji" onClose={() => toast('Konflikt pozostaje w kolejce. Wybierz zastosowanie lub pominięcie zmiany.')}><p>{conflict.error || 'Kalendarz zmienił się na innym urządzeniu.'}</p><p><strong>Operacja:</strong> {({ create_calendar: 'Nowy kalendarz', rename_calendar: 'Zmiana nazwy kalendarza', create_label: 'Nowe oznaczenie', update_label: 'Edycja oznaczenia', set_label_status: 'Archiwizacja / przywrócenie', assign_label: 'Dodanie do dnia', unassign_label: 'Usunięcie z dnia', create_and_assign: 'Nowe oznaczenie w dniu', promote_label: 'Zapis na liście', update_preferences: 'Zmiana wyglądu', delete_label: 'Usunięcie wszędzie', replace_from_backup: 'Import wszystkich kalendarzy' })[conflict.type]}</p>{typeof conflict.payload.calendar_id === 'string' && <p>Kalendarz: {view.snapshot?.calendars.find(c => c.id === conflict.payload.calendar_id)?.name || 'Nie istnieje'}</p>}{typeof conflict.payload.day === 'string' && <p>Data: {conflict.payload.day}</p>}<div className="conflict-values"><div><h3>Aktualnie na serwerze</h3><p>{serverLabel ? `${serverLabel.emoji} ${serverLabel.name} · ${serverLabel.color_hex} · ${serverLabel.status === 'archived' ? 'Archiwalne' : 'Aktywne'}` : conflict.type === 'rename_calendar' ? view.confirmed?.calendars.find(c => c.id === conflict.payload.calendar_id)?.name || 'Kalendarz nie istnieje' : conflict.type === 'update_preferences' ? JSON.stringify(view.confirmed?.preferences) : 'Definicja nie istnieje lub operacja dotyczy całego kalendarza.'}</p></div><div><h3>Twoja propozycja</h3><p>{localLabel ? `${localLabel.emoji} ${localLabel.name} · ${localLabel.color_hex}` : String(conflict.payload.name || 'Zmiana zapisana na urządzeniu')}</p></div></div><div className="actions"><button onClick={() => void repository.resolve(conflict.id, false).catch(e => toast(e.message))}>Pomiń moją zmianę</button><button className="primary" onClick={() => void repository.resolve(conflict.id, true).catch(e => toast(e.message))}>Zastosuj moją zmianę</button></div><p className="hint">Usuniętych definicji nie odtwarzamy automatycznie. Możesz pominąć zmianę i jawnie utworzyć nowe oznaczenie w dniu.</p></Dialog>}
  </div></AppContext.Provider>;
}
export function App() {
  const [session, setSession] = useState<Session | null>(), [route, setRoute] = useState(readRoute), [recovery, setRecovery] = useState(recovering), [callbackMessage, setCallbackMessage] = useState('');
  const callbackHandled = useRef(false);
  const navigate = useCallback((route: string) => { history.replaceState(null, '', `${location.pathname}#/${route}`); setRoute(route); }, []);
  useEffect(() => {
    const hash = () => { const next = readRoute(); const event = new CustomEvent('calendar:hash-navigation', { cancelable: true, detail: next }); window.dispatchEvent(event); if (!event.defaultPrevented) setRoute(next); }; window.addEventListener('hashchange', hash);
    const accept = (value: Session | null) => {
      if (callback && !recovering && value && !callbackHandled.current) {
        callbackHandled.current = true;
        queueMicrotask(() => { void supabase.auth.signOut({ scope: 'local' }).then(() => { setSession(null); navigate('login'); setCallbackMessage('Konto potwierdzone. Zaloguj się nazwą użytkownika.'); }); });
      } else setSession(value);
    };
    const { data } = supabase.auth.onAuthStateChange((event, value) => { if (event === 'PASSWORD_RECOVERY') { setRecovery(true); navigate('recovery'); setSession(value); } else accept(value); });
    void supabase.auth.getSession().then(({ data, error }) => { if (error) { setCallbackMessage('Nie udało się obsłużyć linku. Otwórz nowy link potwierdzenia lub odzyskiwania.'); setSession(null); } else accept(data.session); });
    return () => { data.subscription.unsubscribe(); window.removeEventListener('hashchange', hash); };
  }, [navigate]);
  if (session === undefined) return <main className="loading-page" role="status">Otwieranie kalendarza…</main>;
  if (!session || recovery) return <>{callbackMessage && <div className="callback-message" role="status">{callbackMessage}</div>}<Auth key={route} mode={route === 'register' ? 'register' : route === 'recovery' ? 'recovery' : 'login'} recovery={recovery} navigate={navigate} completed={() => { setRecovery(false); navigate('calendar'); }} /></>;
  return <CalendarApp key={session.user.id} userId={session.user.id} route={['calendar', 'labels', 'settings'].includes(route) ? route : 'calendar'} navigate={navigate} />;
}
