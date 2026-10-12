import { appUrl, authClient, email, handler, HttpError, limit, password, username } from '../_shared/http.ts';
Deno.serve(handler(async (req, body) => {
  await limit(req, 'register');
  const name = username(body.username), address = email(body.email), secret = password(body.password);
  const { error } = await authClient().auth.signUp({ email: address, password: secret, options: { data: { username: name }, emailRedirectTo: appUrl() } });
  if (error) throw new HttpError(400, 'Nie udało się zarejestrować konta. Nazwa może być już zajęta.');
  return { message: 'Sprawdź pocztę i potwierdź konto. Następnie zaloguj się nazwą użytkownika.' };
}));
