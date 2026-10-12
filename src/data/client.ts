import { createClient } from '@supabase/supabase-js';
import { DomainError, type DomainCode } from '../domain/types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configurationReady = Boolean(url && key);
let retryAfterMs: number | undefined;
export const supabase = createClient(url || 'https://not-configured.supabase.co', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  global: { fetch: async (input, init) => {
    const response = await fetch(input, init); retryAfterMs = undefined;
    if (response.status === 429) {
      const header = response.headers.get('Retry-After') || '60';
      retryAfterMs = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(1000, Date.parse(header) - Date.now());
      return new Response(JSON.stringify({ message: 'RATE_LIMITED' }), { status: 429, headers: response.headers });
    }
    return response;
  } },
});
const messages: Record<DomainCode, string> = {
  VALIDATION_ERROR: 'Sprawdź poprawność danych.', NAME_CONFLICT: 'Oznaczenie o tej nazwie już istnieje. Sprawdź także archiwum.',
  LABEL_NOT_FOUND: 'Oznaczenie już nie istnieje.', LABEL_ARCHIVED: 'Najpierw przywróć oznaczenie z archiwum.',
  REVISION_CONFLICT: 'Kalendarz zmienił się na innym urządzeniu.', AUTH_REQUIRED: 'Sesja wygasła. Zaloguj się ponownie na to samo konto.',
  FORBIDDEN: 'Brak uprawnień do tej operacji.', RATE_LIMITED: 'Zbyt wiele prób. Spróbuj ponownie później.', TEMPORARY_FAILURE: 'Nie udało się połączyć z serwerem. Spróbuj ponownie.',
};
export function domainError(error: { message?: string; code?: string; details?: string }): DomainError {
  const code = ['PGRST301', 'PGRST302', 'PGRST303'].includes(error.code || '') ? 'AUTH_REQUIRED' : Object.keys(messages).find(code => error.message === code || error.code === code) as DomainCode | undefined;
  return new DomainError(code || 'TEMPORARY_FAILURE', messages[code || 'TEMPORARY_FAILURE'], code === 'RATE_LIMITED' ? retryAfterMs : undefined);
}
export const authRedirect = () => `${location.origin}${import.meta.env.BASE_URL}index.html`;
export async function authFunction(name: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!navigator.onLine) throw new Error('Ta czynność wymaga internetu.');
  const session = (await supabase.auth.getSession()).data.session;
  const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || (response.status === 429 ? 'Zbyt wiele prób. Spróbuj później.' : 'Nie udało się wykonać tej czynności.'));
  return data;
}
