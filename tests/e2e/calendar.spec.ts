import { expect, test, type Page } from '@playwright/test';
import { applyOperation } from '../../src/domain/operations';
import { DEFAULT_PREFERENCES, type Snapshot } from '../../src/domain/types';
const userId = '00000000-0000-4000-8000-000000000001';
async function mockAccount(page: Page, entries = 9) {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-12T00:00:00Z' };
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.test-signature`;
  const session = { access_token: token, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user };
  let snapshot: Snapshot = { schema_version: 1, revision: '0', profile: { username: 'testkonto' }, preferences: DEFAULT_PREFERENCES,
    labels: Array.from({ length: entries }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name: `Oznaczenie ${i + 1}`, emoji: '🌿', color_hex: ['#8AAE92', '#DDAE83', '#8BA7CC'][i % 3], kind: 'reusable', status: 'active', created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z' })),
    day_labels: Array.from({ length: entries }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, label_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, day: '2026-10-12', created_at: '2026-10-12T00:00:00Z' })),
  };
  await page.route('https://pmdkppkgnihscupgthxh.supabase.co/**', async route => {
    const url = route.request().url(), path = new URL(url).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (path.endsWith('/functions/v1/login')) return respond({ session });
    if (path.includes('/auth/v1/user')) return respond(user);
    if (path.includes('/auth/v1/token')) return respond(session);
    if (path.includes('/auth/v1/logout')) return respond({});
    if (path.endsWith('/rpc/get_calendar_snapshot')) return respond(snapshot);
    if (path.endsWith('/rpc/get_calendar_revision')) return respond(snapshot.revision);
    if (path.endsWith('/rpc/apply_calendar_operation')) {
      const body = route.request().postDataJSON();
      if (body.expected_revision !== snapshot.revision) return respond({ message: 'REVISION_CONFLICT' }, 400);
      const before = snapshot;
      snapshot = applyOperation(snapshot, { id: body.operation_id, user_id: userId, type: body.operation_type, payload: body.payload, state: 'pending', created_at: new Date().toISOString() });
      snapshot.revision = String(BigInt(before.revision) + 1n);
      return respond({ operation_id: body.operation_id, schema_version: 1, revision: snapshot.revision, labels: snapshot.labels, day_labels: snapshot.day_labels, deleted_label_ids: before.labels.filter(l => !snapshot.labels.some(n => n.id === l.id)).map(l => l.id), deleted_day_ids: before.day_labels.filter(d => !snapshot.day_labels.some(n => n.id === d.id)).map(d => d.id), preferences: snapshot.preferences });
    }
    return respond({ message: 'Unhandled mocked endpoint' }, 500);
  });
  await page.goto('#/login');
  await page.getByLabel('Nazwa użytkownika').fill('testkonto'); await page.getByLabel('Hasło', { exact: true }).fill('testowe hasło 123'); await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByText('Zapisano · zsynchronizowano', { exact: true })).toBeVisible();
  return { snapshot: () => snapshot };
}
test('logowanie, 42 pola, wszystkie wpisy dnia i overflow', async ({ page }) => {
  await mockAccount(page);
  await expect(page.locator('.calendar-grid .day-cell')).toHaveCount(42);
  const day = page.getByRole('button', { name: /12 października 2026,/ });
  await expect(day.locator('.marker-dot')).toHaveCount(6); await expect(day.getByText('+3', { exact: true })).toBeVisible();
  await day.click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('button', { name: /^Usuń .* z dnia$/ })).toHaveCount(9);
});
test('nowe jednorazowe oznaczenie oraz usunięcie z dnia', async ({ page }) => {
  await mockAccount(page, 0);
  await page.locator('.calendar-grid .day-cell').nth(15).click();
  await page.getByRole('button', { name: '＋ Nowe oznaczenie', exact: true }).click();
  await page.getByLabel('Nazwa', { exact: true }).fill('Ważny dzień');
  await expect(page.getByLabel('Zapisz także na liście oznaczeń')).not.toBeChecked();
  await page.getByRole('button', { name: 'Zapisz oznaczenie', exact: true }).click();
  await expect(page.getByText('Ważny dzień', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Usuń Ważny dzień z dnia', exact: true }).click(); await expect(page.getByText('Ten dzień jest jeszcze pusty.')).toBeVisible();
});
test('wygląd jest roboczy, sześć pasów pionowych oraz przywrócenie', async ({ page }) => {
  await mockAccount(page);
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).click();
  await page.getByLabel('Sposób wyświetlania').selectOption('vertical'); await page.getByLabel('Tryb jasności').selectOption('dark');
  await expect(page.locator('.settings-preview')).toHaveClass(/theme-dark/);
  await page.getByRole('button', { name: 'Kalendarz', exact: true }).click(); await expect(page.getByText('Niezapisane ustawienia', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Wróć', exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await page.getByRole('button', { name: 'Kalendarz', exact: true }).click();
  const day = page.getByRole('button', { name: /12 października 2026,/ });
  await expect(day.locator('.stripes > span')).toHaveCount(6); await expect(day.locator('.stripe-emoji')).toHaveCount(0); await expect(day.getByText('+3', { exact: true })).toBeVisible();
  const bounds = await page.locator('.calendar-grid').boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(390);
});
test('zmiana offline pozostaje w IndexedDB i synchronizuje się po powrocie sieci', async ({ page, context }) => {
  await mockAccount(page, 0); await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; if (!registration.active) throw new Error('No active service worker'); });
  await context.setOffline(true);
  await page.locator('.calendar-grid .day-cell').nth(15).click(); await page.getByRole('button', { name: '＋ Nowe oznaczenie' }).click();
  await page.getByLabel('Nazwa', { exact: true }).fill('Offline'); await page.getByRole('button', { name: 'Zapisz oznaczenie', exact: true }).click();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await page.reload(); await expect(page.locator('.sync-status')).toContainText('zmian oczekuje');
  await context.setOffline(false); await expect(page.locator('.sync-status')).toContainText('Zapisano · zsynchronizowano');
  const cached = await page.evaluate(async () => { const names = await caches.keys(); const urls: string[] = []; for (const name of names) for (const req of await (await caches.open(name)).keys()) urls.push(req.url); return urls; });
  expect(cached.some(url => url.includes('supabase.co'))).toBe(false);
});
test('układ 320 px nie wychodzi poza ekran', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await mockAccount(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const day = page.getByRole('button', { name: /12 października 2026,/ }); await expect(day.locator('.marker-dot')).toHaveCount(6);
});
