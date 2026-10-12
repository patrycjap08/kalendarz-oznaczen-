import { appUrl, authClient, email, handler, limit } from '../_shared/http.ts';
Deno.serve(handler(async (req, body) => {
  await limit(req, 'recovery'); const address = email(body.email);
  // Identical response for known and unknown addresses; SMTP is configured in Auth.
  await authClient().auth.resetPasswordForEmail(address, { redirectTo: appUrl() });
  return { message: 'Jeśli konto istnieje, wysłaliśmy instrukcję' };
}));
