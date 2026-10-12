import { useState } from 'react';
import { authFunction, configurationReady, supabase } from '../../data/client';
import { db } from '../../data/database';
import { validatePassword, validateUsername } from '../../domain/validation';
export function Auth({ mode, recovery, navigate, completed }: { mode: 'login' | 'register' | 'recovery'; recovery: boolean; navigate: (route: string) => void; completed: () => void }) {
  const [username, setUsername] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    try {
      if (!configurationReady) throw new Error('Aplikacja wymaga konfiguracji połączenia Supabase.');
      if (mode === 'register') {
        validateUsername(username); validatePassword(password);
        const response = await authFunction('register', { username, email, password }); setMessage(response.message as string);
      } else if (mode === 'recovery' && !recovery) {
        const response = await authFunction('recover-password', { email }); setMessage(response.message as string);
      } else if (mode === 'recovery') {
        validatePassword(password); if (password !== repeat) throw new Error('Hasła muszą być identyczne.');
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw new Error('Nie udało się ustawić hasła. Otwórz nowy link odzyskiwania.');
        await supabase.auth.signOut({ scope: 'local' }); setMessage('Hasło zostało zmienione. Zaloguj się ponownie.'); completed();
      } else {
        const response = await authFunction('login', { username, password });
        const session = response.session as { access_token: string; refresh_token: string; user: { id: string } };
        const queue = await db.operations.toArray();
        if (queue.some(op => op.user_id !== session.user.id)) throw new Error('Na urządzeniu są oczekujące zmiany innego konta. Zaloguj się najpierw na tamto konto, aby je zsynchronizować lub świadomie odrzucić.');
        const result = await supabase.auth.setSession(session); if (result.error) throw new Error('Nie udało się zapisać sesji.'); completed();
      }
    } catch (e) { setError(e instanceof TypeError ? 'Nie udało się połączyć z serwerem. Sprawdź internet i konfigurację funkcji Supabase.' : (e as Error).message); } finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-brand"><span className="brand-icon">▦</span><span>Mój kalendarz</span></div><div className="auth-card"><span className="auth-decoration" aria-hidden="true">🌿</span><p className="eyebrow">MIEJSCE NA TWOJE DNI</p><h1>{mode === 'login' ? 'Dobrze być u siebie.' : mode === 'register' ? 'Twój kalendarz zaczyna się tutaj.' : recovery ? 'Ustaw nowe hasło.' : 'Odzyskaj dostęp.'}</h1><p className="hint">{mode === 'login' ? 'Zaloguj się, aby wrócić do swojego kalendarza.' : mode === 'register' ? 'Jedno konto. Prywatne oznaczenia. Wszystkie Twoje dni.' : 'E-mail służy wyłącznie do potwierdzenia konta i odzyskiwania hasła.'}</p>
    <form className="stack" onSubmit={submit}>
      {mode !== 'recovery' && <label>Nazwa użytkownika<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} required /></label>}
      {(mode === 'register' || (mode === 'recovery' && !recovery)) && <label>Adres e-mail<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>}
      {(mode !== 'recovery' || recovery) && <label>{recovery ? 'Nowe hasło' : 'Hasło'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required />{mode !== 'login' && <small>12–128 znaków; spacje są dozwolone.</small>}</label>}
      {recovery && <label>Powtórz hasło<input type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} required /></label>}
      {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
      <button className="primary" type="submit" disabled={busy || !configurationReady}>{busy ? 'Proszę czekać…' : mode === 'login' ? 'Zaloguj się' : mode === 'register' ? 'Utwórz konto' : recovery ? 'Zapisz nowe hasło' : 'Wyślij instrukcję'}</button>
    </form>
    <div className="auth-links">{mode === 'login' ? <><button className="text-button" onClick={() => navigate('recovery')}>Nie pamiętam hasła</button><p>Nie masz konta? <button className="text-button" onClick={() => navigate('register')}>Zarejestruj się</button></p></> : <button className="text-button" onClick={() => navigate('login')}>Wróć do logowania</button>}</div>
  </div><p className="auth-footer">Prywatna przestrzeń, bez reklam.</p></main>;
}
