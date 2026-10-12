import { handler, HttpError, limit, signInByUsername } from '../_shared/http.ts';
Deno.serve(handler(async (req, body) => {
  const name = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  await limit(req, 'login', name);
  if (!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(name) || typeof body.password !== 'string' || [...body.password].length > 128) throw new HttpError(401, 'Nieprawidłowa nazwa użytkownika lub hasło');
  return { session: await signInByUsername(name, body.password) };
}));
