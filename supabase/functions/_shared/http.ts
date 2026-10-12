import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
export const authClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
export const appUrl = () => Deno.env.get('APP_URL')!;
export class HttpError extends Error { constructor(public status: number, message: string, public retryAfter?: number) { super(message); } }
export function respond(req: Request, body: unknown, status = 200, retryAfter?: number): Response {
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim());
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
  } });
}
export function handler(fn: (request: Request, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return respond(req, {});
    if (req.method !== 'POST') return respond(req, { message: 'Niedozwolona metoda.' }, 405);
    const origin = req.headers.get('origin');
    if (origin && !(Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).includes(origin)) return respond(req, { message: 'Niedozwolone źródło.' }, 403);
    try {
      if (Number(req.headers.get('content-length')) > 16_384) throw new HttpError(400, 'Zbyt duże żądanie.');
      const raw = await req.text(); if (new TextEncoder().encode(raw).length > 16_384) throw new HttpError(400, 'Zbyt duże żądanie.');
      const body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Niepoprawne dane.');
      return respond(req, await fn(req, body));
    } catch (error) {
      // Do not log request bodies, passwords, tokens, emails or private labels.
      if (error instanceof HttpError) return respond(req, { message: error.message }, error.status, error.retryAfter);
      return respond(req, { message: 'Usługa jest chwilowo niedostępna. Spróbuj ponownie.' }, 503);
    }
  };
}
export function username(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/.test(value.trim())) throw new HttpError(400, 'Nazwa użytkownika musi mieć 3–30 znaków: litery ASCII, cyfry, _, - lub kropka.');
  return value.trim();
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 12 || [...value].length > 128) throw new HttpError(400, 'Hasło musi mieć 12–128 znaków.'); return value;
}
export function email(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new HttpError(400, 'Podaj poprawny adres e-mail.'); return value.trim();
}
export async function limit(req: Request, operation: string, identifier = '') {
  const salt = Deno.env.get('AUTH_RATE_LIMIT_SALT');
  if (!salt) throw new HttpError(503, 'Usługa wymaga konfiguracji limitów.');
  // Supabase gateway overwrites x-forwarded-for. Verify this in production; never use a client-supplied custom IP header.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!ip) throw new HttpError(503, 'Nie można zweryfikować źródła żądania.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const quotas = operation === 'login' ? [{ scope: `${ip}/${identifier}`, count: 10, window: 900 }, { scope: ip, count: 100, window: 900 }] : [{ scope: ip, count: 5, window: 3600 }];
  for (const quota of quotas) {
    const rotation = new Date().toISOString().slice(0, 10);
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${rotation}/${operation}/${quota.scope}`));
    const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const { data, error } = await admin().rpc('consume_auth_limit', { limit_key: hash, limit_count: quota.count, window_seconds: quota.window });
    if (error) throw new HttpError(503, 'Nie udało się sprawdzić limitów.');
    if (data > 0) throw new HttpError(429, 'Zbyt wiele prób. Spróbuj ponownie później.', data);
  }
}
export async function signInByUsername(name: string, secret: string) {
  const service = admin();
  const { data: profile } = await service.from('profiles').select('user_id').eq('username_key', name.trim().toLowerCase()).maybeSingle();
  const account = profile ? await service.auth.admin.getUserById(profile.user_id) : undefined;
  // Execute the same Auth API call even for unknown users; no email is returned before authentication.
  const address = account?.data.user?.email || `missing-${crypto.randomUUID()}@invalid.example`;
  const { data, error } = await authClient().auth.signInWithPassword({ email: address, password: secret });
  if (error || !profile || !data.session) throw new HttpError(401, 'Nieprawidłowa nazwa użytkownika lub hasło');
  return data.session;
}
