import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarDatabase } from '../src/data/database';
import { DEFAULT_PREFERENCES } from '../src/domain/types';
const databases: CalendarDatabase[] = [];
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });
describe('trwałość IndexedDB', () => {
  it('przetrzymuje kolejkę po zamknięciu i oddziela konta', async () => {
    const name = crypto.randomUUID(), user = crypto.randomUUID(), other = crypto.randomUUID();
    const db = new CalendarDatabase(name); databases.push(db);
    await db.transaction('rw', db.snapshots, db.operations, async () => {
      await db.snapshots.put({ user_id: user, snapshot: { schema_version: 1, revision: '0', profile: { username: 'test' }, preferences: DEFAULT_PREFERENCES, labels: [], day_labels: [] } });
      await db.operations.add({ id: crypto.randomUUID(), user_id: user, type: 'create_label', payload: {}, created_at: new Date().toISOString(), state: 'pending' });
    });
    db.close(); const reopened = new CalendarDatabase(name); databases.push(reopened);
    expect(await reopened.operations.where('user_id').equals(user).count()).toBe(1); expect(await reopened.operations.where('user_id').equals(other).count()).toBe(0); expect(await reopened.snapshots.get(other)).toBeUndefined();
  });
  it('wycofuje całą transakcję lokalną po błędzie', async () => {
    const db = new CalendarDatabase(crypto.randomUUID()); databases.push(db);
    await expect(db.transaction('rw', db.operations, async () => { await db.operations.add({ id: crypto.randomUUID(), user_id: 'user', type: 'create_label', payload: {}, created_at: '', state: 'pending' }); throw new Error('Storage failure'); })).rejects.toThrow();
    expect(await db.operations.count()).toBe(0);
  });
});
