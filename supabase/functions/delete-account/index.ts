import { admin, handler, HttpError, limit, signInByUsername } from '../_shared/http.ts';
Deno.serve(handler(async (req, body) => {
  if (body.confirmation !== 'USUŃ KONTO') throw new HttpError(400, 'Potwierdź usunięcie konta.');
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!token) throw new HttpError(401, 'Zaloguj się ponownie.');
  const service = admin(), { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Zaloguj się ponownie.');
  const { data: profile } = await service.from('profiles').select('username').eq('user_id', data.user.id).single();
  if (!profile || typeof body.current_password !== 'string') throw new HttpError(401, 'Zaloguj się ponownie.');
  await limit(req, 'login', profile.username.toLowerCase());
  const verification = await signInByUsername(profile.username, body.current_password);
  if (verification.user.id !== data.user.id) throw new HttpError(403, 'Nie można usunąć tego konta.');
  const { error: deletionError } = await service.auth.admin.deleteUser(data.user.id);
  if (deletionError) throw new HttpError(503, 'Nie udało się usunąć konta.');
  return { message: 'Konto i kalendarz zostały usunięte.' };
}));
