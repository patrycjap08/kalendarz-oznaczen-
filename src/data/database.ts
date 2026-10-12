import Dexie, { type Table } from 'dexie';
import type { Operation, Snapshot } from '../domain/types';
export type StoredSnapshot = { user_id: string; snapshot: Snapshot };
export type Lease = { user_id: string; owner: string; expires_at: number };
export type CalendarSelection = { user_id: string; calendar_id: string };
export class CalendarDatabase extends Dexie {
  snapshots!: Table<StoredSnapshot, string>;
  operations!: Table<Operation, number>;
  leases!: Table<Lease, string>;
  selections!: Table<CalendarSelection, string>;
  constructor(name = 'moj-kalendarz-v1') {
    super(name);
    this.version(1).stores({ snapshots: 'user_id', operations: '++sequence,&id,user_id', leases: 'user_id' });
    this.version(2).stores({ snapshots: 'user_id', operations: '++sequence,&id,user_id', leases: 'user_id', selections: 'user_id' }).upgrade(async transaction => {
      const snapshots = await transaction.table<StoredSnapshot, string>('snapshots').toArray();
      for (const stored of snapshots) {
        if (stored.snapshot.schema_version !== 1) continue;
        const first = (await transaction.table<Operation, number>('operations').where('user_id').equals(stored.user_id).sortBy('sequence'))[0];
        // Keep old IDs and payloads for idempotent retries. Preserve the old revision for conflict detection.
        if (first && first.expected_revision === undefined) await transaction.table('operations').update(first.sequence!, { expected_revision: stored.snapshot.revision });
      }
    });
  }
}
export const db = new CalendarDatabase();
