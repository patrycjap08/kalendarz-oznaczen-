import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarDatabase } from '../src/data/database';
import { DEFAULT_PREFERENCES } from '../src/domain/types';
import { legacyCalendar } from '../src/domain/calendars';
import Dexie from 'dexie';
const databases: CalendarDatabase[] = [];
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });
describe('trwałość IndexedDB', () => {
  it('przetrzymuje kolejkę po zamknięciu i oddziela konta', async () => {
    const name = crypto.randomUUID(), user = crypto.randomUUID(), other = crypto.randomUUID();
    const db = new CalendarDatabase(name); databases.push(db);
    await db.transaction('rw', db.snapshots, db.operations, async () => {
      await db.snapshots.put({ user_id: user, snapshot: { schema_version: 2, revision: '0', profile: { username: 'test' }, calendars: [legacyCalendar()], preferences: DEFAULT_PREFERENCES, labels: [], day_labels: [] } });
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
  it('aktualizacja starej bazy zachowuje ID, payload i revision pierwszej operacji', async () => {
    const name = crypto.randomUUID(), user = crypto.randomUUID(), id = crypto.randomUUID(), payload = { label_id: crypto.randomUUID(), name: 'Przed aktualizacją', emoji: '🌿', color: '#8AAE92' };
    const old = new Dexie(name); old.version(1).stores({ snapshots: 'user_id', operations: '++sequence,&id,user_id', leases: 'user_id' });
    await old.table('snapshots').put({ user_id: user, snapshot: { schema_version: 1, revision: '123', profile: { username: 'test' }, preferences: DEFAULT_PREFERENCES, labels: [], day_labels: [] } });
    await old.table('operations').add({ id, user_id: user, type: 'create_label', payload, state: 'pending', created_at: '2026-10-12T12:00:00Z' }); old.close();
    const next = new CalendarDatabase(name); databases.push(next); await next.open();
    const first = await next.operations.where('id').equals(id).first(); expect(first?.expected_revision).toBe('123'); expect(first?.payload).toEqual(payload); expect(first?.id).toBe(id); expect(await next.operations.count()).toBe(1);
  });
});
