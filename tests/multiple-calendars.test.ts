import { describe, expect, it } from 'vitest';
import { applyOperation } from '../src/domain/operations';
import { calendarSnapshot, legacyCalendar, normalizeSnapshot } from '../src/domain/calendars';
import { remapBackup, validateBackup } from '../src/domain/validation';
import { DEFAULT_PREFERENCES, LEGACY_CALENDAR_ID, type Operation, type Snapshot } from '../src/domain/types';
const initial = (): Snapshot => ({ schema_version: 2, revision: '0', profile: { username: 'test' }, preferences: DEFAULT_PREFERENCES, calendars: [legacyCalendar()], labels: [], day_labels: [] });
const operation = (type: Operation['type'], payload: Operation['payload']): Operation => ({ id: crypto.randomUUID(), user_id: crypto.randomUUID(), type, payload, state: 'pending', created_at: '2026-10-12T12:00:00Z' });
describe('osobne kalendarze', () => {
  it('te same nazwy oznaczeń są dozwolone w różnych kalendarzach i edycja jest lokalna', () => {
    const second = crypto.randomUUID(), firstLabel = crypto.randomUUID(), secondLabel = crypto.randomUUID();
    let s = applyOperation(initial(), operation('create_calendar', { calendar_id: second, name: 'Praca' }));
    for (const [calendar_id, label_id] of [[LEGACY_CALENDAR_ID, firstLabel], [second, secondLabel]]) s = applyOperation(s, operation('create_and_assign', { calendar_id, label_id, day_label_id: crypto.randomUUID(), day: '2026-10-12', name: 'Spotkanie', emoji: '🌿', color: '#8AAE92', kind: 'reusable' }));
    s = applyOperation(s, operation('update_label', { calendar_id: second, label_id: secondLabel, name: 'Praca z zespołem', emoji: '📚', color: '#FFFFFF' }));
    expect(calendarSnapshot(s, LEGACY_CALENDAR_ID)?.labels[0].name).toBe('Spotkanie'); expect(calendarSnapshot(s, second)?.labels[0].name).toBe('Praca z zespołem');
    expect(calendarSnapshot(s, second)?.day_labels).toHaveLength(1);
    expect(() => applyOperation(s, operation('assign_label', { calendar_id: second, label_id: firstLabel, day: '2026-10-13', day_label_id: crypto.randomUUID() }))).toThrow();
  });
  it('usuwanie definicji nie dotyka drugiego kalendarza', () => {
    const second = crypto.randomUUID(), label = crypto.randomUUID();
    let s = applyOperation(initial(), operation('create_calendar', { calendar_id: second, name: 'Praca' }));
    s = applyOperation(s, operation('create_and_assign', { calendar_id: second, label_id: label, name: 'Praca', emoji: '🌿', color: '#8AAE92', kind: 'reusable', day: '2026-10-12', day_label_id: crypto.randomUUID() }));
    expect(() => applyOperation(s, operation('delete_label', { calendar_id: LEGACY_CALENDAR_ID, label_id: label }))).toThrow(); expect(s.day_labels).toHaveLength(1);
  });
  it('stara historia jest czytelna offline i stare payloady nadal trafiają do pierwszego kalendarza', () => {
    const old = { schema_version: 1, revision: '15', profile: { username: 'test' }, labels: [], day_labels: [], preferences: DEFAULT_PREFERENCES } as unknown as Snapshot;
    const next = normalizeSnapshot(old); const pending = operation('create_label', { label_id: crypto.randomUUID(), name: 'Stare urządzenie', emoji: '🌿', color: '#8AAE92' });
    const result = applyOperation(next, pending); expect(result.labels[0].calendar_id).toBe(LEGACY_CALENDAR_ID); expect(old.schema_version).toBe(1); expect(pending.payload).not.toHaveProperty('calendar_id');
  });
  it('kopie obejmują relacje między kalendarzami i mapują wszystkie UUID', () => {
    const second = crypto.randomUUID(); let s = applyOperation(initial(), operation('create_calendar', { calendar_id: second, name: 'Praca' }));
    s = applyOperation(s, operation('create_and_assign', { calendar_id: second, label_id: crypto.randomUUID(), day_label_id: crypto.randomUUID(), day: '2026-10-12', name: 'Jednorazowe', emoji: '🌿', color: '#8AAE92', kind: 'one_off' }));
    const backup = validateBackup({ ...s, exported_at: '2026-10-12T12:00:00Z' }), mapped = remapBackup(backup);
    expect(mapped.calendars.map(c => c.id)).not.toEqual(backup.calendars.map(c => c.id)); expect(mapped.labels[0].calendar_id).toBe(mapped.calendars[1].id); expect(mapped.day_labels[0].calendar_id).toBe(mapped.labels[0].calendar_id);
    expect(() => validateBackup({ ...backup, day_labels: backup.day_labels.map(d => ({ ...d, calendar_id: LEGACY_CALENDAR_ID })) })).toThrow();
  });
  it('import starszej kopii tworzy jeden kalendarz i nie zmienia pliku wejściowego', () => {
    const old = { schema_version: 1, exported_at: '2026-10-12T12:00:00Z', labels: [], day_labels: [], preferences: DEFAULT_PREFERENCES };
    const backup = validateBackup(old); expect(backup.schema_version).toBe(2); expect(backup.calendars).toHaveLength(1); expect(old).not.toHaveProperty('calendars');
  });
});
