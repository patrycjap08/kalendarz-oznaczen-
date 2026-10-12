import { db } from './database';
import { supabase, domainError } from './client';
import { applyOperation, project } from '../domain/operations';
import { DomainError, SCHEMA_VERSION, type DayLabel, type Label, type Operation, type OperationType, type Payload, type Preferences, type Snapshot } from '../domain/types';
type MutationResult = { schema_version: number; revision: string; requires_snapshot: boolean; labels: Label[]; day_labels: DayLabel[]; deleted_label_ids: string[]; deleted_day_ids: string[]; preferences?: Preferences };
export function mergeResult(snapshot: Snapshot, result: MutationResult): Snapshot {
  if (BigInt(snapshot.revision) >= BigInt(result.revision)) return snapshot;
  const labels = new Map(snapshot.labels.map(l => [l.id, l])), days = new Map(snapshot.day_labels.map(d => [d.id, d]));
  result.deleted_label_ids.forEach(id => labels.delete(id)); result.deleted_day_ids.forEach(id => days.delete(id));
  result.labels.forEach(l => labels.set(l.id, l)); result.day_labels.forEach(d => days.set(d.id, d));
  return { ...snapshot, revision: result.revision, labels: [...labels.values()], day_labels: [...days.values()], preferences: result.preferences || snapshot.preferences };
}
export type RepositoryView = { confirmed?: Snapshot; snapshot?: Snapshot; queue: Operation[]; failures: Map<string, string>; error?: string; syncing: boolean; online: boolean };
export const emptyView = (): RepositoryView => ({ queue: [], failures: new Map(), syncing: false, online: navigator.onLine });
export class Repository {
  readonly owner = crypto.randomUUID();
  readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('moj-kalendarz') : undefined;
  view = emptyView();
  private listeners = new Set<() => void>();
  private disposed = false;
  private inFlight = false;
  private timer?: ReturnType<typeof setTimeout>;
  private polling?: ReturnType<typeof setInterval>;
  private renew?: ReturnType<typeof setInterval>;
  private retry = 0;
  constructor(readonly userId: string) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.view;
  private notify(view: Partial<RepositoryView> = {}) { if (this.disposed) return; this.view = { ...this.view, ...view }; this.listeners.forEach(l => l()); }
  async reload(): Promise<void> {
    const [stored, queue] = await Promise.all([db.snapshots.get(this.userId), db.operations.where('user_id').equals(this.userId).sortBy('sequence')]);
    if (this.disposed) return;
    const projected = stored ? project(stored.snapshot, queue) : undefined;
    this.notify({ confirmed: stored?.snapshot, snapshot: projected?.snapshot, queue, failures: projected?.failures || new Map(), online: navigator.onLine });
  }
  private broadcast() { this.channel?.postMessage({ user_id: this.userId }); }
  async start() {
    this.channel?.addEventListener('message', this.onMessage);
    window.addEventListener('online', this.onWake); window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.polling = setInterval(() => { void this.sync(); }, 30_000);
    try { await this.reload(); await this.sync(); } catch { this.notify({ error: 'Nie udało się odczytać pamięci urządzenia. Nie usuwaj danych przeglądarki, jeśli masz oczekujące zmiany.' }); }
  }
  private onMessage = (event: MessageEvent) => { if (event.data?.user_id === this.userId) void this.reload(); };
  private onWake = () => { this.notify({ online: navigator.onLine }); void this.sync(); };
  private onOffline = () => { this.notify({ online: false }); };
  private onVisibility = () => { if (document.visibilityState === 'visible') this.onWake(); };
  async enqueue(type: OperationType, payload: Payload) {
    const op: Operation = { id: crypto.randomUUID(), user_id: this.userId, type, payload, created_at: new Date().toISOString(), state: 'pending' };
    await db.transaction('rw', db.snapshots, db.operations, async () => {
      const stored = await db.snapshots.get(this.userId);
      if (!stored) throw new Error('Najpierw pobierz historię przez internet.');
      const queue = await db.operations.where('user_id').equals(this.userId).sortBy('sequence');
      const state = project(stored.snapshot, queue);
      applyOperation(state.snapshot, op); // Validate before committing the local queue.
      if (type === 'delete_label' || type === 'replace_from_backup') {
        if (!navigator.onLine || queue.length) throw new Error('Ta czynność wymaga internetu i pustej kolejki synchronizacji.');
      }
      await db.operations.add(op);
    });
    await this.reload(); this.broadcast(); void this.sync(); return op.id;
  }
  async refreshOnline(): Promise<Snapshot> {
    if (!navigator.onLine || this.view.queue.length || this.inFlight) throw new Error('Najpierw zsynchronizuj oczekujące zmiany.');
    const { data, error } = await supabase.rpc('get_calendar_snapshot');
    if (error) throw domainError(error);
    this.checkVersion(data);
    await db.snapshots.put({ user_id: this.userId, snapshot: data }); await this.reload(); this.broadcast(); return data;
  }
  private checkVersion(snapshot: Snapshot) {
    if (snapshot.schema_version !== SCHEMA_VERSION || (snapshot as Snapshot & { minimum_protocol_version?: number }).minimum_protocol_version! > SCHEMA_VERSION) throw new DomainError('VALIDATION_ERROR', 'Dostępna jest nowa wersja aplikacji. Zaktualizuj ją; kolejka zostanie zachowana.');
  }
  private async acquireLease(): Promise<boolean> {
    return db.transaction('rw', db.leases, async () => {
      const lease = await db.leases.get(this.userId);
      if (lease && lease.owner !== this.owner && lease.expires_at > Date.now()) return false;
      await db.leases.put({ user_id: this.userId, owner: this.owner, expires_at: Date.now() + 15_000 }); return true;
    });
  }
  private async renewLease() {
    await db.transaction('rw', db.leases, async () => {
      const lease = await db.leases.get(this.userId);
      if (lease?.owner === this.owner) await db.leases.put({ ...lease, expires_at: Date.now() + 15_000 });
    });
  }
  private async releaseLease() {
    await db.transaction('rw', db.leases, async () => { if ((await db.leases.get(this.userId))?.owner === this.owner) await db.leases.delete(this.userId); });
  }
  async sync(): Promise<void> {
    if (this.disposed || this.inFlight || !navigator.onLine) return;
    this.inFlight = true;
    let leased = false;
    try {
      leased = await this.acquireLease(); if (!leased) return;
      this.renew = setInterval(() => { void this.renewLease().catch(() => {}); }, 5_000);
      this.notify({ syncing: true, error: undefined });
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session || auth.session.user.id !== this.userId) throw new DomainError('AUTH_REQUIRED', 'Sesja wygasła. Zaloguj się ponownie na to samo konto.');
      if (this.view.confirmed) {
        const { data, error } = await supabase.rpc('get_calendar_revision');
        if (error) throw domainError(error);
        if (data !== this.view.confirmed.revision && this.view.queue.length) {
          // Do not preemptively flag a conflict: the first queued ID may already be committed.
          // The mutation checks idempotency before comparing revisions.
        } else if (data !== this.view.confirmed.revision) await this.download();
      } else await this.download();
      await this.reload();
      while (!this.disposed) {
        const op = this.view.queue[0]; if (!op || op.state === 'conflict') break;
        if (this.view.failures.has(op.id)) { await db.operations.update(op.sequence!, { state: 'conflict', error: this.view.failures.get(op.id) }); break; }
        const { data, error } = await supabase.rpc('apply_calendar_operation', { operation_id: op.id, expected_revision: this.view.confirmed!.revision, operation_type: op.type, payload: op.payload, client_schema_version: SCHEMA_VERSION });
        if (error) {
          const issue = domainError(error);
          if (issue.code === 'REVISION_CONFLICT') await this.download();
          if (!['TEMPORARY_FAILURE', 'AUTH_REQUIRED', 'RATE_LIMITED'].includes(issue.code)) await db.operations.update(op.sequence!, { state: 'conflict', error: issue.message });
          throw issue;
        }
        if (data.schema_version !== SCHEMA_VERSION) throw new DomainError('VALIDATION_ERROR', 'Zaktualizuj aplikację. Kolejka zostanie zachowana.');
        let replacement: Snapshot | undefined;
        if (data.requires_snapshot) {
          const response = await supabase.rpc('get_calendar_snapshot'); if (response.error) throw domainError(response.error);
          this.checkVersion(response.data); replacement = response.data;
        }
        await db.transaction('rw', db.snapshots, db.operations, async () => {
          const stored = await db.snapshots.get(this.userId); if (!stored) throw new Error('Brak potwierdzonego stanu.');
          await db.snapshots.put({ user_id: this.userId, snapshot: replacement || mergeResult(stored.snapshot, data) });
          await db.operations.delete(op.sequence!);
        });
        this.retry = 0; await this.reload(); this.broadcast();
      }
      this.retry = 0;
    } catch (error) {
      this.notify({ error: error instanceof Error ? error.message : 'Błąd synchronizacji.' });
      if (!(error instanceof DomainError) || error.code === 'TEMPORARY_FAILURE' || error.code === 'RATE_LIMITED') {
        const delay = error instanceof DomainError && error.retryAfterMs ? error.retryAfterMs : Math.min(60_000, 1000 * 2 ** this.retry++) * (0.85 + Math.random() * 0.3);
        clearTimeout(this.timer); this.timer = setTimeout(() => { void this.sync(); }, delay);
      }
    } finally {
      clearInterval(this.renew);
      if (leased) await this.releaseLease().catch(() => {});
      this.inFlight = false; await this.reload().catch(() => {}); this.notify({ syncing: false }); this.broadcast();
    }
  }
  private async download() {
    const { data, error } = await supabase.rpc('get_calendar_snapshot'); if (error) throw domainError(error);
    this.checkVersion(data); await db.snapshots.put({ user_id: this.userId, snapshot: data });
  }
  async resolve(id: string, keep: boolean) {
    if (this.inFlight) throw new Error('Poczekaj na zakończenie synchronizacji.');
    await db.transaction('rw', db.operations, db.snapshots, async () => {
      const op = await db.operations.where('id').equals(id).first(); if (!op || op.user_id !== this.userId) return;
      if (keep) {
        const stored = await db.snapshots.get(this.userId); if (!stored) throw new Error('Brak pobranej historii.');
        applyOperation(stored.snapshot, op);
        await db.operations.update(op.sequence!, { id: crypto.randomUUID(), state: 'pending', error: undefined });
      } else await db.operations.delete(op.sequence!);
    });
    await this.reload(); this.broadcast(); void this.sync();
  }
  async logout(discard = false) {
    if (this.inFlight) throw new Error('Poczekaj na zakończenie synchronizacji.');
    await db.transaction('rw', db.snapshots, db.operations, db.leases, async () => {
      const queued = await db.operations.where('user_id').equals(this.userId).count();
      if (queued && !discard) throw new Error('Najpierw zsynchronizuj oczekujące zmiany.');
      await db.snapshots.delete(this.userId); await db.operations.where('user_id').equals(this.userId).delete(); await db.leases.delete(this.userId);
    });
    this.dispose();
    await supabase.auth.signOut({ scope: 'local' });
  }
  dispose() {
    this.disposed = true; clearInterval(this.polling); clearInterval(this.renew); clearTimeout(this.timer);
    window.removeEventListener('online', this.onWake); window.removeEventListener('offline', this.onOffline); document.removeEventListener('visibilitychange', this.onVisibility);
    this.channel?.close(); this.listeners.clear();
  }
}
