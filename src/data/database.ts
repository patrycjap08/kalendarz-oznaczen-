import Dexie, { type Table } from 'dexie';
import type { Operation, Snapshot } from '../domain/types';
export type StoredSnapshot = { user_id: string; snapshot: Snapshot };
export type Lease = { user_id: string; owner: string; expires_at: number };
export class CalendarDatabase extends Dexie {
  snapshots!: Table<StoredSnapshot, string>;
  operations!: Table<Operation, number>;
  leases!: Table<Lease, string>;
  constructor(name = 'moj-kalendarz-v1') {
    super(name);
    this.version(1).stores({ snapshots: 'user_id', operations: '++sequence,&id,user_id', leases: 'user_id' });
  }
}
export const db = new CalendarDatabase();
